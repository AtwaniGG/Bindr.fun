import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
  decodeEventLog,
  parseAbi,
  type Hex,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';

const GACHA_ABI = parseAbi([
  'function pull(address user, uint8 packTier, bytes32 burnProof) external',
  'event Pulled(address indexed user, uint8 indexed packTier, uint256 indexed tokenId, uint8 bucket, bytes32 burnProof)',
]);

export interface ContractPullResult {
  txHash: Hex;
  tokenId: string; // decimal string (uint256 too big for Number)
  bucket: number;
}

@Injectable()
export class GachaContractService {
  private readonly logger = new Logger(GachaContractService.name);
  private readonly contractAddress: Address;
  private readonly account;
  private readonly publicClient;
  private readonly walletClient;

  constructor() {
    const addr = process.env.GACHA_CONTRACT_ADDRESS;
    const rpc = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
    const key = process.env.GACHA_VAULT_PRIVATE_KEY; // also serves as backendSigner today
    if (!addr) throw new Error('GACHA_CONTRACT_ADDRESS missing');
    if (!key) throw new Error('GACHA_VAULT_PRIVATE_KEY missing');

    this.contractAddress = addr as Address;
    this.account = privateKeyToAccount(key as Hex);
    this.publicClient = createPublicClient({ chain: polygon, transport: http(rpc) });
    this.walletClient = createWalletClient({ chain: polygon, transport: http(rpc), account: this.account });
  }

  async pull(
    userPolygonAddress: string,
    packTier: number,
    txSignature: string,
  ): Promise<ContractPullResult> {
    // burnProof = keccak256 of the Solana burn tx signature (audit tag, no on-chain semantics)
    const burnProof = keccak256(toBytes(txSignature));

    this.logger.log(`contract.pull user=${userPolygonAddress} tier=${packTier}`);

    const hash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: GACHA_ABI,
      functionName: 'pull',
      args: [userPolygonAddress as Address, packTier, burnProof],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new InternalServerErrorException(`contract.pull reverted: tx=${hash}`);
    }

    // Parse Pulled event from logs
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== this.contractAddress.toLowerCase()) continue;
      try {
        const decoded: any = decodeEventLog({
          abi: GACHA_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'Pulled') {
          return {
            txHash: hash,
            tokenId: (decoded.args.tokenId as bigint).toString(),
            bucket: Number(decoded.args.bucket),
          };
        }
      } catch {
        // not a Pulled event; continue
      }
    }

    throw new InternalServerErrorException(
      `contract.pull succeeded but no Pulled event found: tx=${hash}`,
    );
  }
}
