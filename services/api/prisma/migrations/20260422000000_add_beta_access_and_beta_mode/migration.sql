-- AlterTable
ALTER TABLE "gacha_config" ADD COLUMN     "beta_mode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "beta_price_usd" DECIMAL(10,2) NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "beta_access_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "redeemed_by" TEXT,
    "redeemed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beta_access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beta_access_codes_code_key" ON "beta_access_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "beta_access_codes_redeemed_by_key" ON "beta_access_codes"("redeemed_by");

-- CreateIndex
CREATE INDEX "beta_access_codes_redeemed_by_idx" ON "beta_access_codes"("redeemed_by");
