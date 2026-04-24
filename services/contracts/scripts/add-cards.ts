import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../../.env' });

const GACHA = process.env.GACHA_CONTRACT_ADDRESS!;

const TOKEN_IDS: string[] = [
  '0x7e4865c51013188d47cced6b30ba8ef3542879bc079a1c2807a1ca1880fd2073', // Lost Thunder #182/214 Lusamine ◇
];
const PACK_TIER = 0; // Pack25
const BUCKET = 0;    // commons

async function main() {
  if (!GACHA) throw new Error('GACHA_CONTRACT_ADDRESS missing');
  const [owner] = await ethers.getSigners();
  console.log(`Owner signer: ${owner.address}`);
  console.log(`Gacha:        ${GACHA}`);
  console.log(`Adding ${TOKEN_IDS.length} cards to Pack${PACK_TIER === 0 ? '25' : '100'} bucket ${BUCKET}`);

  const gacha = await ethers.getContractAt(
    [
      'function addCards(uint8 packTier, uint256[] tokenIds, uint8[] buckets) external',
      'function availableInBucket(uint8 packTier, uint8 bucket) view returns (uint256)',
    ],
    GACHA,
    owner,
  );

  const before = await gacha.availableInBucket(PACK_TIER, BUCKET);
  console.log(`availableInBucket before: ${before}`);

  const tokenIds = TOKEN_IDS.map((id) => BigInt(id));
  const buckets = TOKEN_IDS.map(() => BUCKET);

  const tx = await gacha.addCards(PACK_TIER, tokenIds, buckets);
  console.log(`addCards tx: ${tx.hash}`);
  await tx.wait();

  const after = await gacha.availableInBucket(PACK_TIER, BUCKET);
  console.log(`availableInBucket after:  ${after}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
