-- AlterTable
ALTER TABLE "set_references" DROP COLUMN "tcgdex_set_id",
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "ptcg_set_id" TEXT,
ADD COLUMN     "series" TEXT,
ADD COLUMN     "symbol_url" TEXT;

-- AlterTable
ALTER TABLE "slabs" ADD COLUMN     "card_type" TEXT,
ADD COLUMN     "dex_id" INTEGER,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "rarity" TEXT;

-- CreateTable
CREATE TABLE "slab_prices" (
    "slab_id" TEXT NOT NULL,
    "price_usd" DECIMAL(12,2),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slab_prices_pkey" PRIMARY KEY ("slab_id")
);

-- CreateTable
CREATE TABLE "card_references" (
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

-- CreateTable
CREATE TABLE "beta_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beta_signups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_references_ptcg_card_id_key" ON "card_references"("ptcg_card_id");

-- CreateIndex
CREATE INDEX "card_references_card_name_idx" ON "card_references"("card_name");

-- CreateIndex
CREATE INDEX "card_references_card_number_idx" ON "card_references"("card_number");

-- CreateIndex
CREATE INDEX "card_references_set_name_idx" ON "card_references"("set_name");

-- CreateIndex
CREATE INDEX "card_references_card_name_card_number_idx" ON "card_references"("card_name", "card_number");

-- CreateIndex
CREATE UNIQUE INDEX "beta_signups_email_key" ON "beta_signups"("email");

-- CreateIndex
CREATE UNIQUE INDEX "set_references_ptcg_set_id_key" ON "set_references"("ptcg_set_id");

-- AddForeignKey
ALTER TABLE "slab_prices" ADD CONSTRAINT "slab_prices_slab_id_fkey" FOREIGN KEY ("slab_id") REFERENCES "slabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_references" ADD CONSTRAINT "card_references_set_ref_id_fkey" FOREIGN KEY ("set_ref_id") REFERENCES "set_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;

