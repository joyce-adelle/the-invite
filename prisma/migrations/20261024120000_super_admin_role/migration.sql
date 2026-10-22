-- A third role: super_admin, the seed's admin (lib/roles.ts). Nobody is promoted
-- here, since the database doesn't know ADMIN_USERNAME: run the seed after
-- deploying (`npm run db:seed:admin`) to make that account a super admin.
ALTER TABLE "users" DROP CONSTRAINT "users_role_known";
ALTER TABLE "users" ADD CONSTRAINT "users_role_known" CHECK ("role" IN ('super_admin', 'admin', 'check_in'));
