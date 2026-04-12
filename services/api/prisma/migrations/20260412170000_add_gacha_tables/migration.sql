-- CreateTable
CREATE TABLE "gacha_cards" (
    "id" TEXT NOT NULL,
    "slab_id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "tier_override" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'available',
    "reserved_at" TIMESTAMP(3),
    "reserved_by_pull_id" TEXT,
    "distributed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gacha_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gacha_pulls" (
    "id" TEXT NOT NULL,
    "solana_address" TEXT NOT NULL,
    "polygon_address" TEXT NOT NULL,
    "tx_signature" TEXT NOT NULL,
    "gacha_card_id" TEXT,
    "burn_amount_raw" TEXT NOT NULL,
    "burn_amount_tokens" DECIMAL(18,6) NOT NULL,
    "slab_price_usd" DECIMAL(18,8) NOT NULL,
    "polygon_tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gacha_pulls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gacha_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "burn_amount_usd" DECIMAL(10,2) NOT NULL DEFAULT 25,
    "common_threshold" DECIMAL(10,2) NOT NULL DEFAULT 20,
    "uncommon_threshold" DECIMAL(10,2) NOT NULL DEFAULT 50,
    "rare_threshold" DECIMAL(10,2) NOT NULL DEFAULT 150,
    "common_drop_rate" INTEGER NOT NULL DEFAULT 55,
    "uncommon_drop_rate" INTEGER NOT NULL DEFAULT 30,
    "rare_drop_rate" INTEGER NOT NULL DEFAULT 12,
    "ultra_rare_drop_rate" INTEGER NOT NULL DEFAULT 3,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gacha_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gacha_cards_slab_id_key" ON "gacha_cards"("slab_id");

-- CreateIndex
CREATE INDEX "gacha_cards_tier_status_idx" ON "gacha_cards"("tier", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gacha_pulls_tx_signature_key" ON "gacha_pulls"("tx_signature");

-- CreateIndex
CREATE UNIQUE INDEX "gacha_pulls_gacha_card_id_key" ON "gacha_pulls"("gacha_card_id");

-- CreateIndex
CREATE INDEX "gacha_pulls_solana_address_idx" ON "gacha_pulls"("solana_address");

-- CreateIndex
CREATE INDEX "gacha_pulls_status_idx" ON "gacha_pulls"("status");

-- CreateIndex
CREATE INDEX "gacha_pulls_created_at_idx" ON "gacha_pulls"("created_at");

-- AddForeignKey
ALTER TABLE "gacha_cards" ADD CONSTRAINT "gacha_cards_slab_id_fkey" FOREIGN KEY ("slab_id") REFERENCES "slabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gacha_pulls" ADD CONSTRAINT "gacha_pulls_gacha_card_id_fkey" FOREIGN KEY ("gacha_card_id") REFERENCES "gacha_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default config row
INSERT INTO "gacha_config" ("id", "updated_at") VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
