import { PricingAdapter, PriceResult } from './types';

const ALT_GRAPHQL_URL =
  'https://alt-platform-server.production.internal.onlyalt.com/graphql/Cert';

const CERT_QUERY = `
  query Cert($cn: String!) {
    cert(certNumber: $cn) {
      certNumber
      gradingCompany
      gradeNumber
      asset {
        name
        pricingData(marketTransactionFilter: {}, tsFilter: {}) {
          altValueTimeSeries {
            data
          }
        }
      }
    }
  }
`;

/**
 * ALT.xyz pricing adapter.
 * Fetches market price for a slab using its certificate number
 * via Alt's public GraphQL API (no auth required).
 */
export class AltPricingAdapter implements PricingAdapter {
  async getPriceByCert(certNumber: string): Promise<PriceResult | null> {
    try {
      const res = await fetch(ALT_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: CERT_QUERY,
          variables: { cn: certNumber },
        }),
      });

      if (!res.ok) {
        console.warn(`[AltAdapter] Alt.xyz returned ${res.status} for cert ${certNumber}`);
        return null;
      }

      const body = await res.json();
      const cert = body?.data?.cert;

      if (!cert?.asset) return null;

      const timeSeries: number[] =
        cert.asset.pricingData?.altValueTimeSeries?.data ?? [];

      if (timeSeries.length === 0) return null;

      const currentPrice = timeSeries[timeSeries.length - 1];
      if (!currentPrice || currentPrice <= 0) return null;

      const confidence: 'high' | 'medium' | 'low' =
        timeSeries.length >= 30 ? 'high' : timeSeries.length >= 7 ? 'medium' : 'low';

      return {
        price: Math.round(currentPrice * 100) / 100,
        currency: 'USD',
        confidence,
        raw: { certNumber: cert.certNumber, cardName: cert.asset.name, timeSeries },
        retrievedAt: new Date(),
      };
    } catch (e) {
      console.error(`[AltAdapter] Error for cert ${certNumber}: ${e}`);
      return null;
    }
  }
}
