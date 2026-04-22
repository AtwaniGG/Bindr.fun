import { Inject, Injectable, Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import axios from 'axios';
import {
  SLAB_MINT_ADDRESS,
  SLAB_DECIMALS,
  GACHA_PRICE_CACHE_TTL_S,
} from '@pokedex-slabs/shared';
import { REDIS_CLIENT } from './redis.provider';
import { PrismaService } from '../../prisma/prisma.service';

interface PriceResult {
  priceUsd: number;
  tokensRequired: string;
  tokensRequiredRaw: string;
  burnAmountUsd: number;
}

@Injectable()
export class GachaPriceService {
  private readonly logger = new Logger(GachaPriceService.name);
  private readonly CACHE_KEY = 'gacha:slab_price';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: IORedis,
    private readonly prisma: PrismaService,
  ) {}

  async getSlabTokenPrice(): Promise<PriceResult> {
    // Get burn amount from DB config (beta mode overrides to betaPriceUsd)
    const config = await this.prisma.gachaConfig.findFirst({ where: { id: 'default' } });
    const burnAmountUsd = config?.betaMode
      ? Number(config.betaPriceUsd)
      : config
        ? Number(config.burnAmountUsd)
        : 25;

    // Check Redis cache first
    const cached = await this.redis.get(this.CACHE_KEY);
    if (cached) {
      const priceUsd = parseFloat(cached);
      if (priceUsd > 0) {
        return this.buildPriceResult(priceUsd, burnAmountUsd);
      }
    }

    // Fetch fresh price
    const priceUsd = await this.fetchPrice();
    if (!priceUsd || priceUsd <= 0) {
      throw new Error('Unable to fetch $SLAB price — gacha pulls are temporarily unavailable');
    }

    // Cache for 60s
    await this.redis.setex(this.CACHE_KEY, GACHA_PRICE_CACHE_TTL_S, priceUsd.toString());

    return this.buildPriceResult(priceUsd, burnAmountUsd);
  }

  private async fetchPrice(): Promise<number | null> {
    // Primary: GeckoTerminal (works for low-liquidity pump.fun tokens)
    const geckoPrice = await this.fetchFromGeckoTerminal();
    if (geckoPrice) return geckoPrice;

    // Fallback: DexScreener
    const dexPrice = await this.fetchFromDexScreener();
    if (dexPrice) return dexPrice;

    // Fallback: Jupiter
    const jupPrice = await this.fetchFromJupiter();
    if (jupPrice) return jupPrice;

    // Last resort: manual fallback price from env var (for testing or emergencies)
    const fallback = process.env.SLAB_FALLBACK_PRICE_USD;
    if (fallback) {
      const price = parseFloat(fallback);
      if (price > 0) {
        this.logger.warn(`Using fallback SLAB price: $${price}`);
        return price;
      }
    }

    this.logger.error('All price feeds failed for $SLAB');
    return null;
  }

  private async fetchFromGeckoTerminal(): Promise<number | null> {
    try {
      const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${SLAB_MINT_ADDRESS}`;
      const { data } = await axios.get(url, { timeout: 10_000 });
      const price = parseFloat(data?.data?.attributes?.price_usd);
      if (price > 0) {
        this.logger.log(`GeckoTerminal SLAB price: $${price}`);
        return price;
      }
      return null;
    } catch (err) {
      this.logger.warn(`GeckoTerminal price fetch failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async fetchFromDexScreener(): Promise<number | null> {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${SLAB_MINT_ADDRESS}`;
      const { data } = await axios.get(url, { timeout: 10_000 });

      if (data?.pairs?.length > 0) {
        // Use the pair with highest liquidity
        const sorted = [...data.pairs].sort(
          (a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
        );
        const price = parseFloat(sorted[0].priceUsd);
        if (price > 0) {
          this.logger.log(`DexScreener SLAB price: $${price}`);
          return price;
        }
      }

      return null;
    } catch (err) {
      this.logger.warn(`DexScreener price fetch failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async fetchFromJupiter(): Promise<number | null> {
    try {
      const url = `https://price.jup.ag/v6/price?ids=${SLAB_MINT_ADDRESS}`;
      const { data } = await axios.get(url, { timeout: 10_000 });

      const price = data?.data?.[SLAB_MINT_ADDRESS]?.price;
      if (price && price > 0) {
        this.logger.log(`Jupiter SLAB price: $${price}`);
        return price;
      }

      return null;
    } catch (err) {
      this.logger.warn(`Jupiter price fetch failed: ${(err as Error).message}`);
      return null;
    }
  }

  private buildPriceResult(priceUsd: number, burnAmountUsd: number): PriceResult {
    const tokensDecimal = burnAmountUsd / priceUsd;
    const tokensRequired = tokensDecimal.toFixed(SLAB_DECIMALS);
    const tokensRequiredRaw = Math.ceil(tokensDecimal * 10 ** SLAB_DECIMALS).toString();

    return {
      priceUsd,
      tokensRequired,
      tokensRequiredRaw,
      burnAmountUsd,
    };
  }
}
