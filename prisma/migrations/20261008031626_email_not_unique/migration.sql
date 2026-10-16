-- DropIndex
DROP INDEX "guests_email_key";

-- CreateIndex
CREATE INDEX "guests_email_idx" ON "guests"("email");
