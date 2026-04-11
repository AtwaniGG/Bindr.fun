import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GachaPriceService } from './gacha-price.service';
import { GachaInventoryService } from './gacha-inventory.service';
import type {
  GachaPullResponse,
  GachaHistoryItem,
  GachaCardInfo,
} from '@pokedex-slabs/shared';
import { GACHA_VERIFY_QUEUE, GACHA_TRANSFER_QUEUE } from '../../common/bullmq/bullmq.module';

@Injectable()
export class GachaService {
  private readonly logger = new Logger(GachaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceService: GachaPriceService,
    private readonly inventoryService: GachaInventoryService,
    @Inject(GACHA_VERIFY_QUEUE) private readonly verifyQueue: Queue,
    @Inject(GACHA_TRANSFER_QUEUE) private readonly transferQueue: Queue,
  ) {}

  async initiatePull(
    txSignature: string,
    polygonAddress: string,
    solanaAddress: string,
  ): Promise<{ pullId: string; status: string }> {
    // 1. Check if gacha is active
    const config = await this.prisma.gachaConfig.findFirst({
      where: { id: 'default' },
    });
    if (config && !config.isActive) {
      throw new BadRequestException('Gacha is currently paused');
    }

    // 2. Check inventory availability
    const stats = await this.inventoryService.getInventoryStats();
    if (stats.total === 0) {
      throw new BadRequestException('No cards available — inventory empty');
    }

    // 3. Check for duplicate tx signature
    const existing = await this.prisma.gachaPull.findUnique({
      where: { txSignature },
    });
    if (existing) {
      throw new BadRequestException('This transaction has already been submitted');
    }

    // 4. Get current SLAB price for recording
    const price = await this.priceService.getSlabTokenPrice();

    // 5. Create pull record
    const pull = await this.prisma.gachaPull.create({
      data: {
        solanaAddress,
        polygonAddress,
        txSignature,
        burnAmountRaw: price.tokensRequiredRaw,
        burnAmountTokens: parseFloat(price.tokensRequired),
        slabPriceUsd: price.priceUsd,
        status: 'pending',
      },
    });

    // 6. Enqueue burn verification job
    await this.verifyQueue.add('gachaVerifyBurn', {
      pullId: pull.id,
      txSignature,
      solanaAddress,
      requiredAmountRaw: price.tokensRequiredRaw,
    });

    this.logger.log(`Pull ${pull.id} initiated — verifying burn tx ${txSignature}`);

    return { pullId: pull.id, status: pull.status };
  }

  async getPullStatus(pullId: string): Promise<GachaPullResponse> {
    const pull = await this.prisma.gachaPull.findUnique({
      where: { id: pullId },
      include: {
        gachaCard: {
          include: {
            slab: true,
          },
        },
      },
    });

    if (!pull) {
      throw new BadRequestException('Pull not found');
    }

    return {
      pullId: pull.id,
      status: pull.status as any,
      card: pull.gachaCard ? this.mapCardInfo(pull.gachaCard) : null,
      polygonTxHash: pull.polygonTxHash,
      createdAt: pull.createdAt.toISOString(),
    };
  }

