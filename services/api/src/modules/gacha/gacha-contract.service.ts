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

const GACHA_V2_ABI = parseAbi([
  'function requestPull(address user, uint8 packTier, bytes32 burnProof) external returns (uint256 requestId)',
  'function addCards(uint8 packTier, uint256[] tokenIds, uint8[] buckets) external',
  'function availableInBucket(uint8 packTier, uint8 bucket) view returns (uint256)',
  'function availableInPack(uint8 packTier) view returns (uint256)',
  'function cards(uint8 packTier, uint256 tokenId) view returns (uint8 bucket, bool available)',
  'function pendingPulls(uint256 requestId) view returns (address user, uint8 packTier, bytes32 burnProof, uint64 timestamp, bool fulfilled, bool cancelled, address vaultAtRequest, uint256 awaitingClaimTokenId, uint8 awaitingClaimBucket, bool awaitingClaim)',
  'function isVaultReady() view returns (bool)',
  'event PullRequested(uint256 indexed requestId, address indexed user, uint8 indexed packTier, bytes32 burnProof)',
  'event Pulled(uint256 indexed requestId, address indexed user, uint8 indexed packTier, uint256 tokenId, uint8 bucket, bytes32 burnProof)',
  'event PullAwaitingClaim(uint256 indexed requestId, address indexed user, uint256 tokenId, uint8 bucket, bytes32 reason)',
  'event PullCancelled(uint256 indexed requestId, address indexed user, bytes32 burnProof, uint8 packTier)',
  'error NotBackend()',
  'error InvalidPackTier()',
  'error InvalidBucket()',
  'error LengthMismatch()',
  'error PoolEmpty()',
  'error AlreadyClaimed()',
  'error WeightsDoNotSumTo10000()',
  'error CardAlreadyRegistered()',
  'error CardNotFound()',
  'error BurnProofAlreadyUsed()',
  'error BurnProofZero()',
  'error PullCooldownActive()',
  'error BlockPullCapReached()',
  'error RequestNotPending()',
  'error NothingToClaim()',
]);

const NUM_BUCKETS = 6;

export interface RequestPullResult {
  /** VRF requestId, decimal string */
  requestId: string;
  /** Polygon tx hash for the requestPull tx */
  txHash: Hex;
}

export interface PullStatus {
  /** 'pending' = VRF hasn't fulfilled yet; 'completed' = NFT transferred; 'awaiting_claim' = transfer failed, user/owner can claim */
  status: 'pending' | 'completed' | 'awaiting_claim' | 'cancelled' | 'unknown';
  tokenId?: string;
  bucket?: number;
  /** Pulled-event tx hash (the fulfill tx, not the request tx) */
  txHash?: Hex;
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
    const key = process.env.GACHA_VAULT_PRIVATE_KEY;
    if (!addr) throw new Error('GACHA_CONTRACT_ADDRESS missing');
    if (!key) throw new Error('GACHA_VAULT_PRIVATE_KEY missing');

