import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../../.env' });

const GACHA = process.env.GACHA_CONTRACT_ADDRESS!;

const TOKEN_IDS: string[] = [
  '0xdfb9490618c431e46352f036f67121c272fded1c0e71720040592c586847f920', // Team Rocket Part 1 CGC 8
  '0x3b07c7a73b31119dba2efdee90eae94f0cd51755b405ff9ac490b4bc70f4c588', // Venusaur EX CGC 9.5
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
