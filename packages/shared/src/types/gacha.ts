export type GachaTier = 'common' | 'uncommon' | 'rare' | 'ultra_rare';

export type GachaPullStatus =
  | 'pending'
  | 'verifying'
  | 'selecting'
  | 'transferring'
  | 'completed'
  | 'failed'
  | 'refund_needed';

export type GachaCardStatus = 'available' | 'reserved' | 'distributed';

export interface GachaPriceResponse {
  priceUsd: number;
  tokensRequired: string;
  tokensRequiredRaw: string;
  burnAmountUsd: number;
}

export interface GachaPullRequest {
  txSignature: string;
  polygonAddress: string;
  solanaAddress: string;
}

export interface GachaPullResponse {
  pullId: string;
  status: GachaPullStatus;
  card: GachaCardInfo | null;
  polygonTxHash: string | null;
  createdAt: string;
}

export interface GachaCardInfo {
  id: string;
  tier: GachaTier;
  cardName: string | null;
  setName: string | null;
  grader: string | null;
  grade: string | null;
  imageUrl: string | null;
  certNumber: string | null;
  tokenId: string | null;
}

export interface GachaHistoryItem {
  pullId: string;
  solanaAddress: string;
  txSignature: string;
  burnAmountTokens: string;
  status: GachaPullStatus;
  card: GachaCardInfo | null;
  polygonTxHash: string | null;
  createdAt: string;
}

export interface GachaInventoryStats {
  common: number;
  uncommon: number;
  rare: number;
  ultraRare: number;
  total: number;
}
