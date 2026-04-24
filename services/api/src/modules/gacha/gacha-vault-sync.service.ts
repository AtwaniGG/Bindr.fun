import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GachaContractService } from './gacha-contract.service';

const COURTYARD_CONTRACT = (
  process.env.COURTYARD_CONTRACT_ADDRESS ||
  '0x251be3a17af4892035c37ebf5890f4a4d889dcad'
).toLowerCase();

const VAULT_ADDRESS = (
  process.env.GACHA_VAULT_ADDRESS || ''
).toLowerCase();

const DEFAULT_PACK_TIER = 0; // Pack25
const DEFAULT_BUCKET = 0;    // common

export interface NftTransferEvent {
  fromAddress: string;
  toAddress: string;
  contractAddress: string;
  tokenIdHex: string; // from Alchemy, e.g. "0x7e4865..."
  txHash: string;
}

@Injectable()
export class GachaVaultSyncService {
  private readonly logger = new Logger(GachaVaultSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: GachaContractService,
  ) {}

  /**
   * Called for every ERC-721 transfer event from the Alchemy webhook.
   * Filters to Courtyard contract + vault-involved transfers, then reconciles
   * both DB state and contract bucket registration.
   */
  async handleTransfer(event: NftTransferEvent): Promise<void> {
    if (event.contractAddress.toLowerCase() !== COURTYARD_CONTRACT) return;
    if (!VAULT_ADDRESS) return;

    const from = event.fromAddress.toLowerCase();
    const to = event.toAddress.toLowerCase();

    const tokenIdDecimal = this.hexToDecimal(event.tokenIdHex);
    if (!tokenIdDecimal) {
      this.logger.warn(`Unparseable tokenId: ${event.tokenIdHex}`);
      return;
    }

    if (to === VAULT_ADDRESS) {
      await this.handleIncoming(tokenIdDecimal);
    } else if (from === VAULT_ADDRESS) {
      await this.handleOutgoing(tokenIdDecimal);
    }
  }

  /** Card arrived at the vault — make it available for pulls. */
  private async handleIncoming(tokenIdDecimal: string): Promise<void> {
    this.logger.log(`Vault received tokenId ${tokenIdDecimal.slice(0, 14)}…`);

    // 1. DB: upsert assets_raw -> slab -> gacha_card chain
    const existing = await this.prisma.assetRaw.findFirst({
      where: {
        contractAddress: COURTYARD_CONTRACT,
        tokenId: tokenIdDecimal,
      },
      include: { slab: { include: { gachaCard: true } } },
    });

    let gachaCardId: string;
    if (existing?.slab?.gachaCard) {
      // Returning card: flip existing GachaCard back to available
      await this.prisma.$transaction([
        this.prisma.assetRaw.update({
          where: { id: existing.id },
          data: { ownerAddress: VAULT_ADDRESS, lastIndexedAt: new Date() },
        }),
        this.prisma.gachaCard.update({
          where: { id: existing.slab.gachaCard.id },
          data: { status: 'available', distributedAt: null },
        }),
      ]);
      gachaCardId = existing.slab.gachaCard.id;
      this.logger.log(`Re-activated GachaCard ${gachaCardId}`);
    } else {
      // New card to the vault — create the whole chain with minimal metadata
      const asset = await this.prisma.assetRaw.upsert({
        where: {
          contractAddress_tokenId: { contractAddress: COURTYARD_CONTRACT, tokenId: tokenIdDecimal },
        },
        update: { ownerAddress: VAULT_ADDRESS, lastIndexedAt: new Date() },
        create: {
          chain: 'polygon',
          contractAddress: COURTYARD_CONTRACT,
          tokenId: tokenIdDecimal,
          ownerAddress: VAULT_ADDRESS,
          lastIndexedAt: new Date(),
        },
      });
      const slab = await this.prisma.slab.upsert({
        where: { assetRawId: asset.id },
        update: {},
        create: {
          assetRawId: asset.id,
          platform: 'courtyard',
          language: 'en',
          parseStatus: 'partial',
        },
      });
      const card = await this.prisma.gachaCard.create({
        data: { slabId: slab.id, tier: 'common', status: 'available' },
      });
      gachaCardId = card.id;
      this.logger.log(`Created GachaCard ${gachaCardId} for new tokenId`);
    }

    // 2. Contract: register if not already present
    try {
      const already = await this.contractService.isCardRegistered(
        DEFAULT_PACK_TIER,
        tokenIdDecimal,
      );
      if (already) {
        this.logger.log(`Token already in contract bucket; skipping addCards`);
        return;
      }
      const tx = await this.contractService.addCards(
        DEFAULT_PACK_TIER,
        [tokenIdDecimal],
        [DEFAULT_BUCKET],
      );
      this.logger.log(`addCards tx ${tx} registered token in bucket ${DEFAULT_BUCKET}`);
    } catch (err: any) {
      this.logger.error(
        `addCards failed for token ${tokenIdDecimal.slice(0, 14)}…: ${err.message}`,
      );
    }
  }

  /** Card left the vault — mark DB record distributed. */
  private async handleOutgoing(tokenIdDecimal: string): Promise<void> {
    const asset = await this.prisma.assetRaw.findFirst({
      where: { contractAddress: COURTYARD_CONTRACT, tokenId: tokenIdDecimal },
      include: { slab: { include: { gachaCard: true } } },
    });
    if (!asset?.slab?.gachaCard) return;
    if (asset.slab.gachaCard.status === 'distributed') return;

    await this.prisma.gachaCard.update({
      where: { id: asset.slab.gachaCard.id },
      data: { status: 'distributed', distributedAt: new Date() },
    });
    this.logger.log(
      `Marked GachaCard ${asset.slab.gachaCard.id} distributed (token left vault)`,
    );
  }

  private hexToDecimal(hex: string): string | null {
    try {
      return BigInt(hex).toString();
    } catch {
      return null;
    }
  }
}
