// The super admin, from ADMIN_USERNAME / ADMIN_PASSWORD (and optionally
// ADMIN_EMAIL). Shared by both seeds (prisma/seed.ts, prisma/seed-prod.ts).
// Skipped when neither is set, so hosts can be seeded alone. Run it again with
// a new ADMIN_PASSWORD to change that account's password. It also makes an
// existing ordinary admin with that username a super admin, and re-enables it.
//
// Run on its own with `npm run db:seed:admin`.

import { upsertAdmin, type AdminChange } from "../lib/admin-account";
import { prisma } from "../lib/prisma";

export async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username && !password) {
    console.log("No ADMIN_USERNAME / ADMIN_PASSWORD set: no admin account made or changed.");
    return;
  }
  if (!username || !password) {
    throw new Error("Set both ADMIN_USERNAME and ADMIN_PASSWORD to seed an admin, or neither.");
  }
  const result = await upsertAdmin(prisma, { username, password, email: process.env.ADMIN_EMAIL });
  if (result === "unchanged") {
    console.log(`Super admin "${username}" already exists with that password.`);
    return;
  }
  const said: Record<AdminChange, string> = {
    created: `Created super admin "${username}".`,
    promoted: `Made admin "${username}" a super admin.`,
    "re-enabled": `Re-enabled "${username}", which had been disabled.`,
    "password-changed": `Changed the password of "${username}" (their sessions were ended).`,
  };
  for (const change of result) console.log(said[change]);
}

// `npm run db:seed:admin`: only the super admin, without touching hosts or tables.
if (process.argv[1]?.endsWith("seed-admin.ts")) {
  seedAdmin()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
