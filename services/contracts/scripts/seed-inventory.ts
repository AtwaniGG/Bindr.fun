import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();
dotenv.config({ path: '../../.env' });

/**
 * Seed the gacha contract with cards from a CSV file at services/contracts/inventory.csv.
 *
 * CSV format (no header):
 *   packTier,tokenId,bucket
 *   0,12345678,0
 *   0,12345679,0
 *   1,45678900,0
 *
 * packTier: 0 = Pack25, 1 = Pack100
 * bucket: 0-5. Start with all 0 if odds not yet defined; admin can re-bucket later via removeCard+addCards.
 */

const GACHA_CONTRACT = process.env.GACHA_CONTRACT_ADDRESS;
const CSV_PATH = path.join(__dirname, '../inventory.csv');
const BATCH_SIZE = 100;

async function main() {
  if (!GACHA_CONTRACT) throw new Error('Set GACHA_CONTRACT_ADDRESS in .env');
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}\nSee header comment in seed-inventory.ts for format.`);
  }

  const [admin] = await ethers.getSigners();
  console.log(`Admin: ${admin.address}`);
  console.log(`Contract: ${GACHA_CONTRACT}`);

  const gacha = await ethers.getContractAt('BindrGacha', GACHA_CONTRACT, admin);

  // Parse CSV
  const lines = fs.readFileSync(CSV_PATH, 'utf-8').trim().split('\n');
  const byTier: Record<number, { tokenIds: bigint[]; buckets: number[] }> = {
    0: { tokenIds: [], buckets: [] },
    1: { tokenIds: [], buckets: [] },
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [packStr, tokenStr, bucketStr] = trimmed.split(',').map((s) => s.trim());
    const tier = parseInt(packStr);
    const tokenId = BigInt(tokenStr);
    const bucket = parseInt(bucketStr);
    if (tier !== 0 && tier !== 1) throw new Error(`Invalid packTier ${tier} in line: ${line}`);
    if (bucket < 0 || bucket > 5) throw new Error(`Invalid bucket ${bucket} in line: ${line}`);
    byTier[tier].tokenIds.push(tokenId);
    byTier[tier].buckets.push(bucket);
  }

  for (const tier of [0, 1] as const) {
    const { tokenIds, buckets } = byTier[tier];
    if (tokenIds.length === 0) {
      console.log(`\nPack${tier === 0 ? 25 : 100}: no cards to add.`);
      continue;
    }
    console.log(`\nPack${tier === 0 ? 25 : 100}: seeding ${tokenIds.length} cards...`);
    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
      const idSlice = tokenIds.slice(i, i + BATCH_SIZE);
      const bucketSlice = buckets.slice(i, i + BATCH_SIZE);
      const tx = await gacha.addCards(tier, idSlice, bucketSlice);
      console.log(`  batch ${i / BATCH_SIZE + 1}: tx ${tx.hash} (${idSlice.length} cards)`);
      await tx.wait();
    }
  }

  const pack25Count = await gacha.availableInPack(0);
  const pack100Count = await gacha.availableInPack(1);
  console.log(`\nDone. Pack25: ${pack25Count} cards. Pack100: ${pack100Count} cards.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