    this.contractAddress = addr as Address;
    this.account = privateKeyToAccount(key as Hex);
    this.publicClient = createPublicClient({ chain: polygon, transport: http(rpc) });
    this.walletClient = createWalletClient({ chain: polygon, transport: http(rpc), account: this.account });
  }

  /**
   * Submit a VRF-backed pull request. Returns immediately with a requestId.
   * The actual NFT transfer happens later in the contract's `fulfillRandomWords`
   * callback. Caller should store `requestId` and poll `getPullStatus`.
   */
  async requestPull(
    userPolygonAddress: string,
    packTier: number,
    txSignature: string,
  ): Promise<RequestPullResult> {
    const burnProof = keccak256(toBytes(txSignature));
    this.logger.log(`contract.requestPull user=${userPolygonAddress} tier=${packTier}`);

    const hash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: GACHA_V2_ABI,
      functionName: 'requestPull',
      args: [userPolygonAddress as Address, packTier, burnProof],
      gas: 500_000n,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new InternalServerErrorException(`requestPull tx reverted: ${hash}`);
    }

    // PullRequested event carries the requestId.
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== this.contractAddress.toLowerCase()) continue;
      try {
        const decoded: any = decodeEventLog({
          abi: GACHA_V2_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'PullRequested') {
          return {
            requestId: (decoded.args.requestId as bigint).toString(),
            txHash: hash,
          };
        }
      } catch {
        /* skip non-Pulled* logs */
      }
    }

    throw new InternalServerErrorException(
      `requestPull succeeded but no PullRequested event found: tx=${hash}`,
    );
  }

  /**
   * Check whether a VRF requestId has been fulfilled. If so, returns the
   * tokenId + bucket from the Pulled event. Caller decides what to do
   * with awaiting_claim / cancelled / pending states.
   */
  async getPullStatus(requestIdDecimal: string): Promise<PullStatus> {
    const requestId = BigInt(requestIdDecimal);
    const pending = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: GACHA_V2_ABI,
      functionName: 'pendingPulls',
      args: [requestId],
    })) as readonly [
      Address, number, Hex, bigint, boolean, boolean, Address, bigint, number, boolean,
    ];

    const [
      user,
      ,           // packTier
      ,           // burnProof
      ,           // timestamp
      fulfilled,
      cancelled,
      ,           // vaultAtRequest
      awaitingClaimTokenId,
      awaitingClaimBucket,
      awaitingClaim,
    ] = pending;

    if (user === '0x0000000000000000000000000000000000000000') {
      return { status: 'unknown' };
    }
    if (cancelled) return { status: 'cancelled' };
    if (awaitingClaim) {
      return {
        status: 'awaiting_claim',
        tokenId: awaitingClaimTokenId.toString(),
        bucket: awaitingClaimBucket,
      };
    }
    if (!fulfilled) return { status: 'pending' };

    // Fulfilled successfully — the tokenId/bucket aren't in the struct, so
    // pull them from the Pulled event log.
    const event = await this.fetchPulledEvent(requestId);
    if (!event) {
      // Shouldn't happen — fulfilled flag without an event. Surface as pending
      // so the caller retries; logs will tell us if this is recurring.
      this.logger.warn(`Pulled event not found for fulfilled requestId ${requestIdDecimal}`);
      return { status: 'pending' };
    }
    return {
      status: 'completed',
      tokenId: event.tokenId,
      bucket: event.bucket,
      txHash: event.txHash,
    };
  }

  private async fetchPulledEvent(
    requestId: bigint,
  ): Promise<{ tokenId: string; bucket: number; txHash: Hex } | null> {
    // requestId is the first indexed topic on the Pulled event.
    const requestIdTopic = ('0x' + requestId.toString(16).padStart(64, '0')) as Hex;

    // Free-tier RPCs cap getLogs ranges. Look at the last ~4000 blocks
    // (~2.5 hours on Polygon at 2s/block) — well within free-tier limits if
    // we use Alchemy's NFT / asset-transfer APIs, but here we use eth_getLogs
    // so chunk it conservatively.
    const head = await this.publicClient.getBlockNumber();
    const CHUNK = 9n; // 10-block windows fit free tier
    const LOOKBACK_BLOCKS = 4_000n;
    const start = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;

    for (let from = head; from >= start; from -= CHUNK + 1n) {
      const to = from;
      const fromBlock = from > CHUNK ? from - CHUNK : 0n;
      try {
        const logs = await this.publicClient.getLogs({
          address: this.contractAddress,
          event: {
            type: 'event',
            name: 'Pulled',
            inputs: [
              { type: 'uint256', indexed: true, name: 'requestId' },
              { type: 'address', indexed: true, name: 'user' },
              { type: 'uint8', indexed: true, name: 'packTier' },
              { type: 'uint256', indexed: false, name: 'tokenId' },
              { type: 'uint8', indexed: false, name: 'bucket' },
              { type: 'bytes32', indexed: false, name: 'burnProof' },
            ],
          },
          args: { requestId } as any,
          fromBlock,
          toBlock: to,
        });
        if (logs.length > 0) {
          const log = logs[0];
          const decoded: any = decodeEventLog({
            abi: GACHA_V2_ABI,
            data: log.data,
            topics: log.topics,
          });
          return {
            tokenId: (decoded.args.tokenId as bigint).toString(),
            bucket: Number(decoded.args.bucket),
            txHash: log.transactionHash as Hex,
          };
        }
      } catch (e: any) {
        // Expected when range is bigger than RPC allows; just keep walking.
        this.logger.debug(`getLogs chunk failed: ${e.message?.slice(0, 80) ?? e}`);
      }
      if (fromBlock === 0n) break;
    }
    return null;
  }

  /** Pre-flight: total cards available across all buckets in a pack tier. */
  async totalAvailable(packTier: number): Promise<number> {
    const total = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: GACHA_V2_ABI,
      functionName: 'availableInPack',
      args: [packTier],
    })) as bigint;
    return Number(total);
  }

  /** Pre-flight: vault has approved the contract for transfers. */
  async isVaultReady(): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: GACHA_V2_ABI,
      functionName: 'isVaultReady',
    })) as boolean;
  }

  async isCardRegistered(packTier: number, tokenId: string): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: GACHA_V2_ABI,
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
      abi: GACHA_V2_ABI,
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
