import { Module } from '@nestjs/common';
import { GachaController } from './gacha.controller';
import { GachaService } from './gacha.service';
import { GachaPriceService } from './gacha-price.service';
import { GachaInventoryService } from './gacha-inventory.service';
import { GachaTransferService } from './gacha-transfer.service';
import { BetaAccessService } from './beta-access.service';
import { GachaContractService } from './gacha-contract.service';
import { RedisProvider } from './redis.provider';
import { IndexingModule } from '../indexing/indexing.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [IndexingModule, PricingModule],
  controllers: [GachaController],
  providers: [
    GachaService,
    GachaPriceService,
    GachaInventoryService,
    GachaTransferService,
    BetaAccessService,
    GachaContractService,
    RedisProvider,
  ],
  exports: [GachaService, GachaInventoryService, BetaAccessService],
})
export class GachaModule {}
