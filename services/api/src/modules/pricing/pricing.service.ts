import { Inject, Injectable, Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { AltService } from './alt.service';
import { TcgdexAdapter } from './tcgdex.adapter';
import { PriceTrackerService } from './price-tracker.service';
import { PokemonApiService } from './pokemon-api.service';
import { REDIS_CLIENT } from './redis.provider';

const TTL_FREE = 24 * 60 * 60; // 24 hours in seconds
const TTL_PREMIUM = 6 * 60 * 60; // 6 hours in seconds

interface CachedPrice {
  priceUsd: number | null;
  updatedAt: string;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  // In-memory cache for PriceTracker results during a pricing run.
  // Key: "cardName|setName", Value: search results.
  // Prevents re-querying the same card for duplicate slabs.
  private ptCache = new Map<string, Awaited<ReturnType<PriceTrackerService['searchCards']>>>();
  private ptExhausted = false; // Set true on 403 to skip remaining

  constructor(
    private prisma: PrismaService,
    private altService: AltService,
    private tcgdexAdapter: TcgdexAdapter,
    private priceTracker: PriceTrackerService,
    private pokemonApi: PokemonApiService,
    @Inject(REDIS_CLIENT) private redis: IORedis,
  ) {}

  /**
   * Get the price for a slab by its ID.
   * 1. Check Redis cache
   * 2. If miss → check Postgres
   * 3. If miss → call adapter, store, cache
   */
  async getSlabPrice(
    slabId: string,
    tier: 'free' | 'premium' = 'free',
  ): Promise<{ priceUsd: number | null; updatedAt: string | null }> {
    const cacheKey = `price:slab:${slabId}`;
    const ttl = tier === 'premium' ? TTL_PREMIUM : TTL_FREE;

    // 1. Check Redis cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed: CachedPrice = JSON.parse(cached);

      const redisTtl = await this.redis.ttl(cacheKey);
      if (redisTtl > 0 && redisTtl < ttl * 0.1) {
        this.refreshPrice(slabId, tier).catch((e) =>
          this.logger.error(`Async refresh failed for ${slabId}: ${e}`),
        );
      }

      return { priceUsd: parsed.priceUsd, updatedAt: parsed.updatedAt };
    }

    // 2. Check Postgres
    const dbPrice = await this.prisma.slabPrice.findUnique({
      where: { slabId },
    });

    if (dbPrice) {
      const result = {
        priceUsd: dbPrice.priceUsd ? Number(dbPrice.priceUsd) : null,
        updatedAt: dbPrice.updatedAt.toISOString(),
      };

      await this.setCache(cacheKey, result, ttl);

      const age = Date.now() - dbPrice.updatedAt.getTime();
      if (age > ttl * 1000) {
        this.refreshPrice(slabId, tier).catch((e) =>
          this.logger.error(`Async refresh failed for ${slabId}: ${e}`),
        );
      }

      return result;
    }

    // 3. No cached data — fetch synchronously
    return this.refreshPrice(slabId, tier);
  }

  /**
   * Fetch fresh price, store in Postgres, cache in Redis.
   * Pipeline: Alt.xyz → PriceTracker → pokemon-api.com → TCGdex × multiplier fallback.
   */
  async refreshPrice(
    slabId: string,
    tier: 'free' | 'premium' = 'free',
  ): Promise<{ priceUsd: number | null; updatedAt: string | null }> {
    const slab = await this.prisma.slab.findUnique({
      where: { id: slabId },
      select: {
        certNumber: true,
        cardName: true,
        cardNumber: true,
        setName: true,
        grader: true,
        grade: true,
      },
    });

    if (!slab?.certNumber) {
      this.logger.warn(`Slab ${slabId} has no cert number, cannot price`);
      return { priceUsd: null, updatedAt: null };
    }

    try {
      let priceUsd: number | null = null;

      // 1. Try Alt.xyz — direct cert lookup, aggregated market value
      if (slab.certNumber) {
        const altResult = await this.altService.getPriceByCert(slab.certNumber);
        if (altResult) {
          priceUsd = altResult.price;
          this.logger.debug(
            `Alt.xyz for ${slab.certNumber}: $${priceUsd} (${altResult.confidence})`,
          );
        }
      }

      // 2. Try PriceTracker — eBay SOLD data with smartMarketPrice by grade
      if (
        priceUsd === null &&
        this.priceTracker.isAvailable() &&
        slab.cardName &&
        slab.grader &&
        slab.grade
      ) {
        priceUsd = await this.tryPriceTracker(slab);
      }

      // 3. Try pokemon-api.com for direct graded prices
      if (
        priceUsd === null &&
        this.pokemonApi.isAvailable &&
        slab.cardName &&
        slab.grader &&
        slab.grade
      ) {
        priceUsd = await this.tryPokemonApi(slab);
      }

      // 4. Fall back to TCGdex × grade multiplier
      if (priceUsd === null) {
        const tcgResult = await this.tcgdexAdapter.getPriceByCert(slab.certNumber);
        priceUsd = tcgResult.priceUsd;
        if (priceUsd !== null) {
          this.logger.debug(
            `TCGdex fallback for ${slab.certNumber}: $${priceUsd}`,
          );
        }
      }

      // Upsert into Postgres
      const record = await this.prisma.slabPrice.upsert({
        where: { slabId },
        create: { slabId, priceUsd },
        update: { priceUsd },
      });

      const response = {
        priceUsd,
        updatedAt: record.updatedAt.toISOString(),
      };

      const ttl = tier === 'premium' ? TTL_PREMIUM : TTL_FREE;
      await this.setCache(`price:slab:${slabId}`, response, ttl);

      return response;
    } catch (e) {
      this.logger.error(`Failed to fetch price for slab ${slabId}: ${e}`);
      return { priceUsd: null, updatedAt: null };
    }
  }

  /**
   * Try PriceTracker: search by card name + set, extract graded eBay sold price.
   * Uses in-memory cache to avoid re-querying duplicate cards.
   */
  private async tryPriceTracker(slab: {
    certNumber: string | null;
    cardName: string | null;
    cardNumber: string | null;
    setName: string | null;
    grader: string | null;
    grade: string | null;
  }): Promise<number | null> {
    if (!slab.cardName || !slab.grader || !slab.grade) return null;
    if (this.ptExhausted) return null; // Skip if API quota hit

    const cacheKey = `${slab.cardName}|${slab.setName || ''}`.toLowerCase();

    // Check in-memory cache first
    if (this.ptCache.has(cacheKey)) {
      const cached = this.ptCache.get(cacheKey);
      if (!cached || cached.length === 0) return null;
      return this.extractPriceTrackerResult(cached, slab);
    }

    const query = slab.setName
      ? `${slab.cardName} ${slab.setName}`
      : slab.cardName;

    let results = await this.priceTracker.searchCards(query, true);

    // null = rate limited or 403
    if (results === null) {
      this.ptExhausted = true;
      this.logger.warn('PriceTracker API exhausted, skipping for remaining slabs');
      return null;
    }

    if (results.length === 0 && slab.setName) {
      results = await this.priceTracker.searchCards(slab.cardName, true);
      if (results === null) {
        this.ptExhausted = true;
        return null;
      }
    }

    // Cache the results (even if empty, to avoid re-querying)
    this.ptCache.set(cacheKey, results);

    if (!results || results.length === 0) return null;

    return this.extractPriceTrackerResult(results, slab);
  }

  private extractPriceTrackerResult(
    results: NonNullable<Awaited<ReturnType<PriceTrackerService['searchCards']>>>,
    slab: {
      certNumber: string | null;
      cardName: string | null;
      cardNumber: string | null;
      setName: string | null;
      grader: string | null;
      grade: string | null;
    },
  ): number | null {
    const match = this.priceTracker.findBestMatch(
      results,
      slab.cardName!,
      slab.setName ?? undefined,
      slab.cardNumber ?? undefined,
    );
    if (!match) return null;

    // Try graded eBay sold price (smartMarketPrice)
    const gradedPrice = this.priceTracker.extractGradedPrice(
      match,
      slab.grader!,
      slab.grade!,
    );
    if (gradedPrice) {
      this.logger.debug(
        `PriceTracker graded for ${slab.certNumber}: $${gradedPrice.price} (${gradedPrice.source}, ${gradedPrice.confidence})`,
      );
      return gradedPrice.price;
    }

    // Fall back to raw market price from PriceTracker
    const rawPrice = this.priceTracker.extractRawPrice(match);
    if (rawPrice) {
      this.logger.debug(
        `PriceTracker raw for ${slab.certNumber}: $${rawPrice.price} (no graded sold data)`,
      );
      return rawPrice.price;
    }

    return null;
  }

  /**
   * Try pokemon-api.com: search by card name + set, extract graded price.
   */
  private async tryPokemonApi(slab: {
    certNumber: string | null;
    cardName: string | null;
    cardNumber: string | null;
    setName: string | null;
    grader: string | null;
    grade: string | null;
  }): Promise<number | null> {
    if (!slab.cardName || !slab.grader || !slab.grade) return null;

    // Search with card name + set name for better matching
    const query = slab.setName
      ? `${slab.cardName} ${slab.setName}`
      : slab.cardName;

    let results = await this.pokemonApi.searchCards(query);

    // Retry with just card name if set name made it too specific
    if (results.length === 0 && slab.setName) {
      results = await this.pokemonApi.searchCards(slab.cardName);
    }

    if (results.length === 0) return null;

    const match = this.pokemonApi.findBestMatch(
      results,
      slab.cardName,
      slab.setName,
      slab.cardNumber,
    );
    if (!match) return null;

    // Try direct graded price first
    const gradedPrice = this.pokemonApi.extractGradedPrice(
      match,
      slab.grader,
      slab.grade,
    );
    if (gradedPrice) {
      this.logger.debug(
        `pokemon-api graded for ${slab.certNumber}: $${gradedPrice.price} (${gradedPrice.source})`,
      );
      return gradedPrice.price;
    }

    // If no graded price, use raw price from pokemon-api
    const rawPrice = this.pokemonApi.extractRawPrice(match);
    if (rawPrice) {
      this.logger.debug(
        `pokemon-api raw for ${slab.certNumber}: $${rawPrice.price} (no graded data)`,
      );
      return rawPrice.price;
    }

    return null;
  }

  /**
   * Price all slabs for an owner address. Returns count of priced slabs.
   */
  async priceSlabsForOwner(
    ownerAddress: string,
    tier: 'free' | 'premium' = 'free',
  ): Promise<number> {
    const slabs = await this.prisma.slab.findMany({
      where: {
        assetRaw: { ownerAddress },
        certNumber: { not: null },
      },
      select: { id: true },
    });

    let priced = 0;
    for (const slab of slabs) {
      const result = await this.getSlabPrice(slab.id, tier);
      if (result.priceUsd !== null) priced++;
    }

    return priced;
  }

  /**
   * Get total estimated value for an owner address from slab_prices table.
   */
  async getEstimatedValue(ownerAddress: string): Promise<number> {
    const result = await this.prisma.slabPrice.aggregate({
      where: {
        slab: { assetRaw: { ownerAddress } },
        priceUsd: { not: null },
      },
      _sum: { priceUsd: true },
    });
    return Number(result._sum.priceUsd ?? 0);
  }

  private async setCache(
    key: string,
    value: { priceUsd: number | null; updatedAt: string | null },
    ttl: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (e) {
      this.logger.error(`Redis set failed for ${key}: ${e}`);
    }
  }
}
