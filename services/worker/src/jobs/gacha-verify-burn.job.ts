import { Job } from 'bullmq';
import { Connection, PublicKey } from '@solana/web3.js';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export interface GachaVerifyBurnPayload {
  pullId: string;
  txSignature: string;
  solanaAddress: string;
  requiredAmountRaw: string;
}

const SLAB_MINT = '8d198qeKHyXf1aYQVoGNU9RMBnbdhHZFkvYpJMt8pump';
const prisma = new PrismaClient();

export default async function gachaVerifyBurnJob(
  job: Job<GachaVerifyBurnPayload>,
) {
  const { pullId, txSignature, solanaAddress, requiredAmountRaw } = job.data;

  console.log(`[gachaVerifyBurn] Verifying burn tx ${txSignature} for pull ${pullId}`);

  await prisma.gachaPull.update({
    where: { id: pullId },
    data: { status: 'verifying' },
  });

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'finalized');

  try {
    // Fetch the parsed transaction
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      throw new Error('Transaction not found — may not be finalized yet');
    }

    if (tx.meta?.err) {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);
    }

    // Look for SPL Token Burn instruction
    const instructions = tx.transaction.message.instructions;
    let burnFound = false;
    let burnAmount = BigInt(0);
    let burnMint = '';
    let burnAuthority = '';

    for (const ix of instructions) {
      if ('parsed' in ix && ix.program === 'spl-token') {
        const parsed = ix.parsed;
        if (parsed.type === 'burn' || parsed.type === 'burnChecked') {
          burnFound = true;
          burnAmount = BigInt(parsed.info.amount || parsed.info.tokenAmount?.amount || '0');
          burnMint = parsed.info.mint || '';
          burnAuthority = parsed.info.authority || '';
          break;
        }
      }
    }

    // Also check inner instructions (for programs that call SPL Token internally)
    if (!burnFound && tx.meta?.innerInstructions) {
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          if ('parsed' in ix && ix.program === 'spl-token') {
            const parsed = ix.parsed;
            if (parsed.type === 'burn' || parsed.type === 'burnChecked') {
              burnFound = true;
              burnAmount = BigInt(parsed.info.amount || parsed.info.tokenAmount?.amount || '0');
              burnMint = parsed.info.mint || '';
              burnAuthority = parsed.info.authority || '';
              break;
            }
          }
        }
        if (burnFound) break;
      }
    }

    if (!burnFound) {
      throw new Error('No SPL Token burn instruction found in transaction');
    }

    // Verify correct mint
    if (burnMint !== SLAB_MINT) {
      throw new Error(`Wrong token mint: expected ${SLAB_MINT}, got ${burnMint}`);
    }

    // Verify burn amount
    const requiredAmount = BigInt(requiredAmountRaw);
    if (burnAmount < requiredAmount) {
      throw new Error(
        `Insufficient burn amount: required ${requiredAmount}, got ${burnAmount}`,
      );
    }

    // Verify the signer matches the claimed solana address
    const signerPubkey = new PublicKey(solanaAddress);
    const accountKeys = tx.transaction.message.accountKeys.map((k) =>
      typeof k === 'string' ? k : k.pubkey.toBase58(),
    );
    if (!accountKeys.includes(signerPubkey.toBase58()) && burnAuthority !== solanaAddress) {
      throw new Error(
        `Signer mismatch: expected ${solanaAddress} in transaction signers`,
      );
    }

    console.log(
      `[gachaVerifyBurn] Burn verified: ${burnAmount} tokens of mint ${burnMint}`,
    );

    // Burn verified — select card and enqueue transfer
    await prisma.gachaPull.update({
      where: { id: pullId },
      data: { status: 'selecting' },
    });

    // Select a random card using weighted random
    const card = await selectCard(pullId);

    // Link card to pull and update status
    const pull = await prisma.gachaPull.update({
      where: { id: pullId },
      data: {
        gachaCardId: card.id,
        status: 'transferring',
      },
    });

    // Enqueue NFT transfer
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const transferQueue = new Queue('gachaTransferNft', {
      connection: new IORedis(redisUrl, { maxRetriesPerRequest: null }),
    });

    await transferQueue.add('gachaTransferNft', {
      pullId,
      gachaCardId: card.id,
      tokenId: card.tokenId,
      recipientAddress: pull.polygonAddress,
    });

    await transferQueue.close();

    console.log(
      `[gachaVerifyBurn] Card selected: ${card.cardName} (${card.tier}) — transfer enqueued`,
    );
  } catch (err) {
    const reason = (err as Error).message;
    console.error(`[gachaVerifyBurn] Pull ${pullId} failed: ${reason}`);

    await prisma.gachaPull.update({
      where: { id: pullId },
      data: {
        status: 'failed',
        failureReason: reason,
      },
    });

    throw err; // Let BullMQ handle retries
  }
}

async function selectCard(pullId: string) {
  // Load config
  const config = await prisma.gachaConfig.findFirst({ where: { id: 'default' } });
  const commonRate = config?.commonDropRate ?? 55;
  const uncommonRate = config?.uncommonDropRate ?? 30;
  const rareRate = config?.rareDropRate ?? 12;

  // Roll
  const roll = Math.floor(Math.random() * 100) + 1;
  let tier: string;
  if (roll <= commonRate) tier = 'common';
  else if (roll <= commonRate + uncommonRate) tier = 'uncommon';
  else if (roll <= commonRate + uncommonRate + rareRate) tier = 'rare';
  else tier = 'ultra_rare';

  // Try selected tier, then fall back to lower tiers
  const tiers = [tier];
  const allTiers = ['common', 'uncommon', 'rare', 'ultra_rare'];
  const idx = allTiers.indexOf(tier);
  for (let i = idx - 1; i >= 0; i--) {
    tiers.push(allTiers[i]);
  }

  for (const t of tiers) {
    const candidates = await prisma.gachaCard.findMany({
      where: { tier: t, status: 'available' },
      select: { id: true },
      take: 10,
    });

    if (candidates.length === 0) continue;

    const pick = candidates[Math.floor(Math.random() * candidates.length)];

    // Atomically reserve
    const result = await prisma.gachaCard.updateMany({
      where: { id: pick.id, status: 'available' },
      data: {
        status: 'reserved',
        reservedAt: new Date(),
        reservedByPullId: pullId,
      },
    });

    if (result.count === 0) continue; // Race condition — try another

    // Fetch full card data
    const card = await prisma.gachaCard.findUnique({
      where: { id: pick.id },
      include: {
        slab: {
          include: {
            assetRaw: { select: { tokenId: true, contractAddress: true } },
          },
        },
      },
    });

    if (!card) continue;

    return {
      id: card.id,
      tier: card.tier,
      cardName: card.slab.cardName,
      tokenId: card.slab.assetRaw.tokenId,
    };
  }

  throw new Error('No cards available in any tier');
}
