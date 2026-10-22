-- Whether a table's guests get printed (PHYSICAL) or emailed (DIGITAL) access
-- cards. Existing tables stay DIGITAL, so nothing changes until a table is
-- marked physical (prisma/seed-prod.ts, or an admin in the app).

-- CreateEnum
CREATE TYPE "AccessCardType" AS ENUM ('PHYSICAL', 'DIGITAL');

-- AlterTable
ALTER TABLE "tables" ADD COLUMN "card_type" "AccessCardType" NOT NULL DEFAULT 'DIGITAL';
