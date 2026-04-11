import { Module, Global } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const GACHA_VERIFY_QUEUE = 'GACHA_VERIFY_QUEUE';
export const GACHA_TRANSFER_QUEUE = 'GACHA_TRANSFER_QUEUE';

const redisConnection = () => {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(url, { maxRetriesPerRequest: null });
};

@Global()
@Module({
  providers: [
    {
      provide: GACHA_VERIFY_QUEUE,
      useFactory: () => new Queue('gachaVerifyBurn', { connection: redisConnection() }),
    },
    {
      provide: GACHA_TRANSFER_QUEUE,
      useFactory: () => new Queue('gachaTransferNft', { connection: redisConnection() }),
    },
  ],
  exports: [GACHA_VERIFY_QUEUE, GACHA_TRANSFER_QUEUE],
})
export class BullmqModule {}
