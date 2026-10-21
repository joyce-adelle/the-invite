import "server-only";

import { MIN_PASSWORD_LENGTH } from "@/lib/admin-account";
import { betterAuth } from "better-auth";
import { event } from "@/config/event";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";

// Admin sign-in with Better Auth: username and password, stored in Postgres
// through the Prisma adapter (users, sessions, accounts and verifications,
// see prisma/schema.prisma).
//
// Every user is an admin. Sign-up is disabled, so accounts are only made by
// the seed (prisma/seed.ts) from ADMIN_USERNAME / ADMIN_PASSWORD. Sessions
// live in the database, so signing out, or deleting a user, ends them at once.

export const auth = betterAuth({
  appName: event.name,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },

  plugins: [username(), nextCookies()],
});
