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
  'function addCards(uint8 packTier, uint256[] tokenIds, uint8[] buckets) external',
  'function availableInBucket(uint8 packTier, uint8 bucket) view returns (uint256)',
  'function cards(uint8 packTier, uint256 tokenId) view returns (uint8 bucket, bool available)',
  'event Pulled(address indexed user, uint8 indexed packTier, uint256 indexed tokenId, uint8 bucket, bytes32 burnProof)',
  'error NotBackend()',
  'error InvalidPackTier()',
  'error InvalidBucket()',
  'error LengthMismatch()',
  'error PoolEmpty()',
  'error AlreadyClaimed()',
  'error WeightsDoNotSumTo10000()',
  'error CardAlreadyRegistered()',
  'error CardNotFound()',
  'error ZeroAddress()',
]);

const NUM_BUCKETS = 6;

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
      // Viem's auto-estimate on Polygon has been within ~3k of actual usage,
      // which is below the buffer needed for the ERC-721 receiver check and
      // causes near-OOG reverts. Hardcode a safe ceiling (~3x worst-case).
      gas: 500_000n,
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

  /** Sum of available cards across all buckets for a pack tier — true inventory. */
  async totalAvailable(packTier: number): Promise<number> {
    let total = 0;
    for (let b = 0; b < NUM_BUCKETS; b++) {
      const n = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: GACHA_ABI,
        functionName: 'availableInBucket',
        args: [packTier, b],
      });
      total += Number(n);
    }
    return total;
  }

  /** Returns true if the tokenId is already registered and available in a bucket. */
  async isCardRegistered(packTier: number, tokenId: string): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: GACHA_ABI,
      functionName: 'cards',
      args: [packTier, BigInt(tokenId)],
    });
    const [, available] = result as unknown as [number, boolean];
    return available;
  }

  async addCards(packTier: number, tokenIds: string[], buckets: number[]): Promise<Hex> {
    if (tokenIds.length !== buckets.length) {
      throw new Error('tokenIds and buckets length mismatch');
    }
    const hash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: GACHA_ABI,
      functionName: 'addCards',
      args: [packTier, tokenIds.map((t) => BigInt(t)), buckets],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new InternalServerErrorException(`contract.addCards reverted: tx=${hash}`);
    }
    this.logger.log(`addCards ${tokenIds.length} tokens → tier ${packTier}, tx ${hash}`);
    return hash;
  }
}
