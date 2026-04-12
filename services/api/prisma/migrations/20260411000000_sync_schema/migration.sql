-- Idempotent sync migration: adds missing tables/columns that existed via `db push` but lacked migration files.

-- AlterTable: set_references
ALTER TABLE "set_references" DROP COLUMN IF EXISTS "tcgdex_set_id";
ALTER TABLE "set_references" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "set_references" ADD COLUMN IF NOT EXISTS "logo_url" TEXT;
ALTER TABLE "set_references" ADD COLUMN IF NOT EXISTS "ptcg_set_id" TEXT;
ALTER TABLE "set_references" ADD COLUMN IF NOT EXISTS "series" TEXT;
ALTER TABLE "set_references" ADD COLUMN IF NOT EXISTS "symbol_url" TEXT;

-- AlterTable: slabs
ALTER TABLE "slabs" ADD COLUMN IF NOT EXISTS "card_type" TEXT;
ALTER TABLE "slabs" ADD COLUMN IF NOT EXISTS "dex_id" INTEGER;
ALTER TABLE "slabs" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "slabs" ADD COLUMN IF NOT EXISTS "rarity" TEXT;

-- CreateTable: slab_prices
CREATE TABLE IF NOT EXISTS "slab_prices" (
    "slab_id" TEXT NOT NULL,
    "price_usd" DECIMAL(12,2),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slab_prices_pkey" PRIMARY KEY ("slab_id")
);

-- CreateTable: card_references
CREATE TABLE IF NOT EXISTS "card_references" (
    "id" TEXT NOT NULL,
    "ptcg_card_id" TEXT NOT NULL,
    "card_name" TEXT NOT NULL,
    "card_number" TEXT NOT NULL,
    "set_ref_id" TEXT NOT NULL,
    "set_name" TEXT NOT NULL,
    "image_small" TEXT,
    "image_large" TEXT,

    CONSTRAINT "card_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable: beta_signups
CREATE TABLE IF NOT EXISTS "beta_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beta_signups_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "card_references_ptcg_card_id_key" ON "card_references"("ptcg_card_id");
CREATE INDEX IF NOT EXISTS "card_references_card_name_idx" ON "card_references"("card_name");
CREATE INDEX IF NOT EXISTS "card_references_card_number_idx" ON "card_references"("card_number");
CREATE INDEX IF NOT EXISTS "card_references_set_name_idx" ON "card_references"("set_name");
CREATE INDEX IF NOT EXISTS "card_references_card_name_card_number_idx" ON "card_references"("card_name", "card_number");
CREATE UNIQUE INDEX IF NOT EXISTS "beta_signups_email_key" ON "beta_signups"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "set_references_ptcg_set_id_key" ON "set_references"("ptcg_set_id");

-- Foreign keys (idempotent via DO blocks)
DO $$ BEGIN
  ALTER TABLE "slab_prices" ADD CONSTRAINT "slab_prices_slab_id_fkey" FOREIGN KEY ("slab_id") REFERENCES "slabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "card_references" ADD CONSTRAINT "card_references_set_ref_id_fkey" FOREIGN KEY ("set_ref_id") REFERENCES "set_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
