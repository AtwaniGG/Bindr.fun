/**
 * Universal slab metadata parser.
 *
 * Given an NFT's `metadata` JSON (the result of fetching `tokenURI`), name,
 * and description, extract the canonical fields that identify a graded
 * Pokemon slab: cert number, grader, grade, set, card name/number, etc.
 *
 * Designed to be platform-agnostic. Works against:
 *  - Courtyard's `proof_of_integrity.fingerprint` shape
 *  - Standard ERC-721 `attributes` array with various trait_type names
 *  - Top-level metadata keys (`cert_number`, `grader`, etc.)
 *  - Free-text in `name` / `description` as last resort
 *
 * If a future platform structures metadata differently, add variants below
 * (look in `ATTR_KEYS_*` arrays) — no changes to the indexer or pricing
 * pipeline are needed.
 */

interface NftAttribute {
  trait_type?: string;
  value?: string | number;
  // Some platforms use `name` instead of `trait_type`
  name?: string;
}

const ATTR_KEYS_CERT = [
  'Serial',
  'Cert Number',
  'CertNumber',
  'cert_number',
  'Certificate Number',
  'Cert #',
  'Cert',
  'Certification Number',
  'Certification #',
  'PSA Cert',
  'CGC Cert',
  'BGS Cert',
  'SGC Cert',
];

const ATTR_KEYS_GRADER = [
  'Grader',
  'Grading Company',
  'grading_company',
  'Grading',
  'Grade Company',
  'Authenticator',
];

const ATTR_KEYS_GRADE = ['Grade', 'Grade Value', 'Grade Number', 'Numeric Grade'];

const ATTR_KEYS_SET = ['Set', 'Set Name', 'set_name', 'Series', 'Set Title'];

const ATTR_KEYS_CARD_NAME = [
  'Title/Subject',
  'Card Name',
  'card_name',
  'Subject',
  'Card',
  'Title',
  'Player',
  'Character',
  'Pokemon',
];

const ATTR_KEYS_CARD_NUMBER = ['Card Number', 'card_number', '#', 'Number'];

const ATTR_KEYS_VARIANT = ['Variant', 'Edition', 'Print', 'Holofoil', 'Foil'];

const ATTR_KEYS_LANGUAGE = ['Language', 'language'];

const ATTR_KEYS_YEAR = ['Year', 'Release Year'];

const KNOWN_GRADERS_RE = /\b(PSA|BGS|CGC|SGC|HGA|GMA|TAG)\b/i;

export interface ParsedSlab {
  certNumber: string | null;
  grader: string | null;
  grade: string | null;
  setName: string | null;
  cardName: string | null;
  cardNumber: string | null;
  variant: string | null;
  language: string | null;
  year: string | null;
  imageUrl: string | null;
  fingerprint: string | null;
  /** 'ok' = all 3 of (cert, grader, grade) found; 'partial' = cert only; 'fail' = no cert */
  parseStatus: 'ok' | 'partial' | 'fail';
}

function readAttr(attributes: NftAttribute[], keys: readonly string[]): string | null {
  for (const key of keys) {
    const lc = key.toLowerCase();
    const attr = attributes.find((a) => {
      const traitName = (a.trait_type || a.name || '').toString().toLowerCase();
      return traitName === lc;
    });
    if (attr && attr.value !== undefined && attr.value !== null && attr.value !== '') {
      return String(attr.value);
    }
  }
  return null;
}

