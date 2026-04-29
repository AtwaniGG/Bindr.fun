import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildSetNameNormalizer } from '../../utils/normalize-set-name';
import { isPokemonNft, parseSlab } from '../../utils/slab-parser';
import { PricingService } from '../pricing/pricing.service';

interface CardMatch {
  setName: string;
  ptcgCardId: string;
}


const ALCHEMY_POLYGON_BASE = 'https://polygon-mainnet.g.alchemy.com/nft/v3';

// Re-index if data is older than this
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

interface AlchemyNft {
  contract: { address: string };
  tokenId: string;
  tokenUri?: string;
  name?: string;
  description?: string;
  image?: { cachedUrl?: string; originalUrl?: string; pngUrl?: string };
  raw?: {
    metadata?: Record<string, unknown>;
    tokenUri?: string;
  };
}

interface AlchemyResponse {
  ownedNfts: AlchemyNft[];
  pageKey?: string;
  totalCount: number;
}

// parseSlab + isPokemonNft now live in src/utils/slab-parser.ts (platform-agnostic).

// Cooldown for repeated indexing attempts on the same address (prevents Alchemy abuse)
const INDEX_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);
  private readonly recentAttempts = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PricingService)) private pricingService: PricingService,
  ) {}

  private get alchemyKey(): string {
    return process.env.ALCHEMY_API_KEY || '';
  }

  /** Best-effort label for the tokenization platform. Used for display + grouping only. */
  private platformFromContract(contractAddress: string): string {
    const known: Record<string, string> = {
      '0x251be3a17af4892035c37ebf5890f4a4d889dcad': 'courtyard',
    };
    return known[contractAddress.toLowerCase()] ?? 'unknown';
  }

  /**
   * Index a wallet's Courtyard NFTs synchronously.
   * Fetches from Alchemy, upserts assets_raw, parses into slabs.
   * Skips if data was indexed recently (within STALE_THRESHOLD_MS).
   */
  async indexAddress(ownerAddress: string): Promise<{ indexed: number; skipped: boolean }> {
    const normalizedOwner = ownerAddress.toLowerCase();

    // In-memory cooldown: prevent repeated Alchemy calls for the same address
    const lastAttempt = this.recentAttempts.get(normalizedOwner);
    if (lastAttempt && Date.now() - lastAttempt < INDEX_COOLDOWN_MS) {
      return { indexed: 0, skipped: true };
    }

    // Check if we have recent data in DB (any contract — we now scan everything)
    const latestAsset = await this.prisma.assetRaw.findFirst({
      where: { ownerAddress: normalizedOwner },
      orderBy: { lastIndexedAt: 'desc' },
    });

    if (latestAsset && Date.now() - latestAsset.lastIndexedAt.getTime() < STALE_THRESHOLD_MS) {
      this.logger.log(`Skipping index for ${normalizedOwner} - data is fresh`);
      return { indexed: 0, skipped: true };
    }

    if (!this.alchemyKey) {
      this.logger.warn('ALCHEMY_API_KEY not set - cannot index');
      return { indexed: 0, skipped: true };
    }

    // Record this attempt so we don't re-call Alchemy within the cooldown
    this.recentAttempts.set(normalizedOwner, Date.now());

    // Fetch all NFTs from Alchemy
    const nfts = await this.fetchNftsFromAlchemy(normalizedOwner);
    this.logger.log(`Fetched ${nfts.length} NFTs for ${normalizedOwner}`);

    // Build set name normalizer as fallback
    const refs = await this.prisma.setReference.findMany({ select: { setName: true } });
    const normalizeSetName = buildSetNameNormalizer(refs.map((r: any) => r.setName));

    const now = new Date();
    let indexed = 0;

    for (const nft of nfts) {
      const contractAddress = nft.contract.address.toLowerCase();
      const tokenId = nft.tokenId;
      let metadata = nft.raw?.metadata || {};

      // Fallback: if Alchemy returned empty metadata, fetch directly from tokenUri
      const tokenUri = nft.raw?.tokenUri || nft.tokenUri;
      if (Object.keys(metadata).length === 0 && tokenUri) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const metaRes = await fetch(tokenUri, { signal: controller.signal });
          clearTimeout(timeout);
          if (metaRes.ok) {
            metadata = await metaRes.json();
          }
        } catch (e) {
          this.logger.warn(`Failed to fetch tokenUri for ${tokenId}: ${e}`);
        }
      }

      const name = (metadata.name as string) || nft.name;
      const description = (metadata.description as string) || nft.description;

      // Skip ghost NFTs: no metadata, no name, no tokenUri → burned/redeemed token
      const hasMetadata = Object.keys(metadata).length > 0;
      const hasIdentity = name || description || tokenUri;
      if (!hasMetadata && !hasIdentity && !nft.image) {
        this.logger.debug(`Skipping ghost NFT tokenId=${tokenId} (no metadata)`);
        continue;
      }

      // Skip non-Pokemon NFTs (Courtyard sells football, basketball, etc.)
      if (!isPokemonNft(metadata, name, description)) {
        this.logger.debug(`Skipping non-Pokemon NFT tokenId=${tokenId}`);
        continue;
      }

      // Upsert asset_raw
      const assetRaw = await this.prisma.assetRaw.upsert({
        where: {
          contractAddress_tokenId: { contractAddress, tokenId },
        },
        create: {
          chain: 'polygon',
          contractAddress,
          tokenId,
          ownerAddress: normalizedOwner,
          tokenUri: nft.raw?.tokenUri || nft.tokenUri || null,
          rawMetadata: metadata as any,
          lastIndexedAt: now,
        },
        update: {
          ownerAddress: normalizedOwner,
          rawMetadata: metadata as any,
          lastIndexedAt: now,
        },
      });

      // Parse metadata into slab
      const parsed = parseSlab(metadata, name, description);

      // Match card to set via CardReference catalog, fall back to normalizer
      const cardMatch = await this.matchCardToSet(
        parsed.cardName,
        parsed.cardNumber,
        parsed.setName,
      );
      if (cardMatch) {
        parsed.setName = cardMatch.setName;
      } else {
        parsed.setName = normalizeSetName(parsed.setName);
      }

      // Skip creating slab if we got nothing useful - no card name and no cert
      if (!parsed.cardName && !parsed.certNumber) {
        this.logger.warn(`Skipping slab tokenId=${tokenId} - no cardName or certNumber`);
        continue;
      }

      // Get image from Alchemy's cached URLs if not in metadata
      const imageUrl = parsed.imageUrl
        || nft.image?.pngUrl
        || nft.image?.cachedUrl
        || nft.image?.originalUrl
        || null;

      const slab = await this.prisma.slab.upsert({
        where: { assetRawId: assetRaw.id },
        create: {
          assetRawId: assetRaw.id,
          platform: this.platformFromContract(contractAddress),
          certNumber: parsed.certNumber,
          grader: parsed.grader,
          grade: parsed.grade,
          setName: parsed.setName,
          cardName: parsed.cardName,
          cardNumber: parsed.cardNumber,
          variant: parsed.variant,
          language: parsed.language || 'en',
          imageUrl,
          fingerprintText: parsed.fingerprint,
          parseStatus: parsed.parseStatus,
        },
        update: {
          certNumber: parsed.certNumber,
          grader: parsed.grader,
          grade: parsed.grade,
          setName: parsed.setName,
          cardName: parsed.cardName,
          cardNumber: parsed.cardNumber,
          variant: parsed.variant,
          language: parsed.language || 'en',
          imageUrl,
          fingerprintText: parsed.fingerprint,
          parseStatus: parsed.parseStatus,
        },
      });

      // Eager-on-index pricing: any slab with a cert can be priced via
      // Alt.xyz. Fire-and-forget so indexing isn't gated on price feed.
      if (parsed.certNumber) {
        this.pricingService
          .getSlabPrice(slab.id)
          .catch((err: any) =>
            this.logger.warn(`Eager pricing failed for slab ${slab.id}: ${err.message}`),
          );
      }

      indexed++;
    }

    // Remove stale records: any assetRaw for this wallet NOT returned by
    // Alchemy means the NFT was sold/transferred/burned since last index.
    // Match by (contractAddress, tokenId) since tokenId alone isn't unique
    // across collections.
    const currentKeys = new Set(
      nfts.map((n) => `${n.contract.address.toLowerCase()}:${n.tokenId}`),
    );
    const existingAssets = await this.prisma.assetRaw.findMany({
      where: { ownerAddress: normalizedOwner },
      select: { id: true, tokenId: true, contractAddress: true },
    });

    const staleIds = existingAssets
      .filter((a: any) => !currentKeys.has(`${a.contractAddress}:${a.tokenId}`))
      .map((a: any) => a.id);

    if (staleIds.length > 0) {
      // Delete the slabs and assetRaw records for NFTs no longer owned
      await this.prisma.slab.deleteMany({
        where: { assetRawId: { in: staleIds } },
      });
      await this.prisma.assetRaw.deleteMany({
        where: { id: { in: staleIds } },
      });
      this.logger.log(
        `Removed ${staleIds.length} stale NFTs no longer owned by ${normalizedOwner}`,
      );
    }

    this.logger.log(`Indexed ${indexed} slabs for ${normalizedOwner}`);
    return { indexed, skipped: false };
  }

  /**
   * Normalize card numbers: "29/124" → "29", "085" → "85"
   */
  private normalizeCardNumber(num: string): string {
    // Strip "/{setTotal}" suffix
    const base = num.split('/')[0];
    // Strip leading zeros (but keep at least one digit)
    return base.replace(/^0+(?=\d)/, '');
  }

  /**
   * Look up a card in the CardReference catalog to find its canonical set.
   * Returns null if no confident match is found.
   */
  private async matchCardToSet(
    cardName: string | null,
    cardNumber: string | null,
    courtyardSetName: string | null,
  ): Promise<CardMatch | null> {
    if (!cardName) return null;

    // Normalize card number for matching
    const normalizedNum = cardNumber ? this.normalizeCardNumber(cardNumber) : null;

    // Strategy 1: cardName + cardNumber → most precise
    if (normalizedNum) {
      const matches = await this.prisma.cardReference.findMany({
        where: {
          cardName: { equals: cardName, mode: 'insensitive' },
          cardNumber: normalizedNum,
        },
        select: { setName: true, ptcgCardId: true },
      });

      if (matches.length === 1) {
        return matches[0];
      }

      // Multiple matches → use Courtyard set name as disambiguation hint
      if (matches.length > 1 && courtyardSetName) {
        const hint = courtyardSetName.toLowerCase();
        const best = matches.find((m: any) =>
          hint.includes(m.setName.toLowerCase()) ||
          m.setName.toLowerCase().includes(hint),
        );
        if (best) return best;
      }

      // Try contains match for cardName (Courtyard may abbreviate)
      if (matches.length === 0) {
        const fuzzyMatches = await this.prisma.cardReference.findMany({
          where: {
            cardName: { contains: cardName, mode: 'insensitive' },
            cardNumber: normalizedNum,
          },
          select: { setName: true, ptcgCardId: true },
        });

        if (fuzzyMatches.length === 1) {
          return fuzzyMatches[0];
        }
        if (fuzzyMatches.length > 1 && courtyardSetName) {
          const hint = courtyardSetName.toLowerCase();
          const best = fuzzyMatches.find((m: any) =>
            hint.includes(m.setName.toLowerCase()) ||
            m.setName.toLowerCase().includes(hint),
          );
          if (best) return best;
        }
      }
    }

    return null;
  }

  private async fetchNftsFromAlchemy(owner: string): Promise<AlchemyNft[]> {
    const allNfts: AlchemyNft[] = [];
    let pageKey: string | undefined;

    do {
      const url = new URL(`${ALCHEMY_POLYGON_BASE}/${this.alchemyKey}/getNFTsForOwner`);
      url.searchParams.set('owner', owner);
      // No contractAddresses filter — we scan every NFT in the wallet so we can
      // value graded slabs from any tokenization platform. Non-Pokemon and
      // unparseable NFTs are filtered out below.
      url.searchParams.set('withMetadata', 'true');
      url.searchParams.set('pageSize', '100');
      if (pageKey) url.searchParams.set('pageKey', pageKey);

      const response = await fetch(url.toString());
      if (!response.ok) {
        this.logger.error(`Alchemy error: ${response.status} ${response.statusText}`);
        break;
      }

      const data: AlchemyResponse = await response.json();
      allNfts.push(...data.ownedNfts);
      pageKey = data.pageKey;
    } while (pageKey);

    return allNfts;
  }
}
