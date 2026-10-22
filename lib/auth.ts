import "server-only";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/validation/account";
import { betterAuth } from "better-auth";
import { event } from "@/config/event";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import { ROLE } from "@/lib/roles";

// Sign-in with Better Auth: username and password, stored in Postgres through
// the Prisma adapter (users, sessions, accounts and verifications, see
// prisma/schema.prisma).
//
// Three roles (lib/roles.ts), kept by Better Auth's admin plugin in `users.role`:
//   super_admin  made only by the seed (prisma/seed.ts) from ADMIN_USERNAME /
//                ADMIN_PASSWORD; can do everything, and is never changeable
//                from the app
//   admin        made by a super admin in the app; runs the event
//   check_in     made by any admin in the app; can only check guests in
// Better Auth gives both admin roles its admin API (they manage check-in
// accounts through it); which accounts each may change is decided in
// lib/staff-accounts.ts.
// Sign-up is disabled. Sessions live in the database, so signing out, or an
// account being disabled (the plugin's "ban", which also deletes its
// sessions), ends them at once.

// What each role may do through Better Auth's own admin APIs. Both admin roles
// keep the plugin's full admin set; a check-in account gets none of it, so it can't
// create, list, disable or change any user, itself included.
const ac = createAccessControl(defaultStatements);
const roles = {
  [ROLE.SUPER_ADMIN]: ac.newRole(adminAc.statements),
  [ROLE.ADMIN]: ac.newRole(adminAc.statements),
  [ROLE.CHECK_IN]: ac.newRole({ user: [], session: [] }),
};

export const auth = betterAuth({
  appName: event.name,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
  },

  plugins: [
    username(),
    admin({
      ac,
      roles,
      adminRoles: [ROLE.SUPER_ADMIN, ROLE.ADMIN],
      // Least privilege: an account made without a role can only check in.
      defaultRole: ROLE.CHECK_IN,
      bannedUserMessage: "This account has been disabled. Please ask an event administrator.",
    }),
    // Must stay last so it can forward Set-Cookie headers from server actions.
    nextCookies(),
  ],
});