function readTopLevel(meta: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = meta[key] ?? meta[key.toLowerCase()] ?? meta[key.replace(/\s+/g, '_').toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return null;
}

/**
 * Returns true if the NFT looks like a Pokemon collectable. Used to skip
 * non-Pokemon NFTs (sports cards, art, randoms) when scanning a wallet.
 */
export function isPokemonNft(
  metadata: Record<string, unknown>,
  name?: string,
  description?: string,
): boolean {
  const attributes = (metadata.attributes as NftAttribute[]) || [];

  // Check Category attribute
  const category = readAttr(attributes, ['Category', 'category']);
  if (category) {
    return /pok[eé]mon/i.test(category);
  }

  // Courtyard fingerprint: "Pokemon | PSA 12345 | ..."
  const fingerprint = extractFingerprint(metadata);
  if (fingerprint) {
    const firstPart = fingerprint.split('|')[0]?.trim() || '';
    return /^pok[eé]mon/i.test(firstPart);
  }

  // Fallback: name / description / set
  const setName = readAttr(attributes, ATTR_KEYS_SET);
  const text = [name, description, setName].filter(Boolean).join(' ');
  return /pok[eé]mon/i.test(text);
}

function extractFingerprint(meta: Record<string, unknown>): string | null {
  const tokenInfo = meta.token_info as Record<string, unknown> | undefined;
  const proof = tokenInfo?.proof_of_integrity as Record<string, string> | undefined;
  return proof?.fingerprint ?? null;
}

/**
 * Parse a slab's metadata into canonical fields. Caller decides what to do
 * with the result (`parseStatus !== 'fail'` means the slab can probably be
 * priced via cert lookup).
 */
export function parseSlab(
  metadata: Record<string, unknown>,
  name?: string,
  description?: string,
): ParsedSlab {
  const attributes = (metadata.attributes as NftAttribute[]) || [];
  const fingerprint = extractFingerprint(metadata);

  // Pull from attributes first (most reliable)
  let certNumber = readAttr(attributes, ATTR_KEYS_CERT) ?? readTopLevel(metadata, ATTR_KEYS_CERT);
  let grader = readAttr(attributes, ATTR_KEYS_GRADER) ?? readTopLevel(metadata, ATTR_KEYS_GRADER);
  const rawGrade = readAttr(attributes, ATTR_KEYS_GRADE) ?? readTopLevel(metadata, ATTR_KEYS_GRADE);
  let grade = rawGrade ? rawGrade.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? rawGrade : null;
  let setName = readAttr(attributes, ATTR_KEYS_SET) ?? readTopLevel(metadata, ATTR_KEYS_SET);
  let cardName = readAttr(attributes, ATTR_KEYS_CARD_NAME) ?? readTopLevel(metadata, ATTR_KEYS_CARD_NAME);
  let cardNumber = readAttr(attributes, ATTR_KEYS_CARD_NUMBER) ?? readTopLevel(metadata, ATTR_KEYS_CARD_NUMBER);
  const variant = readAttr(attributes, ATTR_KEYS_VARIANT) ?? readTopLevel(metadata, ATTR_KEYS_VARIANT);
  const language = readAttr(attributes, ATTR_KEYS_LANGUAGE) ?? readTopLevel(metadata, ATTR_KEYS_LANGUAGE);
  const year = readAttr(attributes, ATTR_KEYS_YEAR) ?? readTopLevel(metadata, ATTR_KEYS_YEAR);

  // Fingerprint fallback (Courtyard-specific shape, but pattern is universal):
  // "Pokemon | PSA 80543183 | 2023 Pokemon 151 #173 Pikachu | 10 GEM MINT"
  if (fingerprint && (!certNumber || !grader || !grade)) {
    const parts = fingerprint.split('|').map((s) => s.trim());

    if (parts.length >= 3) {
      const graderCert = parts[1];
      const gcMatch = graderCert.match(new RegExp(`(${KNOWN_GRADERS_RE.source})\\s+(\\d+)`, 'i'));
      if (gcMatch) {
        grader = grader || gcMatch[1].toUpperCase();
        certNumber = certNumber || gcMatch[2];
      }

      const cardInfo = parts[2];
      const cardMatch = cardInfo.match(/^(\d{4})\s+(.+?)(?:\s+#(\d+)\s+(.+)|$)/);
      if (cardMatch) {
        setName = setName || cardMatch[2].trim();
        cardNumber = cardNumber || cardMatch[3] || null;
        cardName = cardName || cardMatch[4]?.trim() || null;
      }

      if (parts.length >= 4) {
        const gradeMatch = parts[3].match(/^(\d+(?:\.\d+)?)/);
        grade = grade || gradeMatch?.[1] || null;
      }
    }
  }

  // Free-text fallback for cert + grader + grade
  const text = [name, description, fingerprint].filter(Boolean).join(' ');
  if (!certNumber) {
    const m = text.match(new RegExp(`(${KNOWN_GRADERS_RE.source})\\s+(\\d{6,})`, 'i'));
    if (m) {
      certNumber = m[2];
      grader = grader || m[1].toUpperCase();
    }
  }
  if (!grader) {
    const m = text.match(KNOWN_GRADERS_RE);
    if (m) grader = m[1].toUpperCase();
  }
  if (!grade) {
    const m = text.match(/\|\s*(\d+(?:\.\d+)?)\s+(?:GEM\s+)?MINT/i);
    grade = m?.[1] ?? null;
  }

  // Card name/set fallback from description text
  if (!cardName && description) {
    const m = description.match(
      new RegExp(`(?:${KNOWN_GRADERS_RE.source})\\s+\\d+(?:\\.\\d+)?\\s+(.+?)\\s*[-–]\\s*(.+?)(?:\\s*#(\\d+))?$`, 'i'),
    );
    if (m) {
      cardName = cardName || m[1].trim();
      setName = setName || m[2].trim().replace(/\s*#\d+$/, '');
      cardNumber = cardNumber || m[3] || null;
    }
  }
  if (!cardName && description) {
    const m = description.match(/^\d{4}\s+(.+?)\s+#(\d+)\s+(.+)/);
    if (m) {
      setName = setName || m[1].trim();
      cardNumber = cardNumber || m[2];
      cardName = cardName || m[3].trim();
    }
  }

  // Use NFT name as cardName fallback unless it's a generic placeholder
  if (!cardName && name) {
    const isGeneric = /courtyard\.io|^asset\b|^token\b|^nft\b|^slab\b/i.test(name);
    if (!isGeneric) cardName = name;
  }

  // Normalize grader casing
  if (grader) grader = grader.toUpperCase();

  const imageUrl =
    (metadata.image as string) ||
    (metadata.image_url as string) ||
    (metadata.imageUrl as string) ||
    null;

  let parseStatus: ParsedSlab['parseStatus'] = 'fail';
  if (certNumber && grader && grade) parseStatus = 'ok';
  else if (certNumber) parseStatus = 'partial';

  return {
    certNumber,
    grader,
    grade,
    setName,
    cardName,
    cardNumber,
    variant,
    language,
    year,
    imageUrl,
    fingerprint,
    parseStatus,
  };
}
