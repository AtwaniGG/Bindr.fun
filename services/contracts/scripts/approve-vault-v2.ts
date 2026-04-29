import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../../.env' });

const COURTYARD_ERC721 =
  process.env.COURTYARD_CONTRACT_ADDRESS ||
  '0x251be3a17af4892035c37ebf5890f4a4d889dcad';
const V2_ADDRESS =
  process.env.GACHA_V2_CONTRACT_ADDRESS ||
  process.argv.find((a) => a.startsWith('--v2='))?.split('=')[1];

async function main() {
  if (!V2_ADDRESS) throw new Error('GACHA_V2_CONTRACT_ADDRESS missing — pass --v2=0x...');
  const [vault] = await ethers.getSigners();
  console.log(`Vault (signer):   ${vault.address}`);
  console.log(`NFT contract:     ${COURTYARD_ERC721}`);
  console.log(`Approving V2:     ${V2_ADDRESS}`);

  const nft = await ethers.getContractAt(
    [
      'function setApprovalForAll(address operator, bool approved) external',
      'function isApprovedForAll(address owner, address operator) external view returns (bool)',
    ],
    COURTYARD_ERC721,
    vault,
  );

  const already = await nft.isApprovedForAll(vault.address, V2_ADDRESS);
  if (already) {
    console.log('Already approved. Nothing to do.');
    return;
  }

  const tx = await nft.setApprovalForAll(V2_ADDRESS, true);
  console.log(`setApprovalForAll tx: ${tx.hash}`);
  await tx.wait();
  console.log('Confirmed. V2 can now pull NFTs from the vault.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
