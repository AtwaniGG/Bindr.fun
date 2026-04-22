import { ethers, network, run } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../../.env' });

const COURTYARD_ERC721 =
  process.env.COURTYARD_CONTRACT_ADDRESS ||
  '0x251be3a17af4892035c37ebf5890f4a4d889dcad';
const VAULT_ADDRESS =
  process.env.GACHA_VAULT_ADDRESS || '0xd7625c58A23926fd5b54a3DF5fB17E966C684895';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network:  ${network.name}`);
  console.log(`NFT:      ${COURTYARD_ERC721}`);
  console.log(`Vault:    ${VAULT_ADDRESS}`);

  const backendSigner = deployer.address; // vault wallet doubles as backend signer
  const Factory = await ethers.getContractFactory('BindrGacha');
  const gacha = await Factory.deploy(COURTYARD_ERC721, VAULT_ADDRESS, backendSigner);
  await gacha.waitForDeployment();

  const addr = await gacha.getAddress();
  console.log(`\nBindrGacha deployed to: ${addr}`);

  if (network.name === 'polygon') {
    console.log('\nWaiting 30s before Polygonscan verification...');
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      await run('verify:verify', {
        address: addr,
        constructorArguments: [COURTYARD_ERC721, VAULT_ADDRESS, backendSigner],
      });
    } catch (err: any) {
      console.warn(`Verification failed (can retry manually): ${err.message}`);
    }
  }

  console.log(`\nNext: add GACHA_CONTRACT_ADDRESS="${addr}" to your .env`);
  console.log('Then run: pnpm --filter @pokedex-slabs/contracts approve-vault');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
