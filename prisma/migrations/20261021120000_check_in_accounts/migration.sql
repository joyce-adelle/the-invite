-- Roles and disabled accounts, for Better Auth's admin plugin (lib/auth.ts).
--
-- Every account that exists today is an admin (only the seed made them), so they
-- become "admin". The column's default is then "check_in", the least privilege,
-- for any account made from now on without an explicit role.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'check_in';
ALTER TABLE "users" ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ban_reason" TEXT,
ADD COLUMN "ban_expires" TIMESTAMPTZ(3);

-- Only the two roles the app knows (lib/roles.ts). A typo or a forged value can't
-- create a third kind of account.
ALTER TABLE "users" ADD CONSTRAINT "users_role_known" CHECK ("role" IN ('admin', 'check_in'));

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "impersonated_by" TEXT;
