-- AlterTable
ALTER TABLE "gacha_pulls" ADD COLUMN     "bucket" INTEGER,
ADD COLUMN     "contract_tx_hash" TEXT,
ADD COLUMN     "pack_tier" INTEGER NOT NULL DEFAULT 0;