  async getPullHistory(opts: {
    wallet?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: GachaHistoryItem[]; total: number; page: number }> {
    const page = opts.page || 1;
    const limit = Math.min(opts.limit || 20, 50);
    const skip = (page - 1) * limit;

    const where: any = { status: 'completed' };
    if (opts.wallet) {
      where.solanaAddress = opts.wallet;
    }

    const [pulls, total] = await Promise.all([
      this.prisma.gachaPull.findMany({
        where,
        include: {
          gachaCard: { include: { slab: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.gachaPull.count({ where }),
    ]);

    return {
      data: pulls.map((pull) => ({
        pullId: pull.id,
        solanaAddress: pull.solanaAddress,
        txSignature: pull.txSignature,
        burnAmountTokens: pull.burnAmountTokens.toString(),
        status: pull.status as any,
        card: pull.gachaCard ? this.mapCardInfo(pull.gachaCard) : null,
        polygonTxHash: pull.polygonTxHash,
        createdAt: pull.createdAt.toISOString(),
      })),
      total,
      page,
    };
  }

  /**
   * Called by the verify worker job after burn is confirmed.
   * Selects a card and enqueues the NFT transfer.
   */
  async processVerifiedBurn(pullId: string): Promise<void> {
    // Update status
    await this.prisma.gachaPull.update({
      where: { id: pullId },
      data: { status: 'selecting' },
    });

    // Select a random card
    const card = await this.inventoryService.selectCardForPull(pullId);

    // Link card to pull
    await this.prisma.gachaPull.update({
      where: { id: pullId },
      data: {
        gachaCardId: card.id,
        status: 'transferring',
      },
    });

    // Enqueue NFT transfer
    await this.transferQueue.add('gachaTransferNft', {
      pullId,
      gachaCardId: card.id,
      tokenId: card.slab.assetRaw.tokenId,
      recipientAddress: (
        await this.prisma.gachaPull.findUnique({ where: { id: pullId } })
      )!.polygonAddress,
    });

    this.logger.log(
      `Pull ${pullId}: card ${card.slab.cardName} (${card.tier}) selected — transferring`,
    );
  }

  /**
   * Called by the transfer worker job on success.
   */
  async completeTransfer(pullId: string, polygonTxHash: string): Promise<void> {
    const pull = await this.prisma.gachaPull.findUnique({
      where: { id: pullId },
    });
    if (!pull || !pull.gachaCardId) return;

    await this.prisma.$transaction([
      this.prisma.gachaPull.update({
        where: { id: pullId },
        data: { status: 'completed', polygonTxHash },
      }),
      this.prisma.gachaCard.update({
        where: { id: pull.gachaCardId },
        data: { status: 'distributed', distributedAt: new Date() },
      }),
    ]);

    this.logger.log(`Pull ${pullId} completed — tx ${polygonTxHash}`);
  }

  /**
   * Called by the transfer worker job after all retries exhausted.
   */
  async handleTransferFailure(
    pullId: string,
    reason: string,
  ): Promise<void> {
    const pull = await this.prisma.gachaPull.findUnique({
      where: { id: pullId },
    });
    if (!pull) return;

    await this.prisma.gachaPull.update({
      where: { id: pullId },
      data: { status: 'refund_needed', failureReason: reason },
    });

    // Release the reserved card back to available
    if (pull.gachaCardId) {
      await this.inventoryService.releaseReservedCard(pull.gachaCardId);
    }

    this.logger.error(`Pull ${pullId} failed permanently: ${reason}`);
  }

  /**
   * Admin: retry a failed transfer by re-enqueuing the transfer job.
   */
  async retryFailedTransfer(pullId: string): Promise<{ status: string }> {
    const pull = await this.prisma.gachaPull.findUnique({
      where: { id: pullId },
      include: {
        gachaCard: {
          include: { slab: { include: { assetRaw: true } } },
        },
      },
    });

    if (!pull) throw new BadRequestException('Pull not found');
    if (pull.status !== 'refund_needed' && pull.status !== 'failed') {
      throw new BadRequestException(`Pull is in status "${pull.status}", cannot retry`);
    }
    if (!pull.gachaCard) {
      throw new BadRequestException('No card assigned to this pull');
    }

    // Re-reserve the card if it was released
    if (pull.gachaCard.status === 'available') {
      await this.prisma.gachaCard.update({
        where: { id: pull.gachaCard.id },
        data: { status: 'reserved', reservedAt: new Date(), reservedByPullId: pullId },
      });
    }

    await this.prisma.gachaPull.update({
      where: { id: pullId },
      data: { status: 'transferring', retryCount: 0 },
    });

    await this.transferQueue.add('gachaTransferNft', {
      pullId,
      gachaCardId: pull.gachaCard.id,
      tokenId: pull.gachaCard.slab.assetRaw.tokenId,
      recipientAddress: pull.polygonAddress,
    });

    this.logger.log(`Pull ${pullId} retry enqueued`);
    return { status: 'transferring' };
  }

  /**
   * Admin: manually override a card's tier.
   */
  async updateCardTier(
    cardId: string,
    tier?: string,
  ): Promise<{ id: string; tier: string; tierOverride: boolean }> {
    const validTiers = ['common', 'uncommon', 'rare', 'ultra_rare'];
    if (!tier || !validTiers.includes(tier)) {
      throw new BadRequestException(`Invalid tier. Must be one of: ${validTiers.join(', ')}`);
    }

    const card = await this.prisma.gachaCard.update({
      where: { id: cardId },
      data: { tier, tierOverride: true },
    });

    return { id: card.id, tier: card.tier, tierOverride: card.tierOverride };
  }

  private mapCardInfo(gachaCard: any): GachaCardInfo {
    return {
      id: gachaCard.id,
      tier: gachaCard.tier,
      cardName: gachaCard.slab?.cardName ?? null,
      setName: gachaCard.slab?.setName ?? null,
      grader: gachaCard.slab?.grader ?? null,
      grade: gachaCard.slab?.grade ?? null,
      imageUrl: gachaCard.slab?.imageUrl ?? null,
      certNumber: gachaCard.slab?.certNumber ?? null,
    };
  }
}
