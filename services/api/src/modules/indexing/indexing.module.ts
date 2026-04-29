import { Module, forwardRef } from '@nestjs/common';
import { IndexingService } from './indexing.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [forwardRef(() => PricingModule)],
  providers: [IndexingService],
  exports: [IndexingService],
})
export class IndexingModule {}
