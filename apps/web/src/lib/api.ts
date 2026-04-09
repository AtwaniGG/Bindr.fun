const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export interface AddressSummary {
  address: string;
  totalSlabs: number;
  totalSets: number;
  estimatedValueUsd: number;
  sets: SetProgressItem[];
}

export interface SetProgressItem {
  setName: string;
  ownedCount: number;
  totalCards: number;
  completionPct: number;
  releaseYear: number | null;
  generation: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
  previewImageUrl: string | null;
  language: string;
}

export interface SlabItem {
  id: string;
  certNumber: string | null;
  grader: string | null;
  grade: string | null;
  setName: string | null;
  cardName: string | null;
  cardNumber: string | null;
  variant: string | null;
  imageUrl: string | null;
  parseStatus: string;
  platform: string;
  dexId: number | null;
  rarity: string | null;
  cardType: string | null;
  marketPrice: number | null;
  priceCurrency: string | null;
  priceRetrievedAt: string | null;
}

export interface SetWithSlabs {
  setName: string | null;
  ownedCount: number;
  totalCards: number;
  completionPct: number;
  slabs: SlabItem[];
}

export interface CardRefItem {
  ptcgCardId: string;
  cardName: string;
  cardNumber: string;
  imageSmall: string | null;
  imageLarge: string | null;
}

export interface SetDetailWithCards {
  setName: string;
  series: string | null;
  totalCards: number;
  releaseYear: number | null;
  logoUrl: string | null;
  symbolUrl: string | null;
  ownedCount: number;
  completionPct: number;
  ownedCards: SlabItem[];
  neededCards: CardRefItem[];
}

export interface PaginatedSlabs {
  data: SlabItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export const api = {
  getAddressSummary: (address: string) =>
    fetchApi<AddressSummary>(`/public/address/${address}/summary`),

  getAddressSlabs: (address: string, params?: { set?: string; q?: string; grade?: string; sort?: string; page?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.set) searchParams.set('set', params.set);
    if (params?.q) searchParams.set('q', params.q);
    if (params?.grade) searchParams.set('grade', params.grade);
    if (params?.sort) searchParams.set('sort', params.sort);
    if (params?.page) searchParams.set('page', String(params.page));
    const qs = searchParams.toString();
    return fetchApi<PaginatedSlabs>(`/public/address/${address}/slabs${qs ? `?${qs}` : ''}`);
  },

  getAddressSlabsBySet: (address: string) =>
    fetchApi<SetWithSlabs[]>(`/public/address/${address}/slabs-by-set`),

  getAddressSets: (address: string) =>
    fetchApi<SetProgressItem[]>(`/public/address/${address}/sets`),

  getAddressSetDetail: (address: string, setName: string) =>
    fetchApi<SetDetailWithCards>(
      `/public/address/${address}/sets/${encodeURIComponent(setName)}`,
    ),
};
