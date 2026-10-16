-- CreateEnum
CREATE TYPE "GuestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invited_by" TEXT NOT NULL,
    "status" "GuestStatus" NOT NULL DEFAULT 'PENDING',
    "table_number" INTEGER,
    "card_status" "CardStatus" NOT NULL DEFAULT 'NOT_SENT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(3),
    "card_sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guests_email_key" ON "guests"("email");

-- CreateIndex
CREATE INDEX "guests_invited_by_status_idx" ON "guests"("invited_by", "status");

-- CreateIndex
CREATE INDEX "guests_status_table_number_idx" ON "guests"("status", "table_number");

-- Constraints Prisma's schema language can't express (kept in sync by hand).
-- Emails are stored normalized, so the unique index above covers case and
-- whitespace variants of the same address.
ALTER TABLE "guests" ADD CONSTRAINT "guests_email_normalized"
  CHECK ("email" = lower(btrim("email")) AND "email" <> '');

-- An approved guest always has a seat; table numbers start at 1.
ALTER TABLE "guests" ADD CONSTRAINT "guests_approved_has_table"
  CHECK ("status" <> 'APPROVED' OR "table_number" IS NOT NULL);
ALTER TABLE "guests" ADD CONSTRAINT "guests_table_number_positive"
  CHECK ("table_number" > 0);
