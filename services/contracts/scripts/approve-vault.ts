import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../../.env' });

const COURTYARD_ERC721 =
  process.env.COURTYARD_CONTRACT_ADDRESS ||
  '0x251be3a17af4892035c37ebf5890f4a4d889dcad';
const GACHA_CONTRACT = process.env.GACHA_CONTRACT_ADDRESS;

async function main() {
  if (!GACHA_CONTRACT) {
    throw new Error('Set GACHA_CONTRACT_ADDRESS in .env after running deploy.ts');
  }
  const [vault] = await ethers.getSigners();
  console.log(`Vault (signer): ${vault.address}`);
  console.log(`Approving gacha contract: ${GACHA_CONTRACT}`);

  const nft = await ethers.getContractAt(
    ['function setApprovalForAll(address operator, bool approved) external', 'function isApprovedForAll(address owner, address operator) external view returns (bool)'],
    COURTYARD_ERC721,
    vault,
  );

  const current = await nft.isApprovedForAll(vault.address, GACHA_CONTRACT);
  if (current) {
    console.log('Already approved. Nothing to do.');
    return;
  }

  const tx = await nft.setApprovalForAll(GACHA_CONTRACT, true);
  console.log(`setApprovalForAll tx: ${tx.hash}`);
  await tx.wait();
  console.log('Confirmed. Gacha contract can now pull NFTs from the vault.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
