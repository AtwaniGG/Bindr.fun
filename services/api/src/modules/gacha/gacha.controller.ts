import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { GachaService } from './gacha.service';
import { GachaPriceService } from './gacha-price.service';
import { GachaInventoryService } from './gacha-inventory.service';

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

  @Patch('admin/cards/:cardId')
  async updateCard(
    @Param('cardId') cardId: string,
    @Body() body: { tier?: string },
  ) {
    return this.gachaService.updateCardTier(cardId, body.tier);
  }
}
