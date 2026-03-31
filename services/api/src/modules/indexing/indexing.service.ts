import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildSetNameNormalizer } from '../../utils/normalize-set-name';

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

interface NftAttribute {
  trait_type: string;
  value: string | number;
}

function getAttr(attributes: NftAttribute[], traitType: string): string | null {
  const attr = attributes.find(
    (a) => a.trait_type && a.trait_type.toLowerCase() === traitType.toLowerCase(),
  );
  return attr ? String(attr.value) : null;
}

/**
 * Check if a Courtyard NFT is a Pokemon card.
 * Courtyard fingerprints start with "Pokemon | ..." for Pokemon cards.
 * Also checks Category attribute and name/description for "Pokemon".
 */
function isPokemonNft(metadata: Record<string, unknown>, name?: string, description?: string): boolean {
  const attributes = (metadata.attributes as NftAttribute[]) || [];

  // Check Category attribute
  const category = getAttr(attributes, 'Category');
  if (category) {
    return category.toLowerCase().includes('pokemon') || category.toLowerCase().includes('pokémon');
  }

  // Check fingerprint
  const proofOfIntegrity = metadata.token_info
    ? (metadata.token_info as Record<string, unknown>).proof_of_integrity as Record<string, string> | undefined
    : undefined;
  const fingerprint = proofOfIntegrity?.fingerprint || null;
  if (fingerprint) {
    const firstPart = fingerprint.split('|')[0]?.trim().toLowerCase() || '';
    return firstPart === 'pokemon' || firstPart === 'pokémon';
  }

  // Fallback: check name/description
  const text = [name, description].filter(Boolean).join(' ').toLowerCase();
  return text.includes('pokemon') || text.includes('pokémon');
}

/**
 * Parse Courtyard NFT metadata into slab fields.
 *
 * Courtyard metadata uses a "proof_of_integrity.fingerprint" field like:
 *   "Pokemon | PSA 80543183 | 2023 Pokemon 151 #173 Pikachu | 10 GEM MINT"
 *
 * Format: Category | Grader CertNumber | Year SetName #CardNumber CardName | Grade GradeLabel
 */
