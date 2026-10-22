// The default admin, from ADMIN_USERNAME / ADMIN_PASSWORD (and optionally
// ADMIN_EMAIL). Shared by both seeds (prisma/seed.ts, prisma/seed-prod.ts).
// Skipped when neither is set, so hosts can be seeded alone. Run it again with
// a new ADMIN_PASSWORD to change that admin's password, or to re-enable it.

import { upsertAdmin } from "../lib/admin-account";
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
  console.log(
    {
      created: `Created admin "${username}".`,
      "password-changed": `Changed the password of admin "${username}" (their sessions were ended).`,
      "re-enabled": `Re-enabled admin "${username}", which had been disabled.`,
      unchanged: `Admin "${username}" already exists with that password.`,
    }[result],
  );
}
