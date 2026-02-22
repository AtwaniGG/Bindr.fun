import { Injectable, Logger } from '@nestjs/common';

const EBAY_AUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_URL =
  'https://api.ebay.com/buy/browse/v1/item_summary/search';
const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const POKEMON_TCG_CATEGORY = '183454';

export interface EbayItemSummary {
  itemId: string;
  title: string;
  price: { value: string; currency: string };
  buyingOptions: string[];
}

interface EbaySearchResponse {
  total: number;
  itemSummaries?: EbayItemSummary[];
}

export interface EbayPriceResult {
  price: number;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  sampleSize: number;
  listings: Array<{ title: string; price: number; itemId: string }>;
}

@Injectable()
export class EbayService {
  private readonly logger = new Logger(EbayService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private get clientId(): string {
    return process.env.EBAY_CLIENT_ID || '';
  }
  private get clientSecret(): string {
    return process.env.EBAY_CLIENT_SECRET || '';
  }

  isAvailable(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(
        `${this.clientId}:${this.clientSecret}`,
      ).toString('base64');

      const res = await fetch(EBAY_AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`,
      });

      if (!res.ok) {
        this.logger.error(`eBay OAuth failed: ${res.status} ${res.statusText}`);
        return null;
      }

      const data = await res.json();
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
      return this.accessToken;
    } catch (e) {
      this.logger.error(`eBay OAuth error: ${e}`);
      return null;
    }
  }

  /**
   * Search eBay active Buy It Now listings for a graded Pokemon card.
   * Returns null on auth/rate-limit failure, empty array on no results.
   */
  async searchGradedListings(
    cardName: string,
    setName: string | null,
    grader: string,
    grade: string,
  ): Promise<EbayItemSummary[] | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    const queryParts = [grader.toUpperCase(), grade, cardName];
    if (setName) queryParts.push(setName);
    const q = queryParts.join(' ');

    const url = new URL(EBAY_BROWSE_URL);
    url.searchParams.set('q', q);
    url.searchParams.set('category_ids', POKEMON_TCG_CATEGORY);
    url.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE}');
    url.searchParams.set('sort', 'price');
    url.searchParams.set('limit', '15');

    try {
      this.logger.debug(`eBay search: "${q}"`);
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      });

      if (res.status === 429) {
        this.logger.warn('eBay Browse API rate limited');
        return null;
      }

      if (!res.ok) {
        this.logger.error(
          `eBay search failed: ${res.status} ${res.statusText}`,
        );
        return [];
      }

      const body: EbaySearchResponse = await res.json();
      return body.itemSummaries ?? [];
    } catch (e) {
      this.logger.error(`eBay search error: ${e}`);
      return [];
    }
  }

  /**
   * Filter listings by title relevance and compute median price.
   * Returns null if fewer than 2 relevant listings match.
   */
  extractGradedPrice(
    listings: EbayItemSummary[],
    cardName: string,
    grader: string,
    grade: string,
  ): EbayPriceResult | null {
    if (listings.length === 0) return null;

    const nameLower = cardName.toLowerCase();
    const graderLower = grader.toLowerCase();
    const gradeStr = String(grade);

    // Filter: title must mention card name + grader + grade
    const relevant = listings.filter((item) => {
      const t = item.title.toLowerCase();
      const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 2);
      const hasName = nameWords.some((w) => t.includes(w));
      const hasGrader = t.includes(graderLower);
      const hasGrade =
        t.includes(`${graderLower} ${gradeStr}`) ||
        t.includes(`${graderLower}${gradeStr}`);
      return hasName && hasGrader && hasGrade;
    });

    if (relevant.length < 2) return null;

    const prices = relevant
      .map((item) => parseFloat(item.price.value))
      .filter((p) => !isNaN(p) && p > 0)
      .sort((a, b) => a - b);

    if (prices.length < 2) return null;

    // Remove outliers: drop below 10% or above 500% of rough median
    const roughMedian = prices[Math.floor(prices.length / 2)];
    const filtered = prices.filter(
      (p) => p >= roughMedian * 0.1 && p <= roughMedian * 5,
    );

    if (filtered.length < 2) return null;

    // Median
    const mid = Math.floor(filtered.length / 2);
    const median =
      filtered.length % 2 === 0
        ? (filtered[mid - 1] + filtered[mid]) / 2
        : filtered[mid];

    const confidence: 'high' | 'medium' | 'low' =
      filtered.length >= 5 ? 'high' : filtered.length >= 3 ? 'medium' : 'low';

    return {
      price: Math.round(median * 100) / 100,
      confidence,
      source: `ebay:browse:${graderLower}${gradeStr}:median`,
      sampleSize: filtered.length,
      listings: relevant.slice(0, 5).map((item) => ({
        title: item.title,
        price: parseFloat(item.price.value),
        itemId: item.itemId,
      })),
    };
  }
}
