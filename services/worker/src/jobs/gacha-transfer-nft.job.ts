import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
} from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export interface GachaTransferNftPayload {
  pullId: string;
  gachaCardId: string;
  tokenId: string;
  recipientAddress: string;
}

const COURTYARD_CONTRACT = '0x251be3a17af4892035c37ebf5890f4a4d889dcad';
const prisma = new PrismaClient();

const erc721Abi = parseAbi([
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
]);

export default async function gachaTransferNftJob(
  job: Job<GachaTransferNftPayload>,
) {
  const { pullId, gachaCardId, tokenId, recipientAddress } = job.data;

  console.log(
    `[gachaTransferNft] Transferring token ${tokenId} to ${recipientAddress} for pull ${pullId}`,
  );

  const vaultPrivateKey = process.env.GACHA_VAULT_PRIVATE_KEY;
  const polygonRpcUrl = process.env.POLYGON_RPC_URL;
  const vaultAddress = process.env.GACHA_VAULT_ADDRESS;

  if (!vaultPrivateKey || !polygonRpcUrl || !vaultAddress) {
    throw new Error('Missing Polygon vault configuration');
  }

  // Increment retry count
  await prisma.gachaPull.update({
    where: { id: pullId },
    data: { retryCount: { increment: 1 } },
  });

  try {
    const account = privateKeyToAccount(vaultPrivateKey as `0x${string}`);

    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(polygonRpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(polygonRpcUrl),
    });

    const contractAddress = COURTYARD_CONTRACT as `0x${string}`;

    // Verify ownership before transferring
    const owner = await publicClient.readContract({
      address: contractAddress,
      abi: erc721Abi,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });

    if (owner.toLowerCase() !== vaultAddress.toLowerCase()) {
      throw new Error(
        `Vault no longer owns token ${tokenId}. Owner: ${owner}`,
      );
    }

    // Execute transfer
    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: erc721Abi,
      functionName: 'transferFrom',
      args: [
        vaultAddress as `0x${string}`,
        recipientAddress as `0x${string}`,
        BigInt(tokenId),
      ],
    });

    console.log(`[gachaTransferNft] Tx submitted: ${txHash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    if (receipt.status === 'reverted') {
      throw new Error(`Transfer tx ${txHash} reverted`);
    }

    // Success — update pull and card
    await prisma.$transaction([
      prisma.gachaPull.update({
        where: { id: pullId },
        data: { status: 'completed', polygonTxHash: txHash },
      }),
      prisma.gachaCard.update({
        where: { id: gachaCardId },
        data: { status: 'distributed', distributedAt: new Date() },
      }),
    ]);

    console.log(
      `[gachaTransferNft] Pull ${pullId} completed — token ${tokenId} transferred in block ${receipt.blockNumber}`,
    );
  } catch (err) {
    const reason = (err as Error).message;
    console.error(`[gachaTransferNft] Pull ${pullId} transfer failed: ${reason}`);

    // Check if retries exhausted (BullMQ will handle this, but we also check)
    const pull = await prisma.gachaPull.findUnique({ where: { id: pullId } });
    if (pull && pull.retryCount >= 5) {
      // Permanent failure — mark for manual resolution
      await prisma.gachaPull.update({
        where: { id: pullId },
        data: { status: 'refund_needed', failureReason: reason },
      });

      // Release the reserved card
      await prisma.gachaCard.update({
        where: { id: gachaCardId },
        data: {
          status: 'available',
          reservedAt: null,
          reservedByPullId: null,
        },
      });

      console.error(
        `[gachaTransferNft] Pull ${pullId} permanently failed — card released, marked refund_needed`,
      );
      return; // Don't re-throw, let it complete (failure handled)
    }

    throw err; // Let BullMQ retry
  }
}
