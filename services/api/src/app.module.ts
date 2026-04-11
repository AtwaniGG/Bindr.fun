import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './modules/public/public.module';
import { SlabsModule } from './modules/slabs/slabs.module';
import { SetsModule } from './modules/sets/sets.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { OpsModule } from './modules/ops/ops.module';
import { AuthModule } from './modules/auth/auth.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { BetaModule } from './modules/beta/beta.module';
import { IndexingModule } from './modules/indexing/indexing.module';
import { PokemonTcgModule } from './modules/pokemon-tcg/pokemon-tcg.module';
import { GachaModule } from './modules/gacha/gacha.module';
import { BullmqModule } from './common/bullmq/bullmq.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullmqModule,
    PrismaModule,
    IndexingModule,
    PokemonTcgModule,
    PublicModule,
    SlabsModule,
    SetsModule,
    PricingModule,
    OpsModule,
    AuthModule,
    PaymentsModule,
    SubscriptionsModule,
    PortfolioModule,
    AlertsModule,
    BetaModule,
    GachaModule,
  ],
})
export class AppModule {}
