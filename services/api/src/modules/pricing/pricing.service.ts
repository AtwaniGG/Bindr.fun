import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PokemonTcgService } from '../pokemon-tcg/pokemon-tcg.service';
import { PokemonApiService } from '../pokemon-tcg/pokemon-api.service';
import { JustTcgService, JustTcgCard } from './justtcg.service';
import { PriceTrackerService } from './price-tracker.service';
import { EbayService } from './ebay.service';

const TCGDEX_DELAY_MS = 300;
const EBAY_DELAY_MS = 500;
const JUSTTCG_DELAY_MS = 100;
const POKEMON_API_DELAY_MS = 700;
const PRICE_TRACKER_DELAY_MS = 500;
const BATCH_SIZE = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Grade multipliers - last-resort fallback when no real graded data is available.
 */
const GRADE_MULTIPLIERS: Record<string, Record<number, number>> = {
  psa: { 10: 5, 9: 2, 8: 1.5, 7: 1.2, 6: 1, 5: 0.9, 4: 0.8, 3: 0.7, 2: 0.6, 1: 0.5 },
  cgc: { 10: 6, 9: 1.8, 8: 1.3, 7: 1.1, 6: 1, 5: 0.9, 4: 0.8, 3: 0.7, 2: 0.6, 1: 0.5 },
  bgs: { 10: 8, 9: 2, 8: 1.4, 7: 1.1, 6: 1, 5: 0.9, 4: 0.8, 3: 0.7, 2: 0.6, 1: 0.5 },
  sgc: { 10: 4, 9: 1.8, 8: 1.3, 7: 1.1, 6: 1, 5: 0.9, 4: 0.8, 3: 0.7, 2: 0.6, 1: 0.5 },
};

function getGradeMultiplier(grader: string | null, grade: string | null): number {
  if (!grader || !grade) return 1;
  const graderKey = grader.toLowerCase();
  const gradeFloat = parseFloat(grade);
  if (isNaN(gradeFloat)) return 1;
  const multipliers = GRADE_MULTIPLIERS[graderKey];
  if (!multipliers) return 1;
  // Try exact grade first, then floor (e.g., 9.5 → use 9's multiplier)
  return multipliers[gradeFloat] ?? multipliers[Math.floor(gradeFloat)] ?? 1;
}

/**
 * JustTCG card matching - prioritises exact matches but has substring fallbacks.
 */
