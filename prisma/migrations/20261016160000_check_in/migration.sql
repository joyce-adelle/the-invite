-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "check_in_token" TEXT,
ADD COLUMN     "checked_in_at" TIMESTAMPTZ(3),
ADD COLUMN     "checked_in_by" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "guests_check_in_token_key" ON "guests"("check_in_token");

-- CreateIndex
CREATE INDEX "guests_status_checked_in_at_idx" ON "guests"("status", "checked_in_at");

-- A check-in always records both when it happened and who did it, never one without the other.
ALTER TABLE "guests" ADD CONSTRAINT "guests_checked_in_together"
  CHECK (("checked_in_at" IS NULL) = ("checked_in_by" IS NULL));

-- Only a guest with a QR code can have been checked in, and the admin must be named.
ALTER TABLE "guests" ADD CONSTRAINT "guests_checked_in_valid"
  CHECK ("checked_in_at" IS NULL OR ("check_in_token" IS NOT NULL AND char_length("checked_in_by") > 0));
