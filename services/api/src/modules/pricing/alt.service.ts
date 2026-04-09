import { Injectable, Logger } from '@nestjs/common';

const ALT_GRAPHQL_URL =
  'https://alt-platform-server.production.internal.onlyalt.com/graphql/Cert';

const CERT_QUERY = `
  query Cert($cn: String!) {
    cert(certNumber: $cn) {
      certNumber
      gradingCompany
      gradeNumber
      asset {
        id
        name
        year
        brand
        subject
        category
        variety
        pricingData(marketTransactionFilter: {}, tsFilter: {}) {
          altValueTimeSeries {
            data
          }
        }
      }
    }
  }
`;

export interface AltPriceResult {
  price: number;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  certNumber: string;
  cardName: string | null;
  gradingCompany: string | null;
  gradeNumber: string | null;
  priceHistory: number[];
}

@Injectable()
export class AltService {
  private readonly logger = new Logger(AltService.name);

  /**
   * Fetch the current Alt Value for a graded card by certificate number.
   * Returns null if the cert is not found or the API is unreachable.
   */
  async getPriceByCert(certNumber: string): Promise<AltPriceResult | null> {
    try {
      this.logger.debug(`Alt.xyz lookup: cert ${certNumber}`);

      const res = await fetch(ALT_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: CERT_QUERY,
          variables: { cn: certNumber },
        }),
      });

      if (!res.ok) {
        this.logger.warn(`Alt.xyz returned ${res.status} for cert ${certNumber}`);
        return null;
      }

      const body = await res.json();
      const cert = body?.data?.cert;

      if (!cert?.asset) {
        this.logger.debug(`Alt.xyz: no asset found for cert ${certNumber}`);
        return null;
      }

      const timeSeries: number[] =
        cert.asset.pricingData?.altValueTimeSeries?.data ?? [];

      if (timeSeries.length === 0) {
        this.logger.debug(`Alt.xyz: no price data for cert ${certNumber}`);
        return null;
      }

      // Latest value in the time series is the current Alt Value
      const currentPrice = timeSeries[timeSeries.length - 1];

      if (!currentPrice || currentPrice <= 0) {
        return null;
      }

      const confidence: 'high' | 'medium' | 'low' =
        timeSeries.length >= 30 ? 'high' : timeSeries.length >= 7 ? 'medium' : 'low';

      return {
        price: Math.round(currentPrice * 100) / 100,
        confidence,
        source: 'alt.xyz',
        certNumber: cert.certNumber,
        cardName: cert.asset.name ?? null,
        gradingCompany: cert.gradingCompany ?? null,
        gradeNumber: cert.gradeNumber ?? null,
        priceHistory: timeSeries,
      };
    } catch (e) {
      this.logger.error(`Alt.xyz error for cert ${certNumber}: ${e}`);
      return null;
    }
  }
}
