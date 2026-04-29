import { ethers, network, run } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../../.env' });

// Polygon mainnet VRF v2.5
const VRF_COORDINATOR_POLYGON = '0xec0Ed46f36576541C75739E915ADbCb3DE24bD77';
const KEYHASH_500_GWEI = '0x0ffbbd0c1c18c0263dd778dadd1d64240d7bc338d95fec1cf0473928ca7eaf9e';

const COURTYARD_ERC721 =
  process.env.COURTYARD_CONTRACT_ADDRESS ||
  '0x251be3a17af4892035c37ebf5890f4a4d889dcad';
const VAULT_ADDRESS =
  process.env.GACHA_VAULT_ADDRESS || '0xd7625c58A23926fd5b54a3DF5fB17E966C684895';

// Locked-in via session config — see GACHA_VRF_* env vars to override
const VRF_SUBSCRIPTION_ID =
  process.env.GACHA_VRF_SUBSCRIPTION_ID ||
  '57413246840613378639982859663293148093385919289693152475135837850703957809644';
const VRF_KEY_HASH = process.env.GACHA_VRF_KEY_HASH || KEYHASH_500_GWEI;
const VRF_COORDINATOR = process.env.GACHA_VRF_COORDINATOR || VRF_COORDINATOR_POLYGON;
const VRF_NATIVE_PAYMENT = (process.env.GACHA_VRF_NATIVE_PAYMENT ?? 'true') === 'true';
const CALLBACK_GAS_LIMIT = Number(process.env.GACHA_VRF_CALLBACK_GAS_LIMIT || 500_000);
const REQUEST_CONFIRMATIONS = Number(process.env.GACHA_VRF_REQUEST_CONFIRMATIONS || 3);
const MIN_PULL_INTERVAL_BLOCKS = Number(process.env.GACHA_MIN_PULL_INTERVAL_BLOCKS || 30);
const MAX_PULLS_PER_BLOCK = Number(process.env.GACHA_MAX_PULLS_PER_BLOCK || 5);

async function main() {
  const [deployer] = await ethers.getSigners();

  // pauseGuardian intentionally reuses the deployer address. Use
  // setPauseGuardian post-deploy to rotate to a dedicated wallet.
  const backendSigner = deployer.address;
  const pauseGuardian = deployer.address;

  console.log('--- BindrGachaV2 deploy ---');
  console.log(`Network:               ${network.name}`);
  console.log(`Deployer / owner:      ${deployer.address}`);
  console.log(`Vault:                 ${VAULT_ADDRESS}`);
  console.log(`Backend signer:        ${backendSigner}`);
  console.log(`Pause guardian:        ${pauseGuardian}`);
  console.log(`NFT (Courtyard):       ${COURTYARD_ERC721}`);
  console.log(`VRF coordinator:       ${VRF_COORDINATOR}`);
  console.log(`VRF subId:             ${VRF_SUBSCRIPTION_ID}`);
  console.log(`VRF keyHash:           ${VRF_KEY_HASH}`);
  console.log(`VRF native payment:    ${VRF_NATIVE_PAYMENT}`);
  console.log(`Callback gas limit:    ${CALLBACK_GAS_LIMIT}`);
  console.log(`Request confirmations: ${REQUEST_CONFIRMATIONS}`);
  console.log(`Min pull interval:     ${MIN_PULL_INTERVAL_BLOCKS} blocks`);
  console.log(`Max pulls per block:   ${MAX_PULLS_PER_BLOCK}`);
  console.log('---');

  const cfg = {
    nft: COURTYARD_ERC721,
    initialVault: VAULT_ADDRESS,
    initialBackend: backendSigner,
    initialPauseGuardian: pauseGuardian,
    vrfCoordinator: VRF_COORDINATOR,
    vrfKeyHash: VRF_KEY_HASH,
    vrfSubscriptionId: VRF_SUBSCRIPTION_ID,
    vrfNativePayment: VRF_NATIVE_PAYMENT,
    callbackGasLimit: CALLBACK_GAS_LIMIT,
    requestConfirmations: REQUEST_CONFIRMATIONS,
    minPullIntervalBlocks: MIN_PULL_INTERVAL_BLOCKS,
    maxPullsPerBlock: MAX_PULLS_PER_BLOCK,
  };

  const Factory = await ethers.getContractFactory('BindrGachaV2');
  const gacha = await Factory.deploy(cfg);
  await gacha.waitForDeployment();

  const addr = await gacha.getAddress();
  console.log(`\nBindrGachaV2 deployed at: ${addr}`);

  if (network.name === 'polygon') {
    console.log('\nWaiting 30s before Polygonscan verification...');
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      await run('verify:verify', {
        address: addr,
        constructorArguments: [cfg],
      });
      console.log('Verified on Polygonscan');
    } catch (err: any) {
      console.warn(`Verification failed (retry manually): ${err.message}`);
    }
  }

  console.log('\n=== NEXT STEPS ===');
  console.log(
    `1. Open https://vrf.chain.link → your subscription → "Add Consumer"`,
  );
  console.log(`   Paste this contract address: ${addr}`);
  console.log(`2. Vault wallet (${VAULT_ADDRESS}) must call:`);
  console.log(`   NFT.setApprovalForAll(${addr}, true)`);
  console.log(`   on the Courtyard contract (${COURTYARD_ERC721}).`);
  console.log(
    `3. Migrate inventory: pnpm --filter @pokedex-slabs/contracts hardhat run scripts/migrate-v1-to-v2.ts --network polygon`,
  );
  console.log(`4. Update Railway env: GACHA_CONTRACT_ADDRESS="${addr}"`);
  console.log(`5. Pause V1 so traffic doesn't double-spend.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
