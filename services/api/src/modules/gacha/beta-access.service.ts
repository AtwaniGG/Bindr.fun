import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BetaAccessService {
  private readonly logger = new Logger(BetaAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  async isBetaModeActive(): Promise<{ active: boolean; priceUsd: number }> {
    const config = await this.prisma.gachaConfig.findFirst({ where: { id: 'default' } });
    return {
      active: !!config?.betaMode,
      priceUsd: config ? Number(config.betaPriceUsd) : 1,
    };
  }

  async isWhitelisted(solanaAddress: string): Promise<boolean> {
    const row = await this.prisma.betaAccessCode.findUnique({
      where: { redeemedBy: solanaAddress },
    });
    return !!row;
  }

  async redeemCode(
    code: string,
    solanaAddress: string,
  ): Promise<{ alreadyBound: boolean }> {
    const normalized = code.trim().toUpperCase();

    // Already whitelisted? Treat as idempotent success.
    const existing = await this.prisma.betaAccessCode.findUnique({
      where: { redeemedBy: solanaAddress },
    });
    if (existing) return { alreadyBound: true };

    // Atomic claim: only claim if unredeemed.
    const result = await this.prisma.betaAccessCode.updateMany({
      where: { code: normalized, redeemedBy: null },
      data: { redeemedBy: solanaAddress, redeemedAt: new Date() },
    });

    if (result.count === 0) {
      const row = await this.prisma.betaAccessCode.findUnique({ where: { code: normalized } });
      if (!row) throw new BadRequestException('Invalid access code');
      throw new BadRequestException('This code has already been redeemed');
    }

    this.logger.log(`Code ${normalized} redeemed by ${solanaAddress}`);
    return { alreadyBound: false };
  }
}
