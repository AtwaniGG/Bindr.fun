import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { randomInt } from 'crypto';

dotenv.config({ path: '../../.env' });
dotenv.config();

// Unambiguous alphabet: A-Z minus I, O, L + 2-9 (no 0, 1)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;

function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

async function main() {
  const countArg = process.argv.find((a) => a.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 10;
  if (!Number.isFinite(count) || count < 1 || count > 10000) {
    throw new Error('--count must be a positive integer (max 10000)');
  }

  const prisma = new PrismaClient();
  const made: string[] = [];
  let attempts = 0;
  const maxAttempts = count * 5;

  while (made.length < count && attempts < maxAttempts) {
    attempts++;
    const code = generateCode();
    try {
      await prisma.betaAccessCode.create({ data: { code } });
      made.push(code);
    } catch (e: any) {
      if (e.code !== 'P2002') throw e; // P2002 = unique violation, retry
    }
  }

  await prisma.$disconnect();

  if (made.length < count) {
    throw new Error(`Only generated ${made.length}/${count} codes after ${attempts} attempts`);
  }

  // Output as CSV (header + rows)
  console.log('code');
  for (const c of made) console.log(c);
  console.error(`\nGenerated ${made.length} codes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
