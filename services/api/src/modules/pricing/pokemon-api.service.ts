import { Injectable, Logger } from '@nestjs/common';

const API_HOST = 'pokemon-tcg-api.p.rapidapi.com';
const API_BASE = `https://${API_HOST}`;

export interface PokemonApiGraded {
  psa?: Record<string, number>;
  cgc?: Record<string, number>;
  bgs?: Record<string, number>;
}

export interface PokemonApiCard {
  id: string;
  name: string;
  card_number?: string;
  rarity?: string;
  episode?: {
    code?: string;
    name?: string;
  };
  prices?: {
    tcgplayer?: {
      market?: number;
      low?: number;
      currency?: string;
    };
    cardmarket?: {
      avg1?: number;
      avg7?: number;
      avg30?: number;
      currency?: string;
    };
    graded?: PokemonApiGraded;
  };
}

interface SearchResponse {
  data?: PokemonApiCard[];
  results?: PokemonApiCard[];
  // API may return cards at top level too
  [key: string]: unknown;
}

@Injectable()
export class PokemonApiService {
  private readonly logger = new Logger(PokemonApiService.name);

  private get apiKey(): string {
    return process.env.RAPIDAPI_KEY || '';
  }

  get isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  constructor() {
    if (!this.apiKey) {
      this.logger.warn(
        'RAPIDAPI_KEY not set - Pokemon-API.com graded pricing will be unavailable',
      );
    }
  }

  /**
   * Search for cards by name, optionally filtered by set.
   */
  async searchCards(query: string): Promise<PokemonApiCard[]> {
    if (!this.apiKey) return [];

    try {
      const url = new URL(`${API_BASE}/cards`);
      url.searchParams.set('search', query);

      const res = await fetch(url.toString(), {
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': API_HOST,
        },
      });

      if (res.status === 429) {
        this.logger.warn('Pokemon-API rate limited (100/day free tier)');
        return [];
      }

      if (!res.ok) {
        this.logger.error(`Pokemon-API error: ${res.status} ${res.statusText}`);
        return [];
      }

      const body: SearchResponse = await res.json();
      // Handle various response shapes
      const cards = body.data ?? body.results ?? [];
      return Array.isArray(cards) ? cards : [];
    } catch (e) {
      this.logger.error(`Pokemon-API fetch failed: ${e}`);
      return [];
    }
  }

  /**
   * Find the best matching card from search results.
   */
  findBestMatch(
    results: PokemonApiCard[],
    cardName: string,
    setName?: string | null,
    cardNumber?: string | null,
  ): PokemonApiCard | null {
    if (results.length === 0) return null;

    const nameLower = cardName.toLowerCase().trim();
    const setLower = setName?.toLowerCase().trim();
    const numNormalized = cardNumber
      ?.replace(/\/\d+$/, '')
      .replace(/^0+/, '')
      .toLowerCase()
      .trim();

    // 1. Exact name + set + number
    if (setLower && numNormalized) {
      const match = results.find(
        (c) =>
          c.name?.toLowerCase().trim() === nameLower &&
          c.episode?.name?.toLowerCase().trim() === setLower &&
          c.card_number?.toLowerCase().trim() === numNormalized,
      );
      if (match) return match;
    }

    // 2. Exact name + set (partial match on set name)
    if (setLower) {
      const match = results.find((c) => {
        const cName = c.name?.toLowerCase().trim() ?? '';
        const cSet = c.episode?.name?.toLowerCase().trim() ?? '';
        return (
          cName === nameLower &&
          (cSet === setLower ||
            cSet.includes(setLower) ||
            setLower.includes(cSet))
        );
      });
      if (match) return match;
    }

    // 3. Exact name + number (any set)
    if (numNormalized) {
      const match = results.find(
        (c) =>
          c.name?.toLowerCase().trim() === nameLower &&
          c.card_number?.toLowerCase().trim() === numNormalized,
      );
      if (match) return match;
    }

    // 4. Exact name match (first result)
    const byName = results.find(
      (c) => c.name?.toLowerCase().trim() === nameLower,
    );
    if (byName) return byName;

    // 5. Partial name match if only 1 result
    if (results.length === 1) {
      const rName = results[0].name?.toLowerCase().trim() ?? '';
      if (rName.includes(nameLower) || nameLower.includes(rName)) {
        return results[0];
      }
    }

    return null;
  }

  /**
   * Extract the graded price for a specific grader + grade from a card's pricing data.
   * Returns null if no graded data exists for that combination.
   */
  extractGradedPrice(
    card: PokemonApiCard,
    grader: string,
    grade: string,
  ): { price: number; source: string } | null {
    const graded = card.prices?.graded;
    if (!graded) return null;

    const graderLower = grader.toLowerCase();
    const gradeFloat = parseFloat(grade);
    if (isNaN(gradeFloat)) return null;

    // Map grader names to API keys
    const graderKey =
      graderLower === 'psa'
        ? 'psa'
        : graderLower === 'cgc'
          ? 'cgc'
          : graderLower === 'bgs' || graderLower === 'beckett'
            ? 'bgs'
            : graderLower;

    const graderData = graded[graderKey as keyof PokemonApiGraded];
    if (!graderData) return null;

    // Try exact key: "psa10", "cgc9.5", "bgs9"
    const exactKey = `${graderKey}${gradeFloat}`;
    const roundedKey = `${graderKey}${Math.round(gradeFloat)}`;
    const plainKey = String(gradeFloat);
    const plainRounded = String(Math.round(gradeFloat));

    const price =
      graderData[exactKey] ??
      graderData[roundedKey] ??
      graderData[plainKey] ??
      graderData[plainRounded];

    if (price && price > 0) {
      return {
        price: Math.round(price * 100) / 100,
        source: `pokemon-api:graded:${graderKey}${gradeFloat}`,
      };
    }

    return null;
  }

  /**
   * Extract raw (ungraded) market price as fallback.
   */
  extractRawPrice(
    card: PokemonApiCard,
  ): { price: number; currency: string } | null {
    const tcg = card.prices?.tcgplayer;
    if (tcg?.market && tcg.market > 0) {
      return { price: tcg.market, currency: tcg.currency ?? 'USD' };
    }
    if (tcg?.low && tcg.low > 0) {
      return { price: tcg.low, currency: tcg.currency ?? 'USD' };
    }

    const cm = card.prices?.cardmarket;
    if (cm?.avg7 && cm.avg7 > 0) {
      // Convert EUR to approximate USD
      return { price: Math.round(cm.avg7 * 1.08 * 100) / 100, currency: 'USD' };
    }

    return null;
  }
}
