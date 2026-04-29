/**
 * Migrate registered card inventory from BindrGacha V1 → BindrGachaV2.
 *
 * Strategy: walk every NFT currently held by the vault on Polygon, query
 * V1's `cards(packTier, tokenId)` mapping to find out where (if anywhere)
 * that token was registered, and replay those entries into V2's
 * `addCards(packTier, tokenIds[], buckets[])` in two batches (one per
 * pack tier).
 *
 * Pre-requisites:
 *  - V2 deployed and its address available via GACHA_V2_CONTRACT_ADDRESS env
 *    (or pass --v2=0x... as a CLI arg).
 *  - Vault wallet has called setApprovalForAll(V2, true) on the Courtyard
 *    ERC-721 contract.
 *  - V2 added as a consumer on the VRF subscription.
 *  - Deployer key (`GACHA_VAULT_PRIVATE_KEY`) is the owner of V2 — addCards
 *    is `onlyOwner`.
 */

import { ethers, network } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../../.env' });

const V1_ADDRESS = process.env.GACHA_CONTRACT_ADDRESS;
const V2_ADDRESS =
  process.env.GACHA_V2_CONTRACT_ADDRESS ||
  process.argv.find((a) => a.startsWith('--v2='))?.split('=')[1];

const COURTYARD_ERC721 =
  process.env.COURTYARD_CONTRACT_ADDRESS ||
  '0x251be3a17af4892035c37ebf5890f4a4d889dcad';
const VAULT_ADDRESS =
  process.env.GACHA_VAULT_ADDRESS || '0xd7625c58A23926fd5b54a3DF5fB17E966C684895';

const PACK_TIERS = [0, 1] as const;
const BATCH_SIZE = 100; // addCards per-call cap to stay well under block gas limit

interface VaultNft {
  tokenId: string; // decimal string
}

async function fetchVaultNfts(): Promise<VaultNft[]> {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY missing — needed to enumerate vault holdings');

  const all: VaultNft[] = [];
  let pageKey: string | undefined;
  do {
    const url = new URL(`https://polygon-mainnet.g.alchemy.com/nft/v3/${key}/getNFTsForOwner`);
    url.searchParams.set('owner', VAULT_ADDRESS);
    url.searchParams.set('contractAddresses[]', COURTYARD_ERC721);
    url.searchParams.set('withMetadata', 'false');
    url.searchParams.set('pageSize', '100');
    if (pageKey) url.searchParams.set('pageKey', pageKey);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Alchemy ${res.status}: ${res.statusText}`);
    const data: any = await res.json();
    for (const n of data.ownedNfts || []) {
      try {
        all.push({ tokenId: BigInt(n.tokenId).toString() });
      } catch {
        /* ignore non-numeric tokenIds */
      }
    }
    pageKey = data.pageKey;
  } while (pageKey);
  return all;
}

async function main() {
  if (!V1_ADDRESS) throw new Error('GACHA_CONTRACT_ADDRESS (V1) missing');
  if (!V2_ADDRESS) throw new Error('GACHA_V2_CONTRACT_ADDRESS missing — pass --v2=0x... or set env');
  if (network.name !== 'polygon') {
    console.warn(`Running on ${network.name} (not polygon) — proceed with caution`);
  }

  const [signer] = await ethers.getSigners();
  console.log('--- migrate V1 → V2 ---');
  console.log(`V1:          ${V1_ADDRESS}`);
  console.log(`V2:          ${V2_ADDRESS}`);
  console.log(`Vault:       ${VAULT_ADDRESS}`);
  console.log(`Signer:      ${signer.address}`);
  console.log('---');

  const v1 = await ethers.getContractAt(
    [
      'function cards(uint8 packTier, uint256 tokenId) view returns (uint8 bucket, bool available)',
      'function paused() view returns (bool)',
    ],
    V1_ADDRESS,
    signer,
  );
  const v2 = await ethers.getContractAt(
    [
      'function addCards(uint8 packTier, uint256[] tokenIds, uint8[] buckets) external',
      'function isVaultReady() view returns (bool)',
      'function owner() view returns (address)',
    ],
    V2_ADDRESS,
    signer,
  );

  // Sanity checks before we touch anything
  const v2Owner = await (v2 as any).owner();
  if (v2Owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`V2 owner is ${v2Owner}, signer is ${signer.address}. Need owner key.`);
  }
  const vaultReady = await (v2 as any).isVaultReady();
  if (!vaultReady) {
    throw new Error(
      `V2 vault is not approved on the Courtyard ERC-721. Vault must call setApprovalForAll(V2, true) first.`,
    );
  }

  console.log('Fetching vault holdings via Alchemy...');
  const vaultNfts = await fetchVaultNfts();
  console.log(`Vault holds ${vaultNfts.length} Courtyard NFTs.`);
  if (vaultNfts.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  // For each tokenId × packTier, ask V1 if it's registered + which bucket
  const toAddByTier: Record<number, { tokenIds: string[]; buckets: number[] }> = {
    0: { tokenIds: [], buckets: [] },
    1: { tokenIds: [], buckets: [] },
  };

  let scanned = 0;
  for (const nft of vaultNfts) {
    for (const tier of PACK_TIERS) {
      const result = await (v1 as any).cards(tier, BigInt(nft.tokenId));
      const bucket = Number(result[0]);
      const available = Boolean(result[1]);
      if (available) {
        toAddByTier[tier].tokenIds.push(nft.tokenId);
        toAddByTier[tier].buckets.push(bucket);
      }
    }
    scanned++;
    if (scanned % 25 === 0) console.log(`  scanned ${scanned}/${vaultNfts.length}`);
  }

  console.log(`Pack25 entries to add:  ${toAddByTier[0].tokenIds.length}`);
  console.log(`Pack100 entries to add: ${toAddByTier[1].tokenIds.length}`);

  if (toAddByTier[0].tokenIds.length === 0 && toAddByTier[1].tokenIds.length === 0) {
    console.log('No registered entries to migrate (V1 has nothing or all cards already gone).');
    return;
  }

  for (const tier of PACK_TIERS) {
    const { tokenIds, buckets } = toAddByTier[tier];
    if (tokenIds.length === 0) continue;
    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
      const idsBatch = tokenIds.slice(i, i + BATCH_SIZE).map((s) => BigInt(s));
      const bktBatch = buckets.slice(i, i + BATCH_SIZE);
      console.log(
        `Pack${tier === 0 ? '25' : '100'} addCards batch ${i / BATCH_SIZE + 1}: ${idsBatch.length} tokens`,
      );
      const tx = await (v2 as any).addCards(tier, idsBatch, bktBatch);
      console.log(`  tx: ${tx.hash}`);
      await tx.wait();
    }
  }

  console.log('\nMigration complete.');
  console.log('=== NEXT STEPS ===');
  console.log('1. Update Railway env: GACHA_CONTRACT_ADDRESS to V2 address.');
  console.log('2. Pause V1: call setPaused(true) on V1 to prevent double-fulfillment.');
  console.log('3. Smoke test V2 with one $0.10 burn before scaling.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
