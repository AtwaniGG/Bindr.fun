import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Inject } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { PrismaService } from '../../prisma/prisma.service';
import { GachaPriceService } from './gacha-price.service';
import { GachaInventoryService } from './gacha-inventory.service';
import { BetaAccessService } from './beta-access.service';
import { GachaContractService } from './gacha-contract.service';
import type {
  GachaPullResponse,
  GachaHistoryItem,
  GachaCardInfo,
} from '@pokedex-slabs/shared';
import { SLAB_MINT_ADDRESS } from '@pokedex-slabs/shared';
import { GACHA_VERIFY_QUEUE, GACHA_TRANSFER_QUEUE } from '../../common/bullmq/bullmq.module';

@Injectable()
export class GachaService {
  private readonly logger = new Logger(GachaService.name);
  // Lazy-init shared Solana RPC connection so we don't open a new socket
  // on every pull. Reused across requests.
  private solanaConnection: Connection | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceService: GachaPriceService,
    private readonly inventoryService: GachaInventoryService,
    private readonly betaAccess: BetaAccessService,
    private readonly contractService: GachaContractService,
    @Inject(GACHA_VERIFY_QUEUE) private readonly verifyQueue: Queue,
    @Inject(GACHA_TRANSFER_QUEUE) private readonly transferQueue: Queue,
  ) {}

  private getSolanaConnection(): Connection {
    if (!this.solanaConnection) {
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
      this.solanaConnection = new Connection(rpcUrl, 'confirmed');
    }
    return this.solanaConnection;
  }

  async initiatePull(
    txSignature: string,
    polygonAddress: string,
    solanaAddress: string,
  ): Promise<GachaPullResponse> {
    // 1. Check if gacha is active
    const config = await this.prisma.gachaConfig.findFirst({
      where: { id: 'default' },
    });
    if (config && !config.isActive) {
      throw new BadRequestException('Gacha is currently paused');
    }

    // 1b. Beta-mode whitelist gate
    if (config?.betaMode) {
      const ok = await this.betaAccess.isWhitelisted(solanaAddress);
      if (!ok) {
        throw new BadRequestException(
          'Beta access required — redeem an access code first',
        );
      }
    }

    // 2. Pre-flight: refuse to accept the burn if the on-chain pool is already
    // empty. Without this, a user's $SLAB gets burned and the contract reverts
    // PoolEmpty after, which they can't undo.
    const packTier = 0;
    const onChainStock = await this.contractService.totalAvailable(packTier);
    if (onChainStock === 0) {
      throw new BadRequestException(
        'Pool is empty — no cards available to pull. Try again once more are added.',
      );
    }

    // 3. Check for duplicate tx signature
    const existing = await this.prisma.gachaPull.findUnique({
      where: { txSignature },
    });
    if (existing) {
      throw new BadRequestException('This transaction has already been submitted');
    }

    // 4. Get current SLAB price for recording
    const price = await this.priceService.getSlabTokenPrice();

    // 5. Create pull record
    const pull = await this.prisma.gachaPull.create({
      data: {
        solanaAddress,
        polygonAddress,
        txSignature,
        burnAmountRaw: price.tokensRequiredRaw,
        burnAmountTokens: parseFloat(price.tokensRequired),
        slabPriceUsd: price.priceUsd,
        status: 'verifying',
      },
    });

    // 6. Verify burn INLINE (no queue)
    await this.verifyBurnInline(pull.id, txSignature, solanaAddress, price.tokensRequiredRaw);

    // 7. Submit VRF-backed pull request to V2. Returns immediately with a
    // requestId; the actual NFT transfer happens later when Chainlink VRF
    // calls fulfillRandomWords. Frontend polls /pull/:pullId until status
    // flips from 'pending' to 'completed'.
    let request;
    try {
      request = await this.contractService.requestPull(polygonAddress, packTier, txSignature);
    } catch (err: any) {
      const errorName: string | undefined = err?.cause?.data?.errorName ?? err?.data?.errorName;
      const friendly =
        errorName === 'PoolEmpty'
          ? 'Pool is empty — your burn went through but no cards are available to pull. Please contact support.'
          : errorName === 'BurnProofZero'
            ? 'Invalid burn proof — please retry.'
            : errorName === 'BurnProofAlreadyUsed'
              ? 'This burn was already submitted.'
              : errorName === 'PullCooldownActive'
                ? 'You pulled too recently — please wait a minute before pulling again.'
                : errorName === 'BlockPullCapReached'
                  ? 'Server is busy — please retry in a few seconds.'
                  : null;
      await this.prisma.gachaPull.update({
        where: { id: pull.id },
        data: {
          status: 'failed',
          failureReason: `requestPull: ${errorName || err.message?.slice(0, 200)}`,
        },
      });
      if (friendly) throw new BadRequestException(friendly);
      throw err;
    }

    await this.prisma.gachaPull.update({
      where: { id: pull.id },
      data: {
        status: 'pending',
        contractTxHash: request.txHash,
        packTier,
        vrfRequestId: request.requestId,
      },
    });

    this.logger.log(
      `Pull ${pull.id}: requestPull tx ${request.txHash} requestId ${request.requestId} — awaiting VRF`,
    );

    return {
      pullId: pull.id,
      status: 'pending',
      card: null,
      polygonTxHash: request.txHash,
      createdAt: pull.createdAt.toISOString(),
    };
  }

  private async verifyBurnInline(
    pullId: string,
    txSignature: string,
    solanaAddress: string,
    requiredAmountRaw: string,
  ): Promise<void> {
    const connection = this.getSolanaConnection();

    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      await this.prisma.gachaPull.update({
        where: { id: pullId },
        data: { status: 'failed', failureReason: 'Transaction not found' },
      });
      throw new BadRequestException('Transaction not found on Solana');
    }

    if (tx.meta?.err) {
      await this.prisma.gachaPull.update({
        where: { id: pullId },
        data: { status: 'failed', failureReason: 'Transaction failed on-chain' },
      });
      throw new BadRequestException('Transaction failed on-chain');
    }

    // Find SPL Token burn instruction
    let burnFound = false;
    let burnAmount = BigInt(0);
    let burnMint = '';

    const allInstructions = [
      ...tx.transaction.message.instructions,
      ...(tx.meta?.innerInstructions?.flatMap((i) => i.instructions) || []),
    ];

    for (const ix of allInstructions) {
      if ('parsed' in ix && ix.program === 'spl-token') {
        const parsed = ix.parsed;
        if (parsed.type === 'burn' || parsed.type === 'burnChecked') {
          burnFound = true;
          burnAmount = BigInt(parsed.info.amount || parsed.info.tokenAmount?.amount || '0');
          burnMint = parsed.info.mint || '';
          break;
        }
      }
    }

    if (!burnFound) {
      await this.prisma.gachaPull.update({
        where: { id: pullId },
        data: { status: 'failed', failureReason: 'No burn instruction found' },
      });
      throw new BadRequestException('No SPL Token burn found in transaction');
    }

    if (burnMint !== SLAB_MINT_ADDRESS) {
      await this.prisma.gachaPull.update({
        where: { id: pullId },
        data: { status: 'failed', failureReason: `Wrong token: ${burnMint}` },
      });
      throw new BadRequestException('Wrong token burned');
    }

    if (burnAmount < BigInt(requiredAmountRaw)) {
      await this.prisma.gachaPull.update({
        where: { id: pullId },
        data: { status: 'failed', failureReason: `Insufficient: ${burnAmount} < ${requiredAmountRaw}` },
      });
      throw new BadRequestException('Insufficient burn amount');
    }

    this.logger.log(`Burn verified: ${burnAmount} SLAB tokens`);
  }

  async getPullStatus(pullId: string): Promise<GachaPullResponse> {
    const pull = await this.prisma.gachaPull.findUnique({
      where: { id: pullId },
      include: {
        gachaCard: {
          include: {
            slab: { include: { assetRaw: true } },
          },
        },
      },
    });

    if (!pull) {
      throw new BadRequestException('Pull not found');
    }

    // V2: if the pull is pending and we know its VRF requestId, poll the
    // contract on-demand to see if it's been fulfilled. Update the row when
    // the state actually changes so subsequent reads are cheap.
    if (pull.status === 'pending' && pull.vrfRequestId) {
      try {
        const onChain = await this.contractService.getPullStatus(pull.vrfRequestId);
        if (onChain.status === 'completed' && onChain.tokenId) {
          const gachaCard = await this.prisma.gachaCard.findFirst({
            where: { slab: { assetRaw: { tokenId: onChain.tokenId } } },
            include: { slab: { include: { assetRaw: true } } },
          });
          if (gachaCard) {
            // gacha_card_id is @unique on GachaPull. In the beta we recycle
            // cards (pull → return to vault → re-add → pull again), so the
            // same GachaCard can legitimately be linked to multiple historical
            // pulls. Detach any prior link before attaching to this new pull.
            await this.prisma.gachaPull.updateMany({
              where: { gachaCardId: gachaCard.id, NOT: { id: pull.id } },
              data: { gachaCardId: null },
            });
            await this.prisma.gachaCard.update({
              where: { id: gachaCard.id },
              data: { status: 'distributed', distributedAt: new Date() },
            });
          }
          const updated = await this.prisma.gachaPull.update({
            where: { id: pull.id },
            data: {
              status: 'completed',
              gachaCardId: gachaCard?.id ?? null,
              polygonTxHash: onChain.txHash ?? pull.polygonTxHash,
              bucket: onChain.bucket ?? null,
            },
            include: {
              gachaCard: { include: { slab: { include: { assetRaw: true } } } },
            },
          });
          return {
            pullId: updated.id,
            status: 'completed',
            card: updated.gachaCard ? this.mapCardInfo(updated.gachaCard) : null,
            polygonTxHash: updated.polygonTxHash,
            createdAt: updated.createdAt.toISOString(),
          };
        }
        if (onChain.status === 'awaiting_claim') {
          await this.prisma.gachaPull.update({
            where: { id: pull.id },
            data: { status: 'refund_needed', failureReason: 'Transfer failed; awaiting manual claim' },
          });
        }
        if (onChain.status === 'cancelled') {
          await this.prisma.gachaPull.update({
            where: { id: pull.id },
            data: { status: 'failed', failureReason: 'Pull cancelled by admin' },
          });
        }
      } catch (e: any) {
        this.logger.warn(`getPullStatus poll failed for ${pull.id}: ${e.message}`);
      }
    }

    return {
      pullId: pull.id,
      status: pull.status as any,
      card: pull.gachaCard ? this.mapCardInfo(pull.gachaCard) : null,
      polygonTxHash: pull.polygonTxHash,
      createdAt: pull.createdAt.toISOString(),
    };
  }

  async getPullHistory(opts: {
    wallet?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: GachaHistoryItem[]; total: number; page: number }> {
    const page = opts.page || 1;
    const limit = Math.min(opts.limit || 20, 50);
    const skip = (page - 1) * limit;

    const where: any = { status: 'completed' };
    if (opts.wallet) {
      where.solanaAddress = opts.wallet;
    }

    const [pulls, total] = await Promise.all([
      this.prisma.gachaPull.findMany({
        where,
        include: {
          gachaCard: { include: { slab: { include: { assetRaw: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.gachaPull.count({ where }),
    ]);

    return {
      data: pulls.map((pull) => ({
        pullId: pull.id,
        solanaAddress: pull.solanaAddress,
        txSignature: pull.txSignature,
        burnAmountTokens: pull.burnAmountTokens.toString(),
        status: pull.status as any,
        card: pull.gachaCard ? this.mapCardInfo(pull.gachaCard) : null,
        polygonTxHash: pull.polygonTxHash,
        createdAt: pull.createdAt.toISOString(),
      })),
      total,
      page,
    };
  }

  /**
   * Called by the verify worker job after burn is confirmed.
   * Selects a card and enqueues the NFT transfer.
   */
  async processVerifiedBurn(pullId: string): Promise<void> {
    // Update status
    await this.prisma.gachaPull.update({
      where: { id: pullId },
      data: { status: 'selecting' },
    });

    // Select a random card
    const card = await this.inventoryService.selectCardForPull(pullId);

    // Link card to pull
    await this.prisma.gachaPull.update({
      where: { id: pullId },
      data: {
        gachaCardId: card.id,
        status: 'transferring',
      },
    });

    // Enqueue NFT transfer
    await this.transferQueue.add('gachaTransferNft', {
      pullId,
      gachaCardId: card.id,
      tokenId: card.slab.assetRaw.tokenId,
      recipientAddress: (
        await this.prisma.gachaPull.findUnique({ where: { id: pullId } })
      )!.polygonAddress,
    });

    this.logger.log(
      `Pull ${pullId}: card ${card.slab.cardName} (${card.tier}) selected — transferring`,
    );
  }

  /**
   * Called by the transfer worker job on success.
   */
  async completeTransfer(pullId: string, polygonTxHash: string): Promise<void> {
    const pull = await this.prisma.gachaPull.findUnique({
      where: { id: pullId },
    });
    if (!pull || !pull.gachaCardId) return;

    await this.prisma.$transaction([
      this.prisma.gachaPull.update({
        where: { id: pullId },
        data: { status: 'completed', polygonTxHash },
      }),
      this.prisma.gachaCard.update({
        where: { id: pull.gachaCardId },
        data: { status: 'distributed', distributedAt: new Date() },
      }),
    ]);

    this.logger.log(`Pull ${pullId} completed — tx ${polygonTxHash}`);
  }

  /**
   * Called by the transfer worker job after all retries exhausted.
   */
  async handleTransferFailure(
    pullId: string,
    reason: string,
  ): Promise<void> {
    const pull = await this.prisma.gachaPull.findUnique({
      where: { id: pullId },
    });
    if (!pull) return;

    await this.prisma.gachaPull.update({
      where: { id: pullId },
      data: { status: 'refund_needed', failureReason: reason },
    });

    // Release the reserved card back to available
    if (pull.gachaCardId) {
      await this.inventoryService.releaseReservedCard(pull.gachaCardId);
    }

    this.logger.error(`Pull ${pullId} failed permanently: ${reason}`);
  }

  /**
   * Admin: retry a failed transfer by re-enqueuing the transfer job.
   */
  async retryFailedTransfer(pullId: string): Promise<{ status: string }> {
    const pull = await this.prisma.gachaPull.findUnique({
      where: { id: pullId },
      include: {
        gachaCard: {
          include: { slab: { include: { assetRaw: true } } },
        },
      },
    });

    if (!pull) throw new BadRequestException('Pull not found');
    if (pull.status !== 'refund_needed' && pull.status !== 'failed') {
      throw new BadRequestException(`Pull is in status "${pull.status}", cannot retry`);
    }
    if (!pull.gachaCard) {
      throw new BadRequestException('No card assigned to this pull');
    }

    // Re-reserve the card if it was released
    if (pull.gachaCard.status === 'available') {
      await this.prisma.gachaCard.update({
        where: { id: pull.gachaCard.id },
        data: { status: 'reserved', reservedAt: new Date(), reservedByPullId: pullId },
      });
    }

    await this.prisma.gachaPull.update({
      where: { id: pullId },
      data: { status: 'transferring', retryCount: 0 },
    });

    await this.transferQueue.add('gachaTransferNft', {
      pullId,
      gachaCardId: pull.gachaCard.id,
      tokenId: pull.gachaCard.slab.assetRaw.tokenId,
      recipientAddress: pull.polygonAddress,
    });

    this.logger.log(`Pull ${pullId} retry enqueued`);
    return { status: 'transferring' };
  }

  /**
   * Admin: manually override a card's tier.
   */
  async updateCardTier(
    cardId: string,
    tier?: string,
  ): Promise<{ id: string; tier: string; tierOverride: boolean }> {
    const validTiers = ['common', 'uncommon', 'rare', 'ultra_rare'];
    if (!tier || !validTiers.includes(tier)) {
      throw new BadRequestException(`Invalid tier. Must be one of: ${validTiers.join(', ')}`);
    }

    const card = await this.prisma.gachaCard.update({
      where: { id: cardId },
      data: { tier, tierOverride: true },
    });

    return { id: card.id, tier: card.tier, tierOverride: card.tierOverride };
  }

  async getOwnedCourtyardNfts(polygonAddress: string) {
    const key = process.env.ALCHEMY_API_KEY || '';
    const courtyard =
      process.env.COURTYARD_CONTRACT_ADDRESS ||
      '0x251be3a17af4892035c37ebf5890f4a4d889dcad';
    if (!key) {
      throw new Error('ALCHEMY_API_KEY not configured');
    }

    const base = 'https://polygon-mainnet.g.alchemy.com/nft/v3';
    const all: any[] = [];
    let pageKey: string | undefined;

    do {
      const url = new URL(`${base}/${key}/getNFTsForOwner`);
      url.searchParams.set('owner', polygonAddress);
      url.searchParams.set('contractAddresses[]', courtyard);
      url.searchParams.set('withMetadata', 'true');
      url.searchParams.set('pageSize', '100');
      if (pageKey) url.searchParams.set('pageKey', pageKey);

      const res = await fetch(url.toString());
      if (!res.ok) {
        this.logger.error(`Alchemy ${res.status} ${res.statusText}`);
        break;
      }
      const data: any = await res.json();
      all.push(...(data.ownedNfts || []));
      pageKey = data.pageKey;
    } while (pageKey);

    // Decimal tokenIds for DB lookup (assets_raw.token_id stored as decimal string)
    const tokenIdsDecimal = all
      .map((n) => {
        try {
          return BigInt(n.tokenId).toString();
        } catch {
          return null;
        }
      })
      .filter((x): x is string => !!x);

    const assets = tokenIdsDecimal.length
      ? await this.prisma.assetRaw.findMany({
          where: { tokenId: { in: tokenIdsDecimal } },
          include: { slab: true },
        })
      : [];
    const byTokenId = new Map(assets.map((a) => [a.tokenId, a]));

    return all.map((n) => {
      let decimalId: string | null = null;
      try {
        decimalId = BigInt(n.tokenId).toString();
      } catch {
        /* ignore */
      }
      const asset = decimalId ? byTokenId.get(decimalId) : undefined;
      const slab = asset?.slab;
      return {
        tokenId: decimalId,
        tokenIdHex: decimalId ? '0x' + BigInt(decimalId).toString(16).padStart(64, '0') : null,
        contractAddress: courtyard,
        name: slab?.cardName ?? n.name ?? null,
        setName: slab?.setName ?? null,
        grader: slab?.grader ?? null,
        grade: slab?.grade ?? null,
        imageUrl: slab?.imageUrl ?? n.image?.cachedUrl ?? n.image?.originalUrl ?? null,
        certNumber: slab?.certNumber ?? null,
      };
    });
  }

  private mapCardInfo(gachaCard: any): GachaCardInfo {
    return {
      id: gachaCard.id,
      tier: gachaCard.tier,
      cardName: gachaCard.slab?.cardName ?? null,
      setName: gachaCard.slab?.setName ?? null,
      grader: gachaCard.slab?.grader ?? null,
      grade: gachaCard.slab?.grade ?? null,
      imageUrl: gachaCard.slab?.imageUrl ?? null,
      certNumber: gachaCard.slab?.certNumber ?? null,
      tokenId: gachaCard.slab?.assetRaw?.tokenId ?? null,
    };
  }
}
