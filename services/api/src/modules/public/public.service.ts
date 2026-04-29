import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SlabsService, SortOption } from '../slabs/slabs.service';
import { SetsService } from '../sets/sets.service';
import { IndexingService } from '../indexing/indexing.service';
import { PricingService } from '../pricing/pricing.service';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private prisma: PrismaService,
    private slabsService: SlabsService,
    private setsService: SetsService,
    private indexingService: IndexingService,
    private pricingService: PricingService,
  ) {}

  /**
   * Wallet valuation: every priced slab in the wallet, plus aggregates +
   * freshness signal. Triggers indexing if data is stale, and pricing for
   * any slab missing a price.
   */
  async getWalletValuation(address: string) {
    const normalized = address.toLowerCase();
    await this.indexingService.indexAddress(normalized);

    // Trigger pricing for unpriced slabs (fire-and-forget)
    this.pricingService.priceSlabsForOwner(normalized).catch((e) =>
      this.logger.warn(`Background pricing failed for ${normalized}: ${e}`),
    );

    const slabs = await this.prisma.slab.findMany({
      where: { assetRaw: { ownerAddress: normalized } },
      include: {
        assetRaw: true,
        slabPrice: true,
      },
    });

    const cards = slabs.map((s: any) => ({
      slabId: s.id,
      tokenId: s.assetRaw.tokenId,
      tokenIdHex: '0x' + BigInt(s.assetRaw.tokenId).toString(16).padStart(64, '0'),
      contractAddress: s.assetRaw.contractAddress,
      platform: s.platform,
      cardName: s.cardName,
      setName: s.setName,
      cardNumber: s.cardNumber,
      grader: s.grader,
      grade: s.grade,
      certNumber: s.certNumber,
      imageUrl: s.imageUrl,
      priceUsd: s.slabPrice?.priceUsd ? Number(s.slabPrice.priceUsd) : null,
      priceUpdatedAt: s.slabPrice?.updatedAt?.toISOString() ?? null,
    }));

    const priced = cards.filter((c) => c.priceUsd !== null);
    const totalUsd = priced.reduce((acc, c) => acc + (c.priceUsd ?? 0), 0);

    // Oldest priced row defines wallet-level freshness
    let asOfTime: string | null = null;
    if (priced.length) {
      const oldest = priced
        .map((c) => c.priceUpdatedAt)
        .filter((d): d is string => !!d)
        .sort()[0];
      asOfTime = oldest;
    }

    const now = Date.now();
    const FRESH_MS = 24 * 60 * 60 * 1000;
    const freshness =
      !asOfTime
        ? 'unknown'
        : now - new Date(asOfTime).getTime() <= FRESH_MS
          ? 'fresh'
          : 'stale';

    const unpriced = cards.filter((c) => c.priceUsd === null);

    return {
      address: normalized,
      totalUsd,
      asOfTime,
      freshness,
      counts: {
        total: cards.length,
        priced: priced.length,
        unpriced: unpriced.length,
      },
      cards,
    };
  }

  async getAddressSummary(address: string) {
    const normalizedAddress = address.toLowerCase();

    // Trigger indexing if data is stale or missing
    await this.indexingService.indexAddress(normalizedAddress);

    // Check if any prices already exist in slab_prices for this address
    const existingPriceCount = await this.prisma.slabPrice.count({
      where: { slab: { assetRaw: { ownerAddress: normalizedAddress } } },
    });

    if (existingPriceCount === 0) {
      // First load — await pricing so we return real values
      await this.pricingService.priceSlabsForOwner(normalizedAddress);
    } else {
      // Prices cached — refresh in background
      this.pricingService.priceSlabsForOwner(normalizedAddress).catch((e) =>
        this.logger.error(`Background price fetch failed: ${e}`),
      );
    }

    const [totalSlabs, sets, estimatedValue] = await Promise.all([
      this.prisma.slab.count({
        where: { assetRaw: { ownerAddress: normalizedAddress } },
      }),
      this.setsService.getSetProgressByOwner(normalizedAddress),
      this.pricingService.getEstimatedValue(normalizedAddress),
    ]);

    return {
      address: normalizedAddress,
      totalSlabs,
      totalSets: sets.length,
      estimatedValueUsd: Math.round(estimatedValue * 100) / 100,
      sets,
    };
  }

  async getAddressSlabs(
    address: string,
    query: { set?: string; q?: string; grade?: string; sort?: SortOption; page?: number },
  ) {
    return this.slabsService.getSlabsByOwner({
      ownerAddress: address.toLowerCase(),
      ...query,
    });
  }

  async getAddressSlabsBySet(address: string) {
    return this.slabsService.getSlabsGroupedBySets(address.toLowerCase());
  }

  async getAddressSets(address: string) {
    return this.setsService.getSetProgressByOwner(address.toLowerCase());
  }

  async getAddressSetDetail(address: string, setName: string) {
    return this.setsService.getSetDetailForOwner(
      address.toLowerCase(),
      setName,
    );
  }
}
