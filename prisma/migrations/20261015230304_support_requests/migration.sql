-- CreateEnum
CREATE TYPE "SupportIssueType" AS ENUM ('CARD_NOT_RECEIVED', 'UNABLE_TO_REGISTER', 'DETAILS_INCORRECT', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportRequestStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "invitation_support_requests" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "issue_type" "SupportIssueType" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportRequestStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitation_support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invitation_support_requests_status_created_at_idx" ON "invitation_support_requests"("status", "created_at");

-- Constraints Prisma's schema language can't express (kept in sync by hand).
-- Mirrors the limits in lib/validation/support.ts so nothing can bypass them.
ALTER TABLE "invitation_support_requests" ADD CONSTRAINT "support_name_length"
  CHECK (char_length("name") BETWEEN 1 AND 80);
ALTER TABLE "invitation_support_requests" ADD CONSTRAINT "support_email_length"
  CHECK (char_length("email") BETWEEN 3 AND 254);
ALTER TABLE "invitation_support_requests" ADD CONSTRAINT "support_message_length"
  CHECK (char_length("message") <= 2000);