function parseSlab(metadata: Record<string, unknown>, name?: string, description?: string) {
  const attributes = (metadata.attributes as NftAttribute[]) || [];

  // Try structured attributes first (Courtyard uses: Grader, Serial, Grade, Set, Title/Subject, Card Number)
  let certNumber = getAttr(attributes, 'Serial')
    || getAttr(attributes, 'Cert Number')
    || getAttr(attributes, 'cert_number')
    || getAttr(attributes, 'Certificate Number');
  let grader = getAttr(attributes, 'Grader')
    || getAttr(attributes, 'Grading Company')
    || getAttr(attributes, 'grading_company');
  const rawGrade = getAttr(attributes, 'Grade');
  // Extract numeric grade from "10 GEM MINT" → "10"
  let grade = rawGrade ? (rawGrade.match(/^(\d+(?:\.\d+)?)/)?.[1] || rawGrade) : null;
  let setName = getAttr(attributes, 'Set')
    || getAttr(attributes, 'Set Name');
  let cardName = getAttr(attributes, 'Title/Subject')
    || getAttr(attributes, 'Card Name');
  let cardNumber = getAttr(attributes, 'Card Number');
  let variant = getAttr(attributes, 'Variant')
    || getAttr(attributes, 'Edition');
  const language = getAttr(attributes, 'Language');
  const year = getAttr(attributes, 'Year');

  // Try fingerprint from proof_of_integrity
  const proofOfIntegrity = metadata.token_info
    ? (metadata.token_info as Record<string, unknown>).proof_of_integrity as Record<string, string> | undefined
    : undefined;
  const fingerprint = proofOfIntegrity?.fingerprint || null;

  if (fingerprint && !certNumber) {
    // Parse: "Pokemon | PSA 80543183 | 2023 Pokemon 151 #173 Pikachu | 10 GEM MINT"
    const parts = fingerprint.split('|').map((s: string) => s.trim());

    if (parts.length >= 3) {
      // Part 1: "PSA 80543183" - grader + cert
      const graderCert = parts[1];
      const gcMatch = graderCert.match(/(PSA|BGS|CGC)\s+(\d+)/i);
      if (gcMatch) {
        grader = grader || gcMatch[1].toUpperCase();
        certNumber = certNumber || gcMatch[2];
      }

      // Part 2: "2023 Pokemon 151 #173 Pikachu" - year, set, card number, card name
      const cardInfo = parts[2];
      const cardMatch = cardInfo.match(/^(\d{4})\s+(.+?)(?:\s+#(\d+)\s+(.+)|$)/);
      if (cardMatch) {
        setName = setName || cardMatch[2].trim();
        cardNumber = cardNumber || cardMatch[3] || null;
        cardName = cardName || cardMatch[4]?.trim() || null;
      }

      // Part 3: "10 GEM MINT" - grade
      if (parts.length >= 4) {
        const gradeMatch = parts[3].match(/^(\d+(?:\.\d+)?)/);
        grade = grade || gradeMatch?.[1] || null;
      }
    }
  }

  // Regex fallback from name/description
  const text = [name, description, fingerprint].filter(Boolean).join(' ');
  if (!certNumber) {
    const m = text.match(/(PSA|BGS|CGC|SGC)\s+(\d{6,})/i);
    certNumber = m?.[2] ?? null;
    grader = grader || m?.[1]?.toUpperCase() || null;
  }
  if (!grade) {
    const m = text.match(/\|\s*(\d+(?:\.\d+)?)\s+(?:GEM\s+)?MINT/i);
    grade = m?.[1] ?? null;
  }

  // Try to extract card/set info from description text
  // Common patterns: "PSA 10 Charizard VMAX - Brilliant Stars #18"
  //                  "2023 Pokemon 151 #173 Pikachu"
  if (!cardName && description) {
    const descMatch = description.match(
      /(?:PSA|BGS|CGC|SGC)\s+\d+(?:\.\d+)?\s+(.+?)\s*[-–]\s*(.+?)(?:\s*#(\d+))?$/i,
    );
    if (descMatch) {
      cardName = cardName || descMatch[1].trim();
      setName = setName || descMatch[2].trim().replace(/\s*#\d+$/, '');
      cardNumber = cardNumber || descMatch[3] || null;
    }
  }
  if (!cardName && description) {
    const descMatch2 = description.match(/^\d{4}\s+(.+?)\s+#(\d+)\s+(.+)/);
    if (descMatch2) {
      setName = setName || descMatch2[1].trim();
      cardNumber = cardNumber || descMatch2[2];
      cardName = cardName || descMatch2[3].trim();
    }
  }

  // Only use NFT name as cardName fallback if it's not a generic placeholder
  if (!cardName && name) {
    const isGeneric = /courtyard\.io|^asset\b|^token\b|^nft\b/i.test(name);
    if (!isGeneric) cardName = name;
  }

  const imageUrl = (metadata.image as string)
    || (metadata.image_url as string)
    || null;

  let parseStatus: string = 'fail';
  if (certNumber && grader && grade) parseStatus = 'ok';
  else if (certNumber) parseStatus = 'partial';

  return { certNumber, grader, grade, setName, cardName, cardNumber, variant, imageUrl, parseStatus, fingerprint, language, year };
}

// Cooldown for repeated indexing attempts on the same address (prevents Alchemy abuse)
const INDEX_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);
  private readonly recentAttempts = new Map<string, number>();

  constructor(private prisma: PrismaService) {}

  private get alchemyKey(): string {
    return process.env.ALCHEMY_API_KEY || '';
  }

  private get courtyardContract(): string {
    return (process.env.COURTYARD_CONTRACT_ADDRESS || '0x251be3a17af4892035c37ebf5890f4a4d889dcad').toLowerCase();
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

    // Check if we have recent data in DB
    const latestAsset = await this.prisma.assetRaw.findFirst({
      where: { ownerAddress: normalizedOwner, contractAddress: this.courtyardContract },
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

      await this.prisma.slab.upsert({
        where: { assetRawId: assetRaw.id },
        create: {
          assetRawId: assetRaw.id,
          platform: 'courtyard',
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

      indexed++;
    }

    // Remove stale records: any assetRaw for this wallet+contract NOT returned
    // by Alchemy means the NFT was sold/transferred/burned since last index.
    const currentTokenIds = new Set(nfts.map((n) => n.tokenId));
    const existingAssets = await this.prisma.assetRaw.findMany({
      where: {
        ownerAddress: normalizedOwner,
        contractAddress: this.courtyardContract,
      },
      select: { id: true, tokenId: true },
    });

    const staleIds = existingAssets
      .filter((a: any) => !currentTokenIds.has(a.tokenId))
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
      url.searchParams.set('contractAddresses[]', this.courtyardContract);
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
