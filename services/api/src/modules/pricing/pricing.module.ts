import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { AltService } from './alt.service';
import { TcgdexAdapter } from './tcgdex.adapter';
import { PriceTrackerService } from './price-tracker.service';
import { PokemonApiService } from './pokemon-api.service';
import { RedisProvider } from './redis.provider';
import { PokemonTcgModule } from '../pokemon-tcg/pokemon-tcg.module';

@Module({
  imports: [PokemonTcgModule],
  controllers: [PricingController],
  providers: [
    PricingService,
    AltService,
    TcgdexAdapter,
    PriceTrackerService,
    PokemonApiService,
    RedisProvider,
  ],
  exports: [PricingService],
})
export class PricingModule {}
