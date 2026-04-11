import { Provider } from '@nestjs/common';
import IORedis from 'ioredis';

export const REDIS_CLIENT = 'GACHA_REDIS_CLIENT';

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: () => {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    return new IORedis(url, { maxRetriesPerRequest: 3 });
  },
};