function findBestJustTcgMatch(
  results: JustTcgCard[],
  cardName: string,
  cardNumber: string | null,
  setName: string | null,
): JustTcgCard | null {
  if (results.length === 0) return null;

  const nameLower = cardName.toLowerCase();
  const setLower = setName?.toLowerCase();

  // 1. Exact name + exact set name
  if (setLower) {
    const match = results.find(
      (c) =>
        c.name.toLowerCase() === nameLower &&
        c.set_name.toLowerCase() === setLower,
    );
    if (match) return match;
  }

  // 2. Card number in ID + exact set name
  if (cardNumber && setLower) {
    const match = results.find(
      (c) =>
        c.id.endsWith(`-${cardNumber}`) &&
        c.set_name.toLowerCase() === setLower,
    );
    if (match) return match;
  }

  // 3. Exact name + substring set name (handles "XY Black Star Promos" vs "XY: Black Star Promos")
  if (setLower) {
    const match = results.find((c) => {
      const rSet = c.set_name.toLowerCase();
      return (
        c.name.toLowerCase() === nameLower &&
        (rSet.includes(setLower) || setLower.includes(rSet))
      );
    });
    if (match) return match;
  }

  // 4. Exact name match (any set)
  const byName = results.find((c) => c.name.toLowerCase() === nameLower);
  if (byName) return byName;

  // 5. Substring name + substring set (low ambiguity: <=3 results)
  if (setLower && results.length <= 3) {
    const match = results.find((c) => {
      const rName = c.name.toLowerCase();
      const rSet = c.set_name.toLowerCase();
      return (
        (rName.includes(nameLower) || nameLower.includes(rName)) &&
        (rSet.includes(setLower) || setLower.includes(rSet))
      );
    });
    if (match) return match;
  }

  // 6. Single result - accept it (unambiguous)
  if (results.length === 1) return results[0];

  return null;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private isRunning = false;

  constructor(
    private prisma: PrismaService,
    private pokemonTcgService: PokemonTcgService,
    private pokemonApiService: PokemonApiService,
    private justTcgService: JustTcgService,
    private priceTrackerService: PriceTrackerService,
    private ebayService: EbayService,
  ) {}

  async getLatestPrice(slabId: string) {
    return this.prisma.price.findFirst({
      where: { slabId },
      orderBy: { retrievedAt: 'desc' },
    });
  }

  async getPriceHistory(slabId: string) {
    return this.prisma.priceSnapshotDaily.findMany({
      where: { slabId },
      orderBy: { date: 'asc' },
    });
  }

  /** Run at 6 AM and 6 PM UTC every day */
  @Cron('0 6,18 * * *')
  async scheduledPriceRefresh() {
    this.logger.log('Scheduled price refresh started');
    await this.refreshAllPrices();
  }

  /**
   * Refresh prices for ALL slabs.
   * Phase 1: PriceTracker (eBay graded sold data)
   * Phase 2: Pokemon-API.com (Cardmarket graded prices)
   * Phase 3: JustTCG (raw prices + grade multiplier)
   * Phase 4: TCGdex (raw prices + grade multiplier, variant-aware)
   */
  async refreshAllPrices(): Promise<number> {
    if (this.isRunning) {
      this.logger.warn('Price refresh already running, skipping');
      return 0;
    }
    this.isRunning = true;

    try {
      const slabs = await this.prisma.slab.findMany({
        where: { cardName: { not: null } },
        select: {
          id: true,
          cardName: true,
          cardNumber: true,
          setName: true,
          grader: true,
          grade: true,
          variant: true,
        },
      });

      if (slabs.length === 0) {
        this.logger.log('No slabs to price');
        return 0;
      }

      // Group slabs by unique card identity (cardName + setName)
      const mkKey = (name: string, set: string | null) =>
        `${name.toLowerCase()}|${(set ?? '').toLowerCase()}`;

      const cardGroups = new Map<string, typeof slabs>();
      for (const slab of slabs) {
        const key = mkKey(slab.cardName!, slab.setName);
        if (!cardGroups.has(key)) cardGroups.set(key, []);
        cardGroups.get(key)!.push(slab);
      }

      this.logger.log(
        `Pricing ${slabs.length} slabs (${cardGroups.size} unique cards)`,
      );

      let totalPriced = 0;
      const now = new Date();
      const pricedSlabIds = new Set<string>();
      const priceInserts: Parameters<typeof this.prisma.price.create>[0]['data'][] = [];

      // -- Phase 0.5: eBay Browse API (active listings for graded cards) --
      try {
        if (this.ebayService.isAvailable()) {
          this.logger.log('eBay: starting active-listings graded pricing phase');
          let ebayCalls = 0;

          for (const [, groupSlabs] of cardGroups) {
            for (const slab of groupSlabs) {
              if (pricedSlabIds.has(slab.id)) continue;
              if (!slab.grader || !slab.grade) continue;

              await sleep(EBAY_DELAY_MS);
              const listings = await this.ebayService.searchGradedListings(
                slab.cardName!,
                slab.setName,
                slab.grader,
                slab.grade,
              );
              ebayCalls++;

              if (listings === null) {
                this.logger.warn('eBay: auth failed or rate limited, stopping phase');
                break;
              }
              if (listings.length === 0) continue;

              const result = this.ebayService.extractGradedPrice(
                listings,
                slab.cardName!,
                slab.grader,
                slab.grade,
              );
              if (!result) continue;

              this.logger.debug(
                `eBay: ${slab.grader} ${slab.grade} "${slab.cardName}" → $${result.price} (${result.sampleSize} listings)`,
              );

              priceInserts.push({
                slabId: slab.id,
                source: 'ebay',
                marketPrice: result.price,
                currency: 'USD',
                confidence: result.confidence,
                retrievedAt: now,
                rawResponse: {
                  cardName: slab.cardName,
                  setName: slab.setName,
                  grader: slab.grader,
                  grade: slab.grade,
                  sampleSize: result.sampleSize,
                  source: result.source,
                  topListings: result.listings,
                } as any,
              });
              pricedSlabIds.add(slab.id);
              totalPriced++;

              if (priceInserts.length >= BATCH_SIZE) {
                await this.flushPrices(priceInserts);
                priceInserts.length = 0;
              }
            }

            if (ebayCalls % 20 === 0 && ebayCalls > 0) {
              this.logger.log(`  eBay: ${ebayCalls} calls made`);
            }
          }

          if (priceInserts.length > 0) {
            await this.flushPrices(priceInserts);
            priceInserts.length = 0;
          }

          this.logger.log(
            `eBay phase done: ${totalPriced} slabs priced (${ebayCalls} API calls)`,
          );
        }
      } catch (e) {
        this.logger.error(`Phase 0.5 (eBay) failed: ${e}`);
      }

      // -- Phase 1: PriceTracker (eBay graded sold data) --
      try {
      if (this.priceTrackerService.isAvailable()) {
        this.logger.log('PriceTracker: starting eBay graded pricing phase');
        let ptCalls = 0;

        for (const [, groupSlabs] of cardGroups) {
          // Stop if credits are running low
          const credits = this.priceTrackerService.creditsRemaining;
          if (credits !== null && credits < 5) {
            this.logger.warn(`PriceTracker: only ${credits} credits left, stopping`);
            break;
          }

          const rep = groupSlabs[0];
          await sleep(PRICE_TRACKER_DELAY_MS);
          // Search by card name + set — eBay graded data is included per card via includeEbay flag
          const query = [rep.cardName, rep.setName].filter(Boolean).join(' ');
          this.logger.debug(`PriceTracker query: "${query}"`);
          const results = await this.priceTrackerService.searchCards(query, true);
          ptCalls++;

          if (results === null) {
            this.logger.warn('PriceTracker: rate limited (429), stopping phase');
            break;
          }
          if (results.length === 0) continue;

          const match = this.priceTrackerService.findBestMatch(
            results,
            rep.cardName!,
            rep.setName ?? undefined,
            rep.cardNumber ?? undefined,
          );
          if (!match) continue;

          for (const slab of groupSlabs) {
            let saved = false;
            // Try real eBay graded price first
            const gradedPrice = slab.grader && slab.grade
              ? this.priceTrackerService.extractGradedPrice(match, slab.grader, slab.grade)
              : null;

            if (gradedPrice) {
              this.logger.debug(
                `PriceTracker: ${slab.grader} ${slab.grade} "${slab.cardName}" → $${gradedPrice.price} (${gradedPrice.source})`,
              );
              priceInserts.push({
                slabId: slab.id,
                source: 'price-tracker',
                marketPrice: gradedPrice.price,
                currency: 'USD',
                confidence: gradedPrice.confidence,
                retrievedAt: now,
                rawResponse: {
                  cardName: match.name,
                  setName: match.setName,
                  gradedSource: gradedPrice.source,
                  grader: slab.grader,
                  grade: slab.grade,
                } as any,
              });
              saved = true;
            } else {
              this.logger.debug(
                `PriceTracker: no graded eBay data for ${slab.grader} ${slab.grade} "${slab.cardName}" – falling back to raw`,
              );
              // Fall back to raw price + grade multiplier
              const rawPrice = this.priceTrackerService.extractRawPrice(match);
              if (rawPrice) {
                const multiplier = getGradeMultiplier(slab.grader, slab.grade);
                priceInserts.push({
                  slabId: slab.id,
                  source: 'price-tracker',
                  marketPrice: Math.round(rawPrice.price * multiplier * 100) / 100,
                  currency: 'USD',
                  confidence: 'low',
                  retrievedAt: now,
                  rawResponse: {
                    cardName: match.name,
                    setName: match.setName,
                    rawPrice: rawPrice.price,
                    gradeMultiplier: multiplier,
                    grader: slab.grader,
                    grade: slab.grade,
                  } as any,
                });
                saved = true;
              }
            }
            if (saved) {
              pricedSlabIds.add(slab.id);
              totalPriced++;
            }

            if (priceInserts.length >= BATCH_SIZE) {
              await this.flushPrices(priceInserts);
              priceInserts.length = 0;
            }
          }

          if (ptCalls % 20 === 0) {
            this.logger.log(`  PriceTracker: ${ptCalls} calls made (credits: ${this.priceTrackerService.creditsRemaining})`);
          }
        }

        if (priceInserts.length > 0) {
          await this.flushPrices(priceInserts);
          priceInserts.length = 0;
        }

        this.logger.log(
          `PriceTracker phase done: ${totalPriced} slabs priced (${ptCalls} API calls)`,
        );
      }
      } catch (e) {
        this.logger.error(`Phase 1 (PriceTracker) failed: ${e}`);
      }

      // -- Phase 2: Pokemon-API.com (real graded prices from Cardmarket) --
      try {
      if (this.pokemonApiService.isAvailable()) {
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        const recentPrices = await this.prisma.price.findMany({
          where: {
            source: 'pokemon-api',
            retrievedAt: { gte: new Date(now.getTime() - TWENTY_FOUR_HOURS) },
          },
          select: { slabId: true },
          distinct: ['slabId'],
        });
        const recentlyPriced = new Set(recentPrices.map((p) => p.slabId));

        const needsRefresh: [string, typeof slabs][] = [];
        for (const [key, groupSlabs] of cardGroups) {
          // Skip if already priced by PriceTracker
          if (groupSlabs.every((s) => pricedSlabIds.has(s.id))) continue;
          if (!groupSlabs.every((s) => recentlyPriced.has(s.id))) {
            needsRefresh.push([key, groupSlabs]);
          }
        }

        this.logger.log(
          `Pokemon-API: ${needsRefresh.length}/${cardGroups.size} cards need refresh`,
        );

        let apiFetched = 0;
        const maxCalls = 90;

        for (const [, groupSlabs] of needsRefresh) {
          if (apiFetched >= maxCalls) break;

          const rep = groupSlabs[0];
          await sleep(POKEMON_API_DELAY_MS);
          const results = await this.pokemonApiService.searchCards(
            rep.cardName!,
            rep.setName ?? undefined,
          );
          apiFetched++;

          if (results.length === 0) continue;

          const match = this.pokemonApiService.findBestMatch(
            results,
            rep.cardName!,
            rep.setName ?? undefined,
            rep.cardNumber ?? undefined,
          );
          if (!match) continue;

          for (const slab of groupSlabs) {
            if (pricedSlabIds.has(slab.id) || recentlyPriced.has(slab.id)) {
              pricedSlabIds.add(slab.id);
              continue;
            }

            let saved = false;
            const gradedPrice = slab.grader && slab.grade
              ? this.pokemonApiService.extractGradedPrice(match, slab.grader, slab.grade)
              : null;

            if (gradedPrice) {
              priceInserts.push({
                slabId: slab.id,
                source: 'pokemon-api',
                marketPrice: gradedPrice.price,
                currency: gradedPrice.currency,
                confidence: 'high',
                retrievedAt: now,
                rawResponse: {
                  pokemonApiCardId: match.id,
                  cardName: match.name,
                  setName: match.episode?.name,
                  gradedSource: gradedPrice.source,
                  grader: slab.grader,
                  grade: slab.grade,
                } as any,
              });
              saved = true;
            } else {
              const rawPrice = this.pokemonApiService.extractRawPrice(match);
              if (rawPrice) {
                const multiplier = getGradeMultiplier(slab.grader, slab.grade);
                priceInserts.push({
                  slabId: slab.id,
                  source: 'pokemon-api',
                  marketPrice: Math.round(rawPrice.price * multiplier * 100) / 100,
                  currency: rawPrice.currency,
                  confidence: multiplier > 1.5 ? 'low' : 'medium',
                  retrievedAt: now,
                  rawResponse: {
                    pokemonApiCardId: match.id,
                    rawPrice: rawPrice.price,
                    gradeMultiplier: multiplier,
                    grader: slab.grader,
                    grade: slab.grade,
                  } as any,
                });
                saved = true;
              }
            }
            if (saved) {
              pricedSlabIds.add(slab.id);
              totalPriced++;
            }

            if (priceInserts.length >= BATCH_SIZE) {
              await this.flushPrices(priceInserts);
              priceInserts.length = 0;
            }
          }

          if (apiFetched % 20 === 0) {
            this.logger.log(`  Pokemon-API: ${apiFetched} calls made`);
          }
        }

        if (priceInserts.length > 0) {
          await this.flushPrices(priceInserts);
          priceInserts.length = 0;
        }

        this.logger.log(
          `Pokemon-API phase done: ${totalPriced} slabs priced (${apiFetched} API calls)`,
        );
      }
      } catch (e) {
        this.logger.error(`Phase 2 (Pokemon-API) failed: ${e}`);
      }

      // -- Phase 3: JustTCG (raw prices, supports EN + JP, 1000 calls/day) --
      try {
      let unpricedSlabs = slabs.filter((s) => !pricedSlabIds.has(s.id));

      if (unpricedSlabs.length > 0 && this.justTcgService.isConfigured) {
        this.logger.log(
          `JustTCG: pricing ${unpricedSlabs.length} remaining slabs`,
        );

        const unpricedGroups = new Map<string, typeof unpricedSlabs>();
        for (const slab of unpricedSlabs) {
          const key = mkKey(slab.cardName!, slab.setName);
          if (!unpricedGroups.has(key)) unpricedGroups.set(key, []);
          unpricedGroups.get(key)!.push(slab);
        }

        let justTcgPriced = 0;
        for (const [, groupSlabs] of unpricedGroups) {
          const rep = groupSlabs[0];
          await sleep(JUSTTCG_DELAY_MS);

          let results = await this.justTcgService.searchCard(
            rep.cardName!,
            rep.setName ?? undefined,
            'pokemon',
          );
          if (results === null) {
            this.logger.warn('JustTCG: rate limited, stopping phase');
            break;
          }
          if (results.length === 0) {
            results = await this.justTcgService.searchCard(
              rep.cardName!,
              rep.setName ?? undefined,
              'pokemon-japan',
            );
            if (results === null) {
              this.logger.warn('JustTCG: rate limited (JP), stopping phase');
              break;
            }
          }
          if (!results || results.length === 0) continue;

          const match = findBestJustTcgMatch(results, rep.cardName!, rep.cardNumber, rep.setName);
          if (!match) continue;

          const rawPrice = this.justTcgService.extractPrice(match);
          if (!rawPrice || rawPrice <= 0) continue;

          for (const slab of groupSlabs) {
            const multiplier = getGradeMultiplier(slab.grader, slab.grade);
            priceInserts.push({
              slabId: slab.id,
              source: 'justtcg',
              marketPrice: Math.round(rawPrice * multiplier * 100) / 100,
              currency: 'USD',
              confidence: multiplier > 1.5 ? 'low' : 'medium',
              retrievedAt: now,
              rawResponse: {
                justTcgCardId: match.id,
                cardName: match.name,
                setName: match.set_name,
                rawPrice,
                gradeMultiplier: multiplier,
                grader: slab.grader,
                grade: slab.grade,
              } as any,
            });
            pricedSlabIds.add(slab.id);
            justTcgPriced++;
          }

          if (priceInserts.length >= BATCH_SIZE) {
            await this.flushPrices(priceInserts);
            priceInserts.length = 0;
          }
        }

        if (priceInserts.length > 0) {
          await this.flushPrices(priceInserts);
          priceInserts.length = 0;
        }

        this.logger.log(`JustTCG done: ${justTcgPriced} additional slabs priced`);
        totalPriced += justTcgPriced;
      }
      } catch (e) {
        this.logger.error(`Phase 3 (JustTCG) failed: ${e}`);
      }

      // -- Phase 4: TCGdex fallback (variant-aware) --
      try {
      const unpricedSlabs2 = slabs.filter((s) => !pricedSlabIds.has(s.id));

      if (unpricedSlabs2.length > 0) {
        this.logger.log(
          `TCGdex fallback: pricing ${unpricedSlabs2.length} remaining slabs`,
        );

        const cardRefs = await this.prisma.cardReference.findMany({
          select: { ptcgCardId: true, cardName: true, cardNumber: true, setName: true },
        });
        const refByNameSet = new Map<string, string>();
        const refByNumSet = new Map<string, string>();
        for (const ref of cardRefs) {
          refByNameSet.set(
            `${ref.cardName.toLowerCase()}|${ref.setName.toLowerCase()}`,
            ref.ptcgCardId,
          );
          refByNumSet.set(
            `${ref.cardNumber}|${ref.setName.toLowerCase()}`,
            ref.ptcgCardId,
          );
        }

        const cardIdToSlabs = new Map<string, typeof unpricedSlabs2>();
        for (const slab of unpricedSlabs2) {
          const setKey = (slab.setName ?? '').toLowerCase();
          const ptcgCardId =
            refByNameSet.get(`${slab.cardName!.toLowerCase()}|${setKey}`) ??
            (slab.cardNumber ? refByNumSet.get(`${slab.cardNumber}|${setKey}`) : null);
          if (ptcgCardId) {
            if (!cardIdToSlabs.has(ptcgCardId)) cardIdToSlabs.set(ptcgCardId, []);
            cardIdToSlabs.get(ptcgCardId)!.push(slab);
          }
        }

        let tcgdexPriced = 0;
        for (const [tcgCardId, cardSlabs] of cardIdToSlabs) {
          await sleep(TCGDEX_DELAY_MS);
          const cardPricing = await this.pokemonTcgService.getCardPricing(tcgCardId);
          if (!cardPricing?.pricing) continue;

          // Extract price per-slab so each gets its correct variant
          for (const slab of cardSlabs) {
            const rawPrice = this.pokemonTcgService.extractMarketPrice(
              cardPricing.pricing,
              slab.variant,
            );
            if (!rawPrice) continue;

            const multiplier = getGradeMultiplier(slab.grader, slab.grade);
            priceInserts.push({
              slabId: slab.id,
              source: 'tcgdex',
              marketPrice: Math.round(rawPrice.price * multiplier * 100) / 100,
              currency: rawPrice.currency,
              confidence: multiplier > 1 ? 'low' : 'medium',
              retrievedAt: now,
              rawResponse: {
                rawPrice: rawPrice.price,
                variant: rawPrice.variant,
                gradeMultiplier: multiplier,
                grader: slab.grader,
                grade: slab.grade,
              } as any,
            });
            tcgdexPriced++;
          }

          if (priceInserts.length >= BATCH_SIZE) {
            await this.flushPrices(priceInserts);
            priceInserts.length = 0;
          }
        }

        if (priceInserts.length > 0) {
          await this.flushPrices(priceInserts);
        }

        this.logger.log(`TCGdex fallback done: ${tcgdexPriced} additional slabs priced`);
        totalPriced += tcgdexPriced;
      }
      } catch (e) {
        this.logger.error(`Phase 4 (TCGdex) failed: ${e}`);
      }

      this.logger.log(
        `Price refresh complete: ${totalPriced}/${slabs.length} slabs priced`,
      );
      return totalPriced;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * On-demand pricing for a specific owner (called from summary endpoint).
   * Phase 1: PriceTracker → Phase 2: Pokemon-API.com → Phase 3: JustTCG → Phase 4: TCGdex
   */
  async fetchPricesForOwner(ownerAddress: string): Promise<number> {
    const slabs = await this.prisma.slab.findMany({
      where: {
        assetRaw: { ownerAddress },
        cardName: { not: null },
      },
      include: {
        prices: {
          orderBy: { retrievedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (slabs.length === 0) return 0;

    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    const now = new Date();
    const needsPricing = slabs.filter((s) => {
      const latest = s.prices[0];
      return !latest || now.getTime() - latest.retrievedAt.getTime() > TWELVE_HOURS;
    });

    if (needsPricing.length === 0) {
      this.logger.debug(`All slabs for ${ownerAddress} already priced recently`);
      return 0;
    }

    this.logger.log(`Pricing ${needsPricing.length} slabs for ${ownerAddress}`);

    const mkKey = (name: string, set: string | null) =>
      `${name.toLowerCase()}|${(set ?? '').toLowerCase()}`;

    const cardGroups = new Map<string, typeof needsPricing>();
    for (const slab of needsPricing) {
      const key = mkKey(slab.cardName!, slab.setName);
      if (!cardGroups.has(key)) cardGroups.set(key, []);
      cardGroups.get(key)!.push(slab);
    }

    let priced = 0;
    const pricedSlabIds = new Set<string>();

    // Phase 0.5: eBay Browse API (active listings for graded cards)
    try {
      if (this.ebayService.isAvailable()) {
        for (const slab of needsPricing) {
          if (pricedSlabIds.has(slab.id)) continue;
          if (!slab.grader || !slab.grade) continue;

          await sleep(EBAY_DELAY_MS);
          const listings = await this.ebayService.searchGradedListings(
            slab.cardName!,
            slab.setName,
            slab.grader,
            slab.grade,
          );

          if (listings === null) break;
          if (listings.length === 0) continue;

          const result = this.ebayService.extractGradedPrice(
            listings,
            slab.cardName!,
            slab.grader,
            slab.grade,
          );
          if (!result) continue;

          this.logger.debug(
            `eBay: ${slab.grader} ${slab.grade} "${slab.cardName}" → $${result.price} (${result.sampleSize} listings)`,
          );

          await this.prisma.price.create({
            data: {
              slabId: slab.id,
              source: 'ebay',
              marketPrice: result.price,
              currency: 'USD',
              confidence: result.confidence,
              retrievedAt: new Date(),
              rawResponse: {
                cardName: slab.cardName,
                setName: slab.setName,
                grader: slab.grader,
                grade: slab.grade,
                sampleSize: result.sampleSize,
                source: result.source,
                topListings: result.listings,
              } as any,
            },
          });
          pricedSlabIds.add(slab.id);
          priced++;
        }
      }
    } catch (e) {
      this.logger.error(`Phase 0.5 (eBay) failed for ${ownerAddress}: ${e}`);
    }
    this.logger.log(`Phase 0.5 (eBay): ${priced} slabs priced so far`);

    // Phase 1: PriceTracker (eBay graded sold data)
    try {
    if (this.priceTrackerService.isAvailable()) {
      for (const [, groupSlabs] of cardGroups) {
        const credits = this.priceTrackerService.creditsRemaining;
        if (credits !== null && credits < 5) break;

        const rep = groupSlabs[0];
        await sleep(PRICE_TRACKER_DELAY_MS);
        // Search by card name + set — eBay graded data is included per card via includeEbay flag
        const query = [rep.cardName, rep.setName].filter(Boolean).join(' ');
        this.logger.debug(`PriceTracker query: "${query}"`);
        const results = await this.priceTrackerService.searchCards(query, true);

        if (results === null) break; // rate limited
        if (results.length === 0) continue;

        const match = this.priceTrackerService.findBestMatch(
          results,
          rep.cardName!,
          rep.setName ?? undefined,
          rep.cardNumber ?? undefined,
        );
        if (!match) continue;

        for (const slab of groupSlabs) {
          const gradedPrice = slab.grader && slab.grade
            ? this.priceTrackerService.extractGradedPrice(match, slab.grader, slab.grade)
            : null;

          if (gradedPrice) {
            this.logger.debug(
              `PriceTracker: ${slab.grader} ${slab.grade} "${slab.cardName}" → $${gradedPrice.price} (${gradedPrice.source})`,
            );
            await this.prisma.price.create({
              data: {
                slabId: slab.id,
                source: 'price-tracker',
                marketPrice: gradedPrice.price,
                currency: 'USD',
                confidence: gradedPrice.confidence,
                retrievedAt: new Date(),
                rawResponse: {
                  cardName: match.name,
                  setName: match.setName,
                  gradedSource: gradedPrice.source,
                  grader: slab.grader,
                  grade: slab.grade,
                } as any,
              },
            });
            pricedSlabIds.add(slab.id);
            priced++;
          } else {
            this.logger.debug(
              `PriceTracker: no graded eBay data for ${slab.grader} ${slab.grade} "${slab.cardName}" – falling back to raw`,
            );
            const rawPrice = this.priceTrackerService.extractRawPrice(match);
            if (rawPrice) {
              const multiplier = getGradeMultiplier(slab.grader, slab.grade);
              await this.prisma.price.create({
                data: {
                  slabId: slab.id,
                  source: 'price-tracker',
                  marketPrice: Math.round(rawPrice.price * multiplier * 100) / 100,
                  currency: 'USD',
                  confidence: 'low',
                  retrievedAt: new Date(),
                  rawResponse: {
                    cardName: match.name,
                    setName: match.setName,
                    rawPrice: rawPrice.price,
                    gradeMultiplier: multiplier,
                    grader: slab.grader,
                    grade: slab.grade,
                  } as any,
                },
              });
              pricedSlabIds.add(slab.id);
              priced++;
            }
          }
        }
      }
    }
    } catch (e) {
      this.logger.error(`Phase 1 (PriceTracker) failed for ${ownerAddress}: ${e}`);
    }
    this.logger.log(`Phase 1 (PriceTracker): ${priced} slabs priced so far`);

    // Phase 2: Pokemon-API.com
    try {
    if (this.pokemonApiService.isAvailable()) {
      for (const [, groupSlabs] of cardGroups) {
        if (groupSlabs.every((s) => pricedSlabIds.has(s.id))) continue;

        const rep = groupSlabs[0];
        await sleep(POKEMON_API_DELAY_MS);
        const results = await this.pokemonApiService.searchCards(
          rep.cardName!,
          rep.setName ?? undefined,
        );
        if (results.length === 0) continue;

        const match = this.pokemonApiService.findBestMatch(
          results,
          rep.cardName!,
          rep.setName ?? undefined,
          rep.cardNumber ?? undefined,
        );
        if (!match) continue;

        for (const slab of groupSlabs) {
          if (pricedSlabIds.has(slab.id)) continue;

          const gradedPrice = slab.grader && slab.grade
            ? this.pokemonApiService.extractGradedPrice(match, slab.grader, slab.grade)
            : null;

          if (gradedPrice) {
            await this.prisma.price.create({
              data: {
                slabId: slab.id,
                source: 'pokemon-api',
                marketPrice: gradedPrice.price,
                currency: gradedPrice.currency,
                confidence: 'high',
                retrievedAt: new Date(),
                rawResponse: {
                  pokemonApiCardId: match.id,
                  gradedSource: gradedPrice.source,
                  grader: slab.grader,
                  grade: slab.grade,
                } as any,
              },
            });
            pricedSlabIds.add(slab.id);
            priced++;
          } else {
            const rawPrice = this.pokemonApiService.extractRawPrice(match);
            if (rawPrice) {
              const multiplier = getGradeMultiplier(slab.grader, slab.grade);
              await this.prisma.price.create({
                data: {
                  slabId: slab.id,
                  source: 'pokemon-api',
                  marketPrice: Math.round(rawPrice.price * multiplier * 100) / 100,
                  currency: rawPrice.currency,
                  confidence: multiplier > 1.5 ? 'low' : 'medium',
                  retrievedAt: new Date(),
                  rawResponse: {
                    pokemonApiCardId: match.id,
                    rawPrice: rawPrice.price,
                    gradeMultiplier: multiplier,
                    grader: slab.grader,
                    grade: slab.grade,
                  } as any,
                },
              });
              pricedSlabIds.add(slab.id);
              priced++;
            }
          }
        }
      }
    }
    } catch (e) {
      this.logger.error(`Phase 2 (Pokemon-API) failed for ${ownerAddress}: ${e}`);
    }
    this.logger.log(`Phase 2 (Pokemon-API): ${priced} slabs priced so far`);

    // Phase 3: JustTCG (EN + JP support, 1000/day)
    try {
    const remaining3 = needsPricing.filter((s) => !pricedSlabIds.has(s.id));
    if (remaining3.length > 0 && this.justTcgService.isConfigured) {
      const remainingGroups = new Map<string, typeof remaining3>();
      for (const slab of remaining3) {
        const key = mkKey(slab.cardName!, slab.setName);
        if (!remainingGroups.has(key)) remainingGroups.set(key, []);
        remainingGroups.get(key)!.push(slab);
      }

      for (const [, groupSlabs] of remainingGroups) {
        const rep = groupSlabs[0];
        await sleep(JUSTTCG_DELAY_MS);
        let results = await this.justTcgService.searchCard(
          rep.cardName!,
          rep.setName ?? undefined,
          'pokemon',
        );
        if (results === null) {
          this.logger.warn('JustTCG: rate limited, stopping phase');
          break;
        }
        if (results.length === 0) {
          results = await this.justTcgService.searchCard(
            rep.cardName!,
            rep.setName ?? undefined,
            'pokemon-japan',
          );
          if (results === null) {
            this.logger.warn('JustTCG: rate limited (JP), stopping phase');
            break;
          }
        }
        if (!results || results.length === 0) continue;

        const match = findBestJustTcgMatch(results, rep.cardName!, rep.cardNumber, rep.setName);
        if (!match) continue;

        const rawPrice = this.justTcgService.extractPrice(match);
        if (!rawPrice || rawPrice <= 0) continue;

        for (const slab of groupSlabs) {
          const multiplier = getGradeMultiplier(slab.grader, slab.grade);
          await this.prisma.price.create({
            data: {
              slabId: slab.id,
              source: 'justtcg',
              marketPrice: Math.round(rawPrice * multiplier * 100) / 100,
              currency: 'USD',
              confidence: multiplier > 1.5 ? 'low' : 'medium',
              retrievedAt: new Date(),
              rawResponse: {
                justTcgCardId: match.id,
                rawPrice,
                gradeMultiplier: multiplier,
                grader: slab.grader,
                grade: slab.grade,
              } as any,
            },
          });
          pricedSlabIds.add(slab.id);
          priced++;
        }
      }
    }
    } catch (e) {
      this.logger.error(`Phase 3 (JustTCG) failed for ${ownerAddress}: ${e}`);
    }
    this.logger.log(`Phase 3 (JustTCG): ${priced} slabs priced so far`);

    // Phase 4: TCGdex fallback (variant-aware)
    try {
    const remaining4 = needsPricing.filter((s) => !pricedSlabIds.has(s.id));
    if (remaining4.length > 0) {
      const cardRefs = await this.prisma.cardReference.findMany({
        select: { ptcgCardId: true, cardName: true, cardNumber: true, setName: true },
      });
      const refByNameSet = new Map<string, string>();
      const refByNumSet = new Map<string, string>();
      for (const ref of cardRefs) {
        refByNameSet.set(
          `${ref.cardName.toLowerCase()}|${ref.setName.toLowerCase()}`,
          ref.ptcgCardId,
        );
        refByNumSet.set(
          `${ref.cardNumber}|${ref.setName.toLowerCase()}`,
          ref.ptcgCardId,
        );
      }

      const cardIdToSlabs = new Map<string, typeof remaining4>();
      for (const slab of remaining4) {
        const setKey = (slab.setName ?? '').toLowerCase();
        const ptcgCardId =
          refByNameSet.get(`${slab.cardName!.toLowerCase()}|${setKey}`) ??
          (slab.cardNumber ? refByNumSet.get(`${slab.cardNumber}|${setKey}`) : null);
        if (ptcgCardId) {
          if (!cardIdToSlabs.has(ptcgCardId)) cardIdToSlabs.set(ptcgCardId, []);
          cardIdToSlabs.get(ptcgCardId)!.push(slab);
        }
      }

      for (const [tcgCardId, cardSlabs] of cardIdToSlabs) {
        await sleep(TCGDEX_DELAY_MS);
        const cardPricing = await this.pokemonTcgService.getCardPricing(tcgCardId);
        if (!cardPricing?.pricing) continue;

        for (const slab of cardSlabs) {
          const rawPrice = this.pokemonTcgService.extractMarketPrice(
            cardPricing.pricing,
            slab.variant,
          );
          if (!rawPrice) continue;

          const multiplier = getGradeMultiplier(slab.grader, slab.grade);
          await this.prisma.price.create({
            data: {
              slabId: slab.id,
              source: 'tcgdex',
              marketPrice: Math.round(rawPrice.price * multiplier * 100) / 100,
              currency: rawPrice.currency,
              confidence: multiplier > 1 ? 'low' : 'medium',
              retrievedAt: new Date(),
              rawResponse: {
                rawPrice: rawPrice.price,
                variant: rawPrice.variant,
                gradeMultiplier: multiplier,
                grader: slab.grader,
                grade: slab.grade,
              } as any,
            },
          });
          priced++;
        }
      }
    }
    } catch (e) {
      this.logger.error(`Phase 4 (TCGdex) failed for ${ownerAddress}: ${e}`);
    }

    this.logger.log(`Priced ${priced}/${needsPricing.length} slabs for ${ownerAddress}`);
    return priced;
  }

  private async flushPrices(
    inserts: Parameters<typeof this.prisma.price.create>[0]['data'][],
  ) {
    await Promise.all(
      inserts.map((data) => this.prisma.price.create({ data })),
    );
  }
}
