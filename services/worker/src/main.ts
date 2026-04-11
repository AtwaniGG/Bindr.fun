import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const QUEUES = [
  'indexWallet',
  'parseMetadata',
  'priceFetch',
  'computeSetProgress',
  'invoicePoll',
  'alertsEval',
  'dailySnapshots',
  'gachaVerifyBurn',
  'gachaTransferNft',
] as const;

// Dynamic job handler loader
async function getJobHandler(queueName: string) {
  switch (queueName) {
    case 'indexWallet':
      return (await import('./jobs/index-wallet.job')).default;
    case 'parseMetadata':
      return (await import('./jobs/parse-metadata.job')).default;
    case 'priceFetch':
      return (await import('./jobs/fetch-price.job')).default;
    case 'computeSetProgress':
      return (await import('./jobs/compute-set-progress.job')).default;
    case 'invoicePoll':
      return (await import('./jobs/invoice-poll.job')).default;
    case 'alertsEval':
      return (await import('./jobs/alerts-eval.job')).default;
    case 'dailySnapshots':
      return (await import('./jobs/daily-snapshots.job')).default;
    case 'gachaVerifyBurn':
      return (await import('./jobs/gacha-verify-burn.job')).default;
    case 'gachaTransferNft':
      return (await import('./jobs/gacha-transfer-nft.job')).default;
    default:
      throw new Error(`Unknown queue: ${queueName}`);
  }
}

async function bootstrap() {
  console.log('Worker starting...');

  const workers = QUEUES.map((queueName) => {
    const worker = new Worker(
      queueName,
      async (job) => {
        const handler = await getJobHandler(queueName);
        return handler(job);
      },
      { connection },
    );

    worker.on('completed', (job) => {
      console.log(`[${queueName}] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[${queueName}] Job ${job?.id} failed:`, err.message);
    });

    return worker;
  });

  console.log(`Worker running with ${workers.length} queue handlers`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down workers...');
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    process.exit(0);
  });
}

bootstrap();
