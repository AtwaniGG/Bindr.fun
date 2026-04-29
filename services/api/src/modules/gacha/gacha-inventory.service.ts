import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { IndexingService } from '../indexing/indexing.service';
import type { GachaTier, GachaInventoryStats } from '@pokedex-slabs/shared';

interface SelectedCard {
  id: string;
  slabId: string;
  tier: string;
  slab: {
    id: string;
    cardName: string | null;
    setName: string | null;
    grader: string | null;
    grade: string | null;
    imageUrl: string | null;
    certNumber: string | null;
    assetRaw: {
      tokenId: string;
      contractAddress: string;
    };
  };
}

@Injectable()
export class GachaInventoryService {
  private readonly logger = new Logger(GachaInventoryService.name);
  private readonly vaultAddress = (process.env.GACHA_VAULT_ADDRESS || '0x52B812Ec8E204541156f1F778B0672bD044a2e79').toLowerCase();

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexingService: IndexingService,
  ) {}

  /**
   * Sync vault inventory: index the vault wallet, then create GachaCard records
   * for any new slabs and auto-assign rarity tiers based on market price.
   */
  async syncVaultInventory(): Promise<{ created: number; updated: number }> {
    this.logger.log('Syncing vault inventory...');

    // Step 1: Re-index the vault wallet via Alchemy
    await this.indexingService.indexAddress(this.vaultAddress);

    // Step 2: Load config for price thresholds
    const config = await this.getConfig();

    // Step 3: Find all slabs in the vault that don't have a GachaCard yet
    const vaultSlabs = await this.prisma.slab.findMany({
      where: {
        assetRaw: { ownerAddress: this.vaultAddress },
        gachaCard: null,
      },
      include: {
        slabPrice: true,
      },
    });

    let created = 0;
    for (const slab of vaultSlabs) {
      const priceUsd = slab.slabPrice?.priceUsd
        ? Number(slab.slabPrice.priceUsd)
        : null;
      const tier = this.assignTier(priceUsd, config);

      await this.prisma.gachaCard.create({
        data: {
          slabId: slab.id,
          tier,
          status: 'available',
        },
      });
      created++;
    }

    // Step 4: Re-tier existing cards that don't have manual overrides
    const cardsToRetier = await this.prisma.gachaCard.findMany({
      where: {
        tierOverride: false,
        status: 'available',
        slab: { assetRaw: { ownerAddress: this.vaultAddress } },
      },
      include: { slab: { include: { slabPrice: true } } },
    });

    let updated = 0;
    for (const card of cardsToRetier) {
      const priceUsd = card.slab.slabPrice?.priceUsd
        ? Number(card.slab.slabPrice.priceUsd)
        : null;
      const newTier = this.assignTier(priceUsd, config);
      if (newTier !== card.tier) {
        await this.prisma.gachaCard.update({
          where: { id: card.id },
          data: { tier: newTier },
        });
        updated++;
      }
    }

    // Step 5: Mark cards as distributed if the NFT is no longer in the vault
    // (transferred out manually or by the gacha system)
    const goneCards = await this.prisma.gachaCard.findMany({
      where: {
        status: 'available',
        slab: {
          assetRaw: { NOT: { ownerAddress: this.vaultAddress } },
        },
      },
    });

    for (const card of goneCards) {
      await this.prisma.gachaCard.update({
        where: { id: card.id },
        data: { status: 'distributed', distributedAt: new Date() },
      });
    }

    this.logger.log(
      `Vault sync complete: ${created} new cards, ${updated} re-tiered, ${goneCards.length} marked distributed`,
    );

    return { created, updated };
  }

  async getInventoryStats(): Promise<GachaInventoryStats> {
    const counts = await this.prisma.gachaCard.groupBy({
      by: ['tier'],
      where: { status: 'available' },
      _count: true,
    });

    const result: GachaInventoryStats = {
      common: 0,
      uncommon: 0,
      rare: 0,
      ultraRare: 0,
      total: 0,
    };

    for (const row of counts) {
      const count = row._count;
      switch (row.tier) {
        case 'common':
          result.common = count;
          break;
        case 'uncommon':
          result.uncommon = count;
          break;
        case 'rare':
          result.rare = count;
          break;
        case 'ultra_rare':
          result.ultraRare = count;
          break;
      }
      result.total += count;
    }

    return result;
  }

  /**
   * Weighted random card selection with tier fallback.
   * Uses a Prisma transaction to atomically reserve the card.
   */
  async selectCardForPull(pullId: string): Promise<SelectedCard> {
    const config = await this.getConfig();

    // Roll 1-100
    const roll = Math.floor(Math.random() * 100) + 1;

    // Determine tier from cumulative drop rates
    const tiers = this.getTierOrder(roll, config);

    // Try each tier until we find an available card
    for (const tier of tiers) {
      const card = await this.tryReserveCard(tier, pullId);
      if (card) return card;
    }

    throw new Error('No cards available in any tier');
  }

  async markCardDistributed(cardId: string): Promise<void> {
    await this.prisma.gachaCard.update({
      where: { id: cardId },
      data: {
        status: 'distributed',
        distributedAt: new Date(),
      },
    });
  }

  async releaseReservedCard(cardId: string): Promise<void> {
    await this.prisma.gachaCard.update({
      where: { id: cardId },
      data: {
        status: 'available',
        reservedAt: null,
        reservedByPullId: null,
      },
    });
  }

  // Per-cron locks: skip the new run if the previous one is still in flight.
  private syncRunning = false;
  private cleanupRunning = false;

  @Cron('*/5 * * * *')
  async scheduledSync(): Promise<void> {
    if (this.syncRunning) {
      this.logger.warn('Skipping scheduledSync — previous run still in flight');
      return;
    }
    this.syncRunning = true;
    try {
      await this.syncVaultInventory();
    } catch (err) {
      this.logger.error(`Scheduled vault sync failed: ${(err as Error).message}`);
    } finally {
      this.syncRunning = false;
    }
  }

  /**
   * Release cards that have been reserved for >30 minutes
   * but whose pull is not actively transferring or completed.
   */
  @Cron('*/10 * * * *')
  async cleanupStaleReservations(): Promise<void> {
    if (this.cleanupRunning) {
      this.logger.warn('Skipping cleanupStaleReservations — previous run still in flight');
      return;
    }
    this.cleanupRunning = true;
    try {
      await this._cleanupStaleReservationsImpl();
    } finally {
      this.cleanupRunning = false;
    }
  }

  private async _cleanupStaleReservationsImpl(): Promise<void> {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const stale = await this.prisma.gachaCard.findMany({
      where: {
        status: 'reserved',
        reservedAt: { lt: thirtyMinAgo },
        pull: {
          status: { notIn: ['transferring', 'completed'] },
        },
      },
    });

    for (const card of stale) {
      await this.prisma.gachaCard.update({
        where: { id: card.id },
        data: {
          status: 'available',
          reservedAt: null,
          reservedByPullId: null,
        },
      });
    }

    if (stale.length > 0) {
      this.logger.log(`Released ${stale.length} stale reserved cards`);
    }
  }

  private async tryReserveCard(
    tier: string,
    pullId: string,
  ): Promise<SelectedCard | null> {
    // Find a random available card in this tier
    // Use raw query for ORDER BY RANDOM() which Prisma doesn't support natively
    const candidates = await this.prisma.gachaCard.findMany({
      where: { tier, status: 'available' },
      select: { id: true },
      take: 10,
    });

    if (candidates.length === 0) return null;

    // Pick a random one from the batch
    const pick = candidates[Math.floor(Math.random() * candidates.length)];

    // Atomically reserve it using updateMany with status check
    const reserved = await this.prisma.gachaCard.updateMany({
      where: {
        id: pick.id,
        status: 'available', // Only if still available (prevents race conditions)
      },
      data: {
        status: 'reserved',
        reservedAt: new Date(),
        reservedByPullId: pullId,
      },
    });

    if (reserved.count === 0) {
      // Another pull grabbed it — try again with remaining candidates
      return null;
    }

    // Fetch the full card with slab data
    const card = await this.prisma.gachaCard.findUnique({
      where: { id: pick.id },
      include: {
        slab: {
          include: {
            assetRaw: {
              select: { tokenId: true, contractAddress: true },
            },
          },
        },
      },
    });

    return card as SelectedCard;
  }

  private getTierOrder(
    roll: number,
    config: { commonDropRate: number; uncommonDropRate: number; rareDropRate: number },
  ): GachaTier[] {
    const { commonDropRate, uncommonDropRate, rareDropRate } = config;

    let selectedTier: GachaTier;
    if (roll <= commonDropRate) {
      selectedTier = 'common';
    } else if (roll <= commonDropRate + uncommonDropRate) {
      selectedTier = 'uncommon';
    } else if (roll <= commonDropRate + uncommonDropRate + rareDropRate) {
      selectedTier = 'rare';
    } else {
      selectedTier = 'ultra_rare';
    }

    // Return selected tier first, then fallback tiers (lower tiers first)
    const allTiers: GachaTier[] = ['common', 'uncommon', 'rare', 'ultra_rare'];
    const idx = allTiers.indexOf(selectedTier);
    const fallbacks = allTiers.slice(0, idx).reverse();

    return [selectedTier, ...fallbacks];
  }

  private assignTier(
    priceUsd: number | null,
    config: { commonThreshold: number; uncommonThreshold: number; rareThreshold: number },
  ): GachaTier {
    if (priceUsd === null || priceUsd < config.commonThreshold) return 'common';
    if (priceUsd < config.uncommonThreshold) return 'uncommon';
    if (priceUsd < config.rareThreshold) return 'rare';
    return 'ultra_rare';
  }

  private async getConfig() {
    const config = await this.prisma.gachaConfig.findFirst({
      where: { id: 'default' },
    });

    if (!config) {
      // Return defaults if no config row exists
      return {
        burnAmountUsd: 25,
        commonThreshold: 20,
        uncommonThreshold: 50,
        rareThreshold: 150,
        commonDropRate: 55,
        uncommonDropRate: 30,
        rareDropRate: 12,
        ultraRareDropRate: 3,
        isActive: true,
      };
    }

    return {
      burnAmountUsd: Number(config.burnAmountUsd),
      commonThreshold: Number(config.commonThreshold),
      uncommonThreshold: Number(config.uncommonThreshold),
      rareThreshold: Number(config.rareThreshold),
      commonDropRate: config.commonDropRate,
      uncommonDropRate: config.uncommonDropRate,
      rareDropRate: config.rareDropRate,
      ultraRareDropRate: config.ultraRareDropRate,
      isActive: config.isActive,
    };
  }
}
