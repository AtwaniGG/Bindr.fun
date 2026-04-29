import { Injectable, Logger } from '@nestjs/common';

const ALT_GRAPHQL_URL =
  'https://alt-platform-server.production.internal.onlyalt.com/graphql/Cert';

const SEARCH_CONFIG_QUERY = `
  {
    serviceConfig {
      search {
        assetSearch {
          clientConfig {
            nodes { host port protocol }
            apiKey
          }
          collectionName
          expiresAt
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
  /** Alt.xyz internal asset UUID. Used for `https://alt.xyz/asset/<id>` deep-links. */
  altAssetId: string | null;
}

interface TypesenseConfig {
  host: string;
  apiKey: string;
  collection: string;
  expiresAt: number;
}

function formatGrade(grade: string): string {
  const num = parseFloat(grade);
  if (isNaN(num)) return grade;
  return num % 1 === 0 ? `${num}.0` : `${num}`;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// CGC-to-PSA discount: CGC cards sell for less than PSA at equivalent grades
const CGC_PSA_DISCOUNT: Record<string, { psaGrade: string; factor: number }> = {
  '10.0': { psaGrade: '10.0', factor: 0.80 },
  '9.5':  { psaGrade: '10.0', factor: 0.70 },
  '9.0':  { psaGrade: '9.0',  factor: 0.90 },
  '8.5':  { psaGrade: '8.0',  factor: 1.05 },
  '8.0':  { psaGrade: '8.0',  factor: 0.85 },
  '7.5':  { psaGrade: '7.0',  factor: 0.95 },
  '7.0':  { psaGrade: '7.0',  factor: 0.85 },
  '6.5':  { psaGrade: '6.0',  factor: 0.95 },
  '6.0':  { psaGrade: '6.0',  factor: 0.85 },
  '5.5':  { psaGrade: '5.0',  factor: 0.95 },
  '5.0':  { psaGrade: '5.0',  factor: 0.85 },
};

@Injectable()
export class AltService {
  private readonly logger = new Logger(AltService.name);
  private tsConfig: TypesenseConfig | null = null;

  async getPriceByCert(
    certNumber: string,
    cardName?: string | null,
    setName?: string | null,
    cardNumber?: string | null,
    grader?: string | null,
    grade?: string | null,
  ): Promise<AltPriceResult | null> {
    const gradeFilter = grader && grade
      ? { gradingCompany: grader.toUpperCase(), gradeNumber: formatGrade(grade) }
      : null;

    // Step 1: Direct cert lookup
    const certResult = await this.lookupByCert(certNumber, gradeFilter);
    if (certResult) return certResult;

    // Step 2: Search by card name → asset ID → price
    if (cardName) {
      const nameResult = await this.lookupByName(certNumber, cardName, setName, cardNumber, gradeFilter);
      if (nameResult) return nameResult;
    }

    return null;
  }

  private async lookupByCert(
    certNumber: string,
    gradeFilter: { gradingCompany: string; gradeNumber: string } | null,
  ): Promise<AltPriceResult | null> {
    try {
      const res = await this.queryAssetByFilter(
        `cert(certNumber: "${certNumber}")`,
        gradeFilter,
      );
      if (!res) return null;

      const { pricingData, name, gradingCompany, gradeNumber, assetId } = res;

      // Try exact grade first
      const exact = this.extractFromTransactions(pricingData, certNumber, name, gradingCompany, gradeNumber, assetId);
      if (exact) return exact;

      // Try PSA proxy if non-PSA
      if (gradeFilter && gradeFilter.gradingCompany !== 'PSA') {
        const proxy = await this.tryPsaProxy(
          `cert(certNumber: "${certNumber}")`,
          gradeFilter,
          certNumber,
          name,
        );
        if (proxy) return proxy;
      }

      // Last resort: altValueTimeSeries if under $100
      return this.extractAssetFallback(pricingData, certNumber, name, gradingCompany, gradeNumber, assetId);
    } catch (e) {
      this.logger.error(`Alt.xyz cert lookup error for ${certNumber}: ${e}`);
      return null;
    }
  }

  private async lookupByName(
    certNumber: string,
    cardName: string,
    setName?: string | null,
    cardNumber?: string | null,
    gradeFilter?: { gradingCompany: string; gradeNumber: string } | null,
  ): Promise<AltPriceResult | null> {
    try {
      // Strip set-total suffix from card number (e.g. "199/165" → "199", "048/172" → "48")
      const cleanNum = cardNumber
        ? cardNumber.replace(/\/\d+$/, '').replace(/^0+/, '')
        : null;

      let query = cardName;
      if (setName) query += ` ${setName}`;
      if (cleanNum && /^\d+$/.test(cleanNum)) query += ` #${cleanNum}`;

      let assetId = await this.searchTypesense(query, cardName);

      if (!assetId && setName) {
        const simpler = cleanNum ? `${cardName} #${cleanNum}` : cardName;
        assetId = await this.searchTypesense(simpler, cardName);
      }

      if (!assetId) return null;
      return this.fetchAssetPrice(assetId, certNumber, gradeFilter);
    } catch (e) {
      this.logger.error(`Alt.xyz name lookup error for "${cardName}": ${e}`);
      return null;
    }
  }

  private async fetchAssetPrice(
    assetId: string,
    certNumber: string,
    gradeFilter?: { gradingCompany: string; gradeNumber: string } | null,
  ): Promise<AltPriceResult | null> {
    const selector = `asset(id: "${assetId}")`;
    const res = await this.queryAssetByFilter(selector, gradeFilter);
    if (!res) return null;

    // Try exact grade
    const exact = this.extractFromTransactions(res.pricingData, certNumber, res.name, gradeFilter?.gradingCompany ?? null, gradeFilter?.gradeNumber ?? null, res.assetId);
    if (exact) return exact;

    // Try PSA proxy if non-PSA
    if (gradeFilter && gradeFilter.gradingCompany !== 'PSA') {
      const proxy = await this.tryPsaProxy(selector, gradeFilter, certNumber, res.name);
      if (proxy) return proxy;
    }

    // Last resort
    return this.extractAssetFallback(res.pricingData, certNumber, res.name, gradeFilter?.gradingCompany ?? null, gradeFilter?.gradeNumber ?? null, res.assetId);
  }

  private async queryAssetByFilter(
    selector: string,
    gradeFilter: { gradingCompany: string; gradeNumber: string } | null,
  ): Promise<{ pricingData: any; name: string; gradingCompany: string | null; gradeNumber: string | null; assetId: string | null } | null> {
    const filterStr = gradeFilter
      ? `gradingCompany: "${gradeFilter.gradingCompany}", gradeNumber: "${gradeFilter.gradeNumber}"`
      : '';

    const isCert = selector.startsWith('cert(');

    let query: string;
    if (isCert) {
      query = `{ ${selector} { certNumber gradingCompany gradeNumber asset { id name pricingData(marketTransactionFilter: {${filterStr}}, tsFilter: {}) { altValueTimeSeries { data } marketTransactions { price date } } } } }`;
    } else {
      query = `{ ${selector} { id name pricingData(marketTransactionFilter: {${filterStr}}, tsFilter: {}) { altValueTimeSeries { data } marketTransactions { price date } } } }`;
    }

    const res = await fetch(ALT_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) return null;
    const body = await res.json();
    if (body.errors) return null;

    if (isCert) {
      const cert = body?.data?.cert;
      if (!cert?.asset) return null;
      return {
        pricingData: cert.asset.pricingData,
        name: cert.asset.name,
        gradingCompany: cert.gradingCompany,
        gradeNumber: cert.gradeNumber,
        assetId: cert.asset.id ?? null,
      };
    } else {
      const asset = body?.data?.asset;
      if (!asset) return null;
      return {
        pricingData: asset.pricingData,
        name: asset.name,
        gradingCompany: null,
        gradeNumber: null,
        assetId: asset.id ?? null,
      };
    }
  }

  private async tryPsaProxy(
    selector: string,
    gradeFilter: { gradingCompany: string; gradeNumber: string },
    certNumber: string,
    cardName: string,
  ): Promise<AltPriceResult | null> {
    const mapping = CGC_PSA_DISCOUNT[gradeFilter.gradeNumber];
    if (!mapping) return null;

    const psaFilter = { gradingCompany: 'PSA', gradeNumber: mapping.psaGrade };
    const res = await this.queryAssetByFilter(selector, psaFilter);
    if (!res) return null;

    const txs: { price: number; date: string }[] = res.pricingData?.marketTransactions ?? [];
    if (txs.length < 3) return null;

    const sorted = [...txs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recentPrices = sorted.slice(0, 20).map((t) => Number(t.price));
    const psaMedian = median(recentPrices);
    const price = Math.round(psaMedian * mapping.factor * 100) / 100;

    if (price <= 0) return null;

    this.logger.debug(
      `Alt.xyz PSA-proxy for cert ${certNumber}: PSA ${mapping.psaGrade} median $${psaMedian.toFixed(2)} × ${mapping.factor} = $${price} (${txs.length} PSA sales)`,
    );

    return {
      price,
      confidence: txs.length >= 30 ? 'medium' : 'low',
      source: 'alt.xyz-psa-proxy',
      certNumber,
      cardName,
      gradingCompany: gradeFilter.gradingCompany,
      gradeNumber: gradeFilter.gradeNumber,
      priceHistory: recentPrices.map((p) => Math.round(p * mapping.factor * 100) / 100),
      altAssetId: res.assetId,
    };
  }

  private extractFromTransactions(
    pricingData: any,
    certNumber: string,
    cardName: string | null,
    gradingCompany: string | null,
    gradeNumber: string | null,
    assetId: string | null = null,
  ): AltPriceResult | null {
    const transactions: { price: number; date: string }[] = pricingData?.marketTransactions ?? [];
    if (transactions.length < 3) return null;

    const sorted = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const recentPrices = sorted.slice(0, 20).map((t) => Number(t.price));
    const price = Math.round(median(recentPrices) * 100) / 100;

    if (price <= 0) return null;

    const confidence: 'high' | 'medium' | 'low' =
      transactions.length >= 30 ? 'high' : transactions.length >= 10 ? 'medium' : 'low';

    this.logger.debug(
      `Alt.xyz grade-specific for cert ${certNumber}: $${price} (${transactions.length} sales, ${confidence})`,
    );

    return {
      price,
      confidence,
      source: 'alt.xyz-sold',
      certNumber,
      cardName: cardName ?? null,
      gradingCompany,
      gradeNumber,
      priceHistory: recentPrices,
      altAssetId: assetId,
    };
  }

  private extractAssetFallback(
    pricingData: any,
    certNumber: string,
    cardName: string | null,
    gradingCompany: string | null,
    gradeNumber: string | null,
    assetId: string | null = null,
  ): AltPriceResult | null {
    const timeSeries: number[] = pricingData?.altValueTimeSeries?.data ?? [];
    if (timeSeries.length === 0) return null;

    const currentPrice = timeSeries[timeSeries.length - 1];
    // Only use asset-level value if it's under $100 — prevents absurd prices
    if (!currentPrice || currentPrice <= 0 || currentPrice > 100) {
      this.logger.debug(
        `Alt.xyz: skipping asset-level value for cert ${certNumber} ($${currentPrice?.toFixed(2) ?? 'N/A'} — ${currentPrice > 100 ? 'too high' : 'invalid'})`,
      );
      return null;
    }

    this.logger.debug(
      `Alt.xyz asset-fallback for cert ${certNumber}: $${currentPrice.toFixed(2)} (raw asset value, low confidence)`,
    );

    return {
      price: Math.round(currentPrice * 100) / 100,
      confidence: 'low',
      source: 'alt.xyz-asset',
      certNumber,
      cardName: cardName ?? null,
      gradingCompany,
      gradeNumber,
      priceHistory: timeSeries.slice(-20),
      altAssetId: assetId,
    };
  }

  private async searchTypesense(
    query: string,
    cardName: string,
  ): Promise<string | null> {
    const config = await this.getTypesenseConfig();
    if (!config) return null;

    const params = new URLSearchParams({
      q: query,
      query_by: 'name',
      per_page: '5',
      filter_by: 'category:POKEMON_CARDS',
    });

    const res = await fetch(
      `https://${config.host}/collections/${config.collection}/documents/search?${params}`,
      { headers: { 'X-TYPESENSE-API-KEY': config.apiKey } },
    );

    if (!res.ok) {
      if (res.status === 403) this.tsConfig = null;
      return null;
    }

    const body = await res.json();
    const hits = body?.hits;
    if (!hits || hits.length === 0) return null;

    const nameLower = cardName.toLowerCase()
      .replace(/\s+(ex|gx|vmax|vstar|v)\s*$/i, '')
      .trim();

    const match = hits.find((h: any) => {
      const subject = (h.document.subject || '').toLowerCase();
      if (!subject.includes(nameLower) && !nameLower.includes(subject)) return false;
      // Only enforce card number match for simple numbers (not "199/165" or "SWSH262")
      const numMatch = query.match(/#(\d+)(?:\/|$|\s)/);
      if (numMatch && !query.includes('/')) {
        const num = numMatch[1];
        const docName = (h.document.name || '').toLowerCase();
        if (!docName.includes(`#${num}`) && !docName.includes(` ${num}`)) return false;
      }
      return true;
    });

    if (!match) {
      this.logger.debug(`Typesense: "${query}" → no valid match in ${hits.length} results`);
      return null;
    }

    this.logger.debug(
      `Typesense: "${query}" → "${match.document.name}" (id: ${match.document.id})`,
    );

    return match.document.id;
  }

  private async getTypesenseConfig(): Promise<TypesenseConfig | null> {
    if (this.tsConfig && this.tsConfig.expiresAt > Date.now() / 1000 + 300) {
      return this.tsConfig;
    }

    try {
      const res = await fetch(ALT_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: SEARCH_CONFIG_QUERY }),
      });

      if (!res.ok) return null;
      const body = await res.json();
      const searchConfig = body?.data?.serviceConfig?.search?.assetSearch;
      if (!searchConfig?.clientConfig) return null;

      const node = searchConfig.clientConfig.nodes[0];
      this.tsConfig = {
        host: node.host,
        apiKey: searchConfig.clientConfig.apiKey,
        collection: searchConfig.collectionName,
        expiresAt: searchConfig.expiresAt,
      };

      return this.tsConfig;
    } catch (e) {
      this.logger.error(`Failed to fetch Typesense config: ${e}`);
      return null;
    }
  }
}
