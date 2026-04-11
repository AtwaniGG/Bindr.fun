// Tier limits
export const FREE_ACTIVE_ADDRESSES = 1;
export const PREMIUM_TRACKED_ADDRESSES = 25;

// Pricing TTLs (milliseconds)
export const FREE_PRICE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PREMIUM_PRICE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const PREMIUM_MANUAL_REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

// Indexing intervals (milliseconds)
export const PREMIUM_INDEX_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Payments
export const PREMIUM_PRICE_USD = 15;
export const INVOICE_EXPIRY_MINUTES = 15;
export const SUBSCRIPTION_PERIOD_DAYS = 30;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// TCGdex
export const TCGDEX_BASE_URL = 'https://api.tcgdex.net/v2/en';
export const TCGDEX_PRICE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Platforms
export const SUPPORTED_PLATFORMS = ['courtyard'] as const;

// Chains for payments
export const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'solana'] as const;

// Gacha
export const SLAB_MINT_ADDRESS = '8d198qeKHyXf1aYQVoGNU9RMBnbdhHZFkvYpJMt8pump';
export const SLAB_DECIMALS = 6;
export const GACHA_BURN_USD = 25;
export const GACHA_VAULT_POLYGON_ADDRESS = '0x52B812Ec8E204541156f1F778B0672bD044a2e79';
export const COURTYARD_CONTRACT_ADDRESS = '0x251be3a17af4892035c37ebf5890f4a4d889dcad';
export const GACHA_PRICE_CACHE_TTL_S = 60;
