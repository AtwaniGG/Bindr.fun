import { Injectable, Logger } from '@nestjs/common';

const API_BASE = 'https://www.pokemonpricetracker.com';

export interface PriceTrackerSmartPrice {
  price: number;
  confidence: 'high' | 'medium' | 'low';
  method: string;
  daysUsed: number;
}

export interface PriceTrackerEbayGrade {
  count?: number;
  averagePrice?: number;
  medianPrice?: number;
  minPrice?: number;
  maxPrice?: number;
  smartMarketPrice?: PriceTrackerSmartPrice;
}

export interface PriceTrackerCard {
  name?: string;
  setName?: string;
  cardNumber?: string;
  tcgPlayerId?: string;
  prices?: {
    market?: number;
    low?: number;
  };
  ebay?: {
    salesByGrade?: {
      [key: string]: PriceTrackerEbayGrade | undefined;
    };
    totalSales?: number;
  };
}

export interface PriceTrackerResponse {
  data?: PriceTrackerCard[];
  metadata?: { total?: number; count?: number };
}

@Injectable()
export class PriceTrackerService {
  private readonly logger = new Logger(PriceTrackerService.name);
  private dailyRemaining: number | null = null;

  private get apiKey(): string {
    return process.env.POKEMON_PRICE_TRACKER_API_KEY || '';
  }

  get creditsRemaining(): number | null {
    return this.dailyRemaining;
  }

  /**
   * Returns null on rate limit (429) so caller can distinguish from empty results.
   */
  async searchCards(query: string, includeEbay = false): Promise<PriceTrackerCard[] | null> {
    if (!this.apiKey) {
      this.logger.warn('POKEMON_PRICE_TRACKER_API_KEY not set');
      return [];
    }

    try {
      const url = new URL(`${API_BASE}/api/v2/cards`);
      url.searchParams.set('search', query);
      if (includeEbay) url.searchParams.set('includeEbay', 'true');
      url.searchParams.set('limit', '5');

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      // Track remaining credits from response headers
      const remaining = res.headers.get('x-ratelimit-daily-remaining');
      if (remaining) {
        this.dailyRemaining = parseInt(remaining, 10);
      }

      if (res.status === 429 || res.status === 403) {
        return null; // Signal rate limit / quota exhausted to caller
      }

      if (!res.ok) {
        this.logger.error(`PriceTracker error: ${res.status} ${res.statusText}`);
        return [];
      }

      const body: PriceTrackerResponse = await res.json();
      return body.data ?? (Array.isArray(body) ? body : []);
    } catch (e) {
      this.logger.error(`PriceTracker fetch failed: ${e}`);
      return [];
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Find the best matching card from search results.
   * Uses strict matching - never falls back blindly to results[0].
   */
  findBestMatch(
    results: PriceTrackerCard[],
    cardName: string,
    setName?: string,
    cardNumber?: string,
  ): PriceTrackerCard | null {
    if (results.length === 0) return null;

    const nameLower = cardName.toLowerCase().trim();
    const setLower = setName?.toLowerCase().trim();
    const numLower = cardNumber?.toLowerCase().trim();

    // 1. Exact cardNumber + setName match
    if (numLower && setLower) {
      const match = results.find(
        (c) =>
          c.cardNumber?.toLowerCase().trim() === numLower &&
          c.setName?.toLowerCase().trim() === setLower,
      );
      if (match) return match;
    }

    // 2. Exact name + setName match
    if (setLower) {
      const match = results.find(
        (c) =>
          c.name?.toLowerCase().trim() === nameLower &&
          c.setName?.toLowerCase().trim() === setLower,
      );
      if (match) return match;
    }

    // 3. Partial name + setName match
    if (setLower) {
      const match = results.find((c) => {
        const cName = c.name?.toLowerCase().trim() ?? '';
        const cSet = c.setName?.toLowerCase().trim();
        return (
          cSet === setLower &&
          (cName.includes(nameLower) || nameLower.includes(cName))
        );
      });
      if (match) return match;
    }

    // 4. Exact name match (any set)
    const byName = results.find(
      (c) => c.name?.toLowerCase().trim() === nameLower,
    );
    if (byName) return byName;

    // 5. Single result with substring match
    if (results.length === 1) {
      const rName = results[0].name?.toLowerCase().trim() ?? '';
      if (rName.includes(nameLower) || nameLower.includes(rName)) {
        return results[0];
      }
    }

    return null;
  }

  /**
   * Extract graded price from eBay sold data for a specific grade.
   * Returns the most reliable price available (smartMarketPrice > medianPrice > averagePrice).
   */
  extractGradedPrice(
    card: PriceTrackerCard,
    grader: string,
    grade: string,
  ): { price: number; confidence: 'high' | 'medium'; source: string } | null {
    const gradeData = card.ebay?.salesByGrade;
    if (!gradeData) {
      this.logger.debug(`No eBay salesByGrade data for "${card.name}" (${card.setName})`);
      return null;
    }

    const gradeFloat = parseFloat(grade);
    if (isNaN(gradeFloat)) {
      this.logger.debug(`Invalid grade "${grade}" for "${card.name}"`);
      return null;
    }

    const graderLower = grader.toLowerCase();

    // API returns keys like "psa10", "cgc9.5", "bgs9" — grader + grade concatenated
    const prefixedExact = `${graderLower}${gradeFloat}`;               // "psa10", "cgc9.5"
    const prefixedRounded = `${graderLower}${Math.round(gradeFloat)}`; // "psa10"
    const prefixedFloor = `${graderLower}${Math.floor(gradeFloat)}`;   // "psa9" for 9.5

    // Also try plain numeric keys as fallback
    const plainExact = String(gradeFloat);
    const plainRounded = String(Math.round(gradeFloat));

    const entry =
      gradeData[prefixedExact] ??
      gradeData[prefixedRounded] ??
      gradeData[prefixedFloor] ??
      gradeData[plainExact] ??
      gradeData[plainRounded];

    if (!entry) {
      this.logger.debug(
        `No eBay grade entry for "${card.name}". Tried: [${prefixedExact}, ${prefixedRounded}, ${plainExact}]. Available: [${Object.keys(gradeData).join(', ')}]`,
      );
      return null;
    }

    if (entry.smartMarketPrice && entry.smartMarketPrice.price > 0) {
      return {
        price: Math.round(entry.smartMarketPrice.price * 100) / 100,
        confidence: entry.smartMarketPrice.confidence === 'low' ? 'medium' : 'high',
        source: `price-tracker:ebay:${grader.toLowerCase()}${gradeFloat}:smart`,
      };
    }

    if (entry.medianPrice && entry.medianPrice > 0) {
      return {
        price: Math.round(entry.medianPrice * 100) / 100,
        confidence: 'medium',
        source: `price-tracker:ebay:${grader.toLowerCase()}${gradeFloat}:median`,
      };
    }

    if (entry.averagePrice && entry.averagePrice > 0) {
      return {
        price: Math.round(entry.averagePrice * 100) / 100,
        confidence: 'medium',
        source: `price-tracker:ebay:${grader.toLowerCase()}${gradeFloat}:average`,
      };
    }

    return null;
  }

  /**
   * Extract raw (ungraded) market price from a PriceTracker card.
   */
  extractRawPrice(card: PriceTrackerCard): { price: number; currency: string } | null {
    if (card.prices?.market && card.prices.market > 0) {
      return { price: card.prices.market, currency: 'USD' };
    }
    if (card.prices?.low && card.prices.low > 0) {
      return { price: card.prices.low, currency: 'USD' };
    }
    return null;
  }
}
