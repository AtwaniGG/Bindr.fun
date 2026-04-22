import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../../.env' });

const COURTYARD_ERC721 =
  process.env.COURTYARD_CONTRACT_ADDRESS ||
  '0x251be3a17af4892035c37ebf5890f4a4d889dcad';
const GACHA_CONTRACT = process.env.GACHA_CONTRACT_ADDRESS!;
const VAULT = '0xd7625c58A23926fd5b54a3DF5fB17E966C684895';

async function main() {
  const nft = await ethers.getContractAt(
    ['function isApprovedForAll(address,address) view returns (bool)'],
    COURTYARD_ERC721,
  );
  const approved = await nft.isApprovedForAll(VAULT, GACHA_CONTRACT);
  console.log(`setApprovalForAll(vault -> gacha): ${approved}`);

  const gacha = await ethers.getContractAt(
    [
      'function owner() view returns (address)',
      'function vault() view returns (address)',
      'function backendSigner() view returns (address)',
      'function NFT() view returns (address)',
      'function getBucketWeights(uint8) view returns (uint16[6])',
    ],
    GACHA_CONTRACT,
  );

  console.log(`owner:         ${await gacha.owner()}`);
  console.log(`vault:         ${await gacha.vault()}`);
  console.log(`backendSigner: ${await gacha.backendSigner()}`);
  console.log(`NFT:           ${await gacha.NFT()}`);
  console.log(`Pack25  weights (bps): ${(await gacha.getBucketWeights(0)).join(', ')}`);
  console.log(`Pack100 weights (bps): ${(await gacha.getBucketWeights(1)).join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
