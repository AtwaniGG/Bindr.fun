import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { GachaService } from './gacha.service';
import { GachaPriceService } from './gacha-price.service';
import { GachaInventoryService } from './gacha-inventory.service';
import { BetaAccessService } from './beta-access.service';
import { GachaVaultSyncService } from './gacha-vault-sync.service';
import { createHmac } from 'crypto';

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TX_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

@Controller('gacha')
export class GachaController {
  constructor(
    private readonly gachaService: GachaService,
    private readonly priceService: GachaPriceService,
    private readonly inventoryService: GachaInventoryService,
    private readonly betaAccess: BetaAccessService,
    private readonly vaultSync: GachaVaultSyncService,
  ) {}

  @Get('price')
  async getPrice() {
    return this.priceService.getSlabTokenPrice();
  }

  @Get('beta/status')
  async getBetaStatus(@Query('solanaAddress') solanaAddress?: string) {
    const { active, priceUsd } = await this.betaAccess.isBetaModeActive();
    const whitelisted =
      solanaAddress && BASE58_RE.test(solanaAddress)
        ? await this.betaAccess.isWhitelisted(solanaAddress)
        : false;
    return { active, priceUsd, whitelisted };
  }

  @Get('wallet/nfts')
  async getWalletNfts(@Query('address') address: string) {
    if (!address || !ETH_ADDRESS_RE.test(address)) {
      throw new BadRequestException('Invalid Polygon address');
    }
    return this.gachaService.getOwnedCourtyardNfts(address.toLowerCase());
  }

  @Post('redeem-code')
  async redeemCode(
    @Body() body: { code: string; solanaAddress: string },
  ) {
    if (!body.code || typeof body.code !== 'string' || body.code.length > 32) {
      throw new BadRequestException('Invalid code');
    }
    if (!body.solanaAddress || !BASE58_RE.test(body.solanaAddress)) {
      throw new BadRequestException('Invalid Solana address');
    }
    const result = await this.betaAccess.redeemCode(body.code, body.solanaAddress);
    return { ok: true, ...result };
  }

  @Get('inventory/stats')
  async getInventoryStats() {
    return this.inventoryService.getInventoryStats();
  }

  @Post('pull')
  async submitPull(
    @Body() body: { txSignature: string; polygonAddress: string; solanaAddress: string },
  ) {
    // Validate inputs
    if (!body.txSignature || !TX_SIG_RE.test(body.txSignature)) {
      throw new BadRequestException('Invalid Solana transaction signature');
    }
    if (!body.polygonAddress || !ETH_ADDRESS_RE.test(body.polygonAddress)) {
      throw new BadRequestException('Invalid Polygon address');
    }
    if (!body.solanaAddress || !BASE58_RE.test(body.solanaAddress)) {
      throw new BadRequestException('Invalid Solana address');
    }

    return this.gachaService.initiatePull(
      body.txSignature,
      body.polygonAddress.toLowerCase(),
      body.solanaAddress,
    );
  }

  @Get('pull/:pullId')
  async getPullStatus(@Param('pullId') pullId: string) {
    return this.gachaService.getPullStatus(pullId);
  }

  @Get('history')
  async getHistory(
    @Query('wallet') wallet?: string,
    @Query('page') page?: string,
  ) {
    return this.gachaService.getPullHistory({
      wallet,
      page: page ? parseInt(page, 10) : undefined,
    });
  }

  // ─── Admin Endpoints ──────────────────────────────────────────────

  @UseGuards(AdminGuard)
  @Post('admin/sync-inventory')
  async syncInventory() {
    return this.inventoryService.syncVaultInventory();
  }

  @UseGuards(AdminGuard)
  @Post('admin/retry/:pullId')
  async retryPull(@Param('pullId') pullId: string) {
    return this.gachaService.retryFailedTransfer(pullId);
  }

  /**
   * Alchemy NFT Activity webhook — fires when ERC-721s transfer involving the vault.
   * For each transfer it reconciles DB state and, on incoming transfers,
   * automatically calls contract.addCards() so the card re-enters rotation.
   */
  @Post('webhook/alchemy')
  async alchemyWebhook(
    @Body() body: any,
    @Headers('x-alchemy-signature') signature?: string,
  ) {
    const logger = new Logger('GachaWebhook');

    const signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;
    if (!signingKey) {
      // Production should always have this; fail closed instead of accepting
      // any request as authentic when the key is missing.
      logger.error('ALCHEMY_WEBHOOK_SIGNING_KEY not configured — rejecting webhook');
      throw new BadRequestException('Webhook not configured');
    }
    if (!signature || typeof signature !== 'string') {
      logger.warn('Webhook missing x-alchemy-signature header');
      throw new BadRequestException('Missing signature');
    }
    const hmac = createHmac('sha256', signingKey);
    hmac.update(JSON.stringify(body));
    const expected = hmac.digest('hex');
    if (signature !== expected) {
      logger.warn('Invalid Alchemy webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    const activity: any[] = Array.isArray(body?.event?.activity) ? body.event.activity : [];
    logger.log(`Alchemy webhook: ${activity.length} activity entries`);

    // Fire-and-forget per-transfer sync.
    // Works for both NFT Activity and Address Activity webhook payloads.
    // Address Activity uses category='token' for everything — so we detect
    // ERC-721 by the presence of erc721TokenId instead of relying on category.
    (async () => {
      for (const a of activity) {
        const tokenIdHex = a.erc721TokenId || a.tokenId;
        if (!tokenIdHex) continue; // not an ERC-721 transfer (ERC-20, native, etc.)
        const contractAddress = a.contractAddress || a.rawContract?.address;
        if (!a.fromAddress || !a.toAddress || !contractAddress) continue;
        try {
          await this.vaultSync.handleTransfer({
            fromAddress: a.fromAddress,
            toAddress: a.toAddress,
            contractAddress,
            tokenIdHex,
            txHash: a.hash || '',
          });
        } catch (err: any) {
          logger.error(`Transfer sync failed: ${err.message}`);
        }
      }
    })().catch((err) => logger.error(`Webhook pipeline failed: ${err.message}`));

    return { ok: true };
  }

  @UseGuards(AdminGuard)
  @Patch('admin/cards/:cardId')
  async updateCard(
    @Param('cardId') cardId: string,
    @Body() body: { tier?: string },
  ) {
    return this.gachaService.updateCardTier(cardId, body.tier);
  }
}
