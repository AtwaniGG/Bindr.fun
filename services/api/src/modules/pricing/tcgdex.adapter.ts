import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PokemonTcgService } from '../pokemon-tcg/pokemon-tcg.service';
import { PricingAdapter } from './pricing-adapter.interface';

/**
 * Dynamic grade multipliers using a bell-curve model.
 *
 * Grading premium (as a multiplier) is highest for mid-range raw cards ($15-$40)
 * and declines for both very cheap cards (not worth grading) and very expensive
 * cards (already priced high raw). A minimum floor ensures graded cards never
 * price below the cost of grading.
 *
 * Model: multiplier = base + (peak - base) × (P/mid) × e^(1 - P/mid)
 *   - Peaks at rawPrice = midpoint, where multiplier = peak
 *   - Declines smoothly for rawPrice >> midpoint
 *   - Plus a floor price to prevent sub-$1 graded prices
 *
 * Calibrated against PriceTracker eBay sold data:
 *   Charizard TCG Classic raw ~$180 → PSA 10 $557 ≈ 3.1x
 *   Gengar Expedition raw ~$80 → CGC 9 $215 ≈ 2.7x
 */

interface GradeCurve {
  base: number;     // minimum multiplier (asymptote for very cheap / very expensive)
  peak: number;     // peak multiplier at the midpoint
  midpoint: number; // raw price where multiplier is highest
  floor: number;    // minimum graded price in USD
}

const GRADE_CURVES: Record<string, Record<number, GradeCurve>> = {
  psa: {
    10: { base: 3,   peak: 10, midpoint: 25, floor: 5 },
    9:  { base: 1.8, peak: 6,  midpoint: 30, floor: 3 },
    8:  { base: 1.3, peak: 3,  midpoint: 35, floor: 2 },
    7:  { base: 1.1, peak: 2,  midpoint: 40, floor: 2 },
    6:  { base: 0.9, peak: 1.4, midpoint: 40, floor: 1.5 },
    5:  { base: 0.8, peak: 1.2, midpoint: 40, floor: 1 },
    4:  { base: 0.7, peak: 1,  midpoint: 40, floor: 1 },
    3:  { base: 0.6, peak: 0.9, midpoint: 40, floor: 1 },
  },
  cgc: {
    10: { base: 3.5, peak: 12, midpoint: 25, floor: 5 },
    9:  { base: 1.8, peak: 4.5, midpoint: 30, floor: 3 },
    8:  { base: 1.3, peak: 2.5, midpoint: 35, floor: 2 },
    7:  { base: 1.1, peak: 1.8, midpoint: 40, floor: 2 },
    6:  { base: 0.9, peak: 1.3, midpoint: 40, floor: 1.5 },
    5:  { base: 0.8, peak: 1.2, midpoint: 40, floor: 1 },
    4:  { base: 0.7, peak: 1,  midpoint: 40, floor: 1 },
    3:  { base: 0.6, peak: 0.9, midpoint: 40, floor: 1 },
  },
  bgs: {
    10: { base: 4,   peak: 15, midpoint: 20, floor: 6 },
    9:  { base: 2,   peak: 7,  midpoint: 25, floor: 4 },
    8:  { base: 1.3, peak: 3,  midpoint: 35, floor: 2 },
    7:  { base: 1.1, peak: 2,  midpoint: 40, floor: 2 },
    6:  { base: 0.9, peak: 1.4, midpoint: 40, floor: 1.5 },
    5:  { base: 0.8, peak: 1.2, midpoint: 40, floor: 1 },
    4:  { base: 0.7, peak: 1,  midpoint: 40, floor: 1 },
    3:  { base: 0.6, peak: 0.9, midpoint: 40, floor: 1 },
  },
  sgc: {
    10: { base: 2.5, peak: 8,  midpoint: 30, floor: 4 },
    9:  { base: 1.5, peak: 4,  midpoint: 35, floor: 3 },
    8:  { base: 1.2, peak: 2.5, midpoint: 40, floor: 2 },
    7:  { base: 1.1, peak: 1.8, midpoint: 40, floor: 2 },
    6:  { base: 0.9, peak: 1.3, midpoint: 40, floor: 1.5 },
    5:  { base: 0.8, peak: 1.2, midpoint: 40, floor: 1 },
    4:  { base: 0.7, peak: 1,  midpoint: 40, floor: 1 },
    3:  { base: 0.6, peak: 0.9, midpoint: 40, floor: 1 },
  },
};

/**
 * Bell-curve multiplier: peaks at midpoint, declines for expensive cards.
 * Formula: mult = base + (peak - base) × (P/mid) × e^(1 - P/mid)
 * Returns max(floor, rawPrice × multiplier).
 */
