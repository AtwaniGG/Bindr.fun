import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { GachaService } from './gacha.service';
import { GachaPriceService } from './gacha-price.service';
import { GachaInventoryService } from './gacha-inventory.service';
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
  ) {}

  @Get('price')
  async getPrice() {
    return this.priceService.getSlabTokenPrice();
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

  @Post('admin/sync-inventory')
  async syncInventory() {
    return this.inventoryService.syncVaultInventory();
  }

  @Post('admin/retry/:pullId')
  async retryPull(@Param('pullId') pullId: string) {
    return this.gachaService.retryFailedTransfer(pullId);
  }

  /**
   * Alchemy webhook — fires when NFTs are transferred TO or FROM the vault.
   * Triggers an inventory re-sync so returned cards become available instantly.
   */
  @Post('webhook/alchemy')
  async alchemyWebhook(
    @Body() body: any,
    @Headers('x-alchemy-signature') signature?: string,
  ) {
    const logger = new Logger('GachaWebhook');

    // Verify signature if ALCHEMY_WEBHOOK_SIGNING_KEY is set
    const signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;
    if (signingKey && signature) {
      const hmac = createHmac('sha256', signingKey);
      hmac.update(JSON.stringify(body));
      const expected = hmac.digest('hex');
      if (signature !== expected) {
        logger.warn('Invalid Alchemy webhook signature');
        throw new BadRequestException('Invalid signature');
      }
    }

    logger.log('Alchemy webhook received — syncing vault inventory');

    // Fire-and-forget sync (don't block the webhook response)
    this.inventoryService.syncVaultInventory().catch((err) => {
      logger.error(`Webhook sync failed: ${err.message}`);
    });

    return { ok: true };
  }

  @Patch('admin/cards/:cardId')
  async updateCard(
    @Param('cardId') cardId: string,
    @Body() body: { tier?: string },
  ) {
    return this.gachaService.updateCardTier(cardId, body.tier);
  }
}