function getGradedPrice(
  grader: string | null,
  grade: string | null,
  rawPrice: number,
): { price: number; multiplier: number } {
  if (!grader || !grade) return { price: rawPrice, multiplier: 1 };
  const gradeFloat = parseFloat(grade);
  if (isNaN(gradeFloat)) return { price: rawPrice, multiplier: 1 };

  const curves = GRADE_CURVES[grader.toLowerCase()];
  if (!curves) return { price: rawPrice, multiplier: 1 };

  const curve = curves[gradeFloat] ?? curves[Math.floor(gradeFloat)];
  if (!curve) return { price: rawPrice, multiplier: 1 };

  // Bell curve: rises to peak at midpoint, then declines
  const ratio = rawPrice / curve.midpoint;
  const bellFactor = ratio * Math.exp(1 - ratio);
  const multiplier = curve.base + (curve.peak - curve.base) * bellFactor;

  const computed = rawPrice * multiplier;
  const price = Math.max(curve.floor, Math.round(computed * 100) / 100);
  const effectiveMult = Math.round((price / Math.max(rawPrice, 0.01)) * 100) / 100;

  return { price, multiplier: effectiveMult };
}

@Injectable()
export class TcgdexAdapter implements PricingAdapter {
  private readonly logger = new Logger(TcgdexAdapter.name);

  constructor(
    private prisma: PrismaService,
    private pokemonTcgService: PokemonTcgService,
  ) {}

  async getPriceByCert(certNumber: string): Promise<{
    priceUsd: number | null;
    retrievedAt: Date;
  }> {
    // 1. Look up the slab by cert number
    const slab = await this.prisma.slab.findFirst({
      where: { certNumber },
      select: {
        cardName: true,
        cardNumber: true,
        setName: true,
        variant: true,
        grader: true,
        grade: true,
      },
    });

    if (!slab?.cardName) {
      this.logger.debug(`No slab found for cert ${certNumber}`);
      return { priceUsd: null, retrievedAt: new Date() };
    }

    // 2. Find the matching CardReference → ptcgCardId
    const ptcgCardId = await this.findCardId(
      slab.cardName,
      slab.cardNumber,
      slab.setName,
    );

    if (!ptcgCardId) {
      this.logger.debug(
        `No CardReference match for "${slab.cardName}" #${slab.cardNumber} (${slab.setName})`,
      );
      return { priceUsd: null, retrievedAt: new Date() };
    }

    // 3. Fetch pricing from TCGdex
    const cardPricing = await this.pokemonTcgService.getCardPricing(ptcgCardId);
    if (!cardPricing?.pricing) {
      this.logger.debug(`No pricing data from TCGdex for ${ptcgCardId}`);
      return { priceUsd: null, retrievedAt: new Date() };
    }

    // 4. Extract market price (variant-aware)
    const rawPrice = this.pokemonTcgService.extractMarketPrice(
      cardPricing.pricing,
      slab.variant,
    );

    if (!rawPrice) {
      this.logger.debug(`No market price extractable for ${ptcgCardId}`);
      return { priceUsd: null, retrievedAt: new Date() };
    }

    // 5. Apply dynamic grade multiplier (bell-curve: peaks for mid-range, declines for expensive)
    const graded = getGradedPrice(slab.grader, slab.grade, rawPrice.price);

    this.logger.debug(
      `cert:${certNumber} → ${ptcgCardId} → $${rawPrice.price} × ${graded.multiplier} (${slab.grader} ${slab.grade}) = $${graded.price}`,
    );

    return {
      priceUsd: graded.price,
      retrievedAt: new Date(),
    };
  }

  /**
   * Find the TCGdex card ID by matching slab fields to CardReference.
   * Tries: cardName + cardNumber + setName → cardName + setName → cardName + cardNumber
   */
  private async findCardId(
    cardName: string,
    cardNumber: string | null,
    setName: string | null,
  ): Promise<string | null> {
    // Normalize card number: strip set-total suffix and leading zeros
    // e.g. "048/172" → "48", "025" → "25", "TG29/TG30" → "TG29"
    const normalizedNum = cardNumber
      ?.replace(/\/\d+$/, '')   // strip "/172" but keep "/TG30" style
      .replace(/^0+/, '')       // strip leading zeros
      || null;

    // Strategy 1: exact name + number + set
    if (normalizedNum && setName) {
      const match = await this.prisma.cardReference.findFirst({
        where: {
          cardName: { equals: cardName, mode: 'insensitive' },
          cardNumber: normalizedNum,
          setName: { equals: setName, mode: 'insensitive' },
        },
        select: { ptcgCardId: true },
      });
      if (match) return match.ptcgCardId;
    }

    // Strategy 2: exact name + set (no card number)
    if (setName) {
      const match = await this.prisma.cardReference.findFirst({
        where: {
          cardName: { equals: cardName, mode: 'insensitive' },
          setName: { equals: setName, mode: 'insensitive' },
        },
        select: { ptcgCardId: true },
      });
      if (match) return match.ptcgCardId;
    }

    // Strategy 3: exact name + number (any set)
    if (normalizedNum) {
      const match = await this.prisma.cardReference.findFirst({
        where: {
          cardName: { equals: cardName, mode: 'insensitive' },
          cardNumber: normalizedNum,
        },
        select: { ptcgCardId: true },
      });
      if (match) return match.ptcgCardId;
    }

    // Strategy 4: name only (if unambiguous — single result)
    const byName = await this.prisma.cardReference.findMany({
      where: {
        cardName: { equals: cardName, mode: 'insensitive' },
      },
      select: { ptcgCardId: true },
      take: 2,
    });
    if (byName.length === 1) return byName[0].ptcgCardId;

    return null;
  }
}
