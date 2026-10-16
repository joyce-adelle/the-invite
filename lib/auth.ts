import "server-only";

import { createHash, createHmac } from "node:crypto";

import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { event } from "@/config/event";
import { getAdminEmails } from "@/lib/utils";
import { nextCookies } from "better-auth/next-js";

// Admin login with Better Auth, email + one shared password.
//
// No `database` is configured, so Better Auth runs statelessly: the session
// lives in an encrypted, signed cookie and nothing is written to Postgres.
// In that mode its user and credential records sit in a per-process memory
// store. We fill that store from the environment on the first sign-in:
//   - one user per address in ADMIN_EMAILS,
//   - each with a credential account whose password is ADMIN_PASSWORD_HASH.
// Better Auth's own email/password flow then does the verification, so nobody
// else can sign in. Changing ADMIN_EMAILS or ADMIN_PASSWORD_HASH only needs a
// restart; no account is edited by hand.
//
// Generate a hash with `npm run auth:hash-password`.

/** Sessions can't be revoked server-side when stateless, so keep them short. */
const SESSION_SECONDS = 60 * 60 * 12;

function getPasswordHash(): string {
  return process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";
}

type AuthContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]["context"];

let provisionedFor = "";
let queue: Promise<void> = Promise.resolve();

/** Serialised so two first sign-ins can't both create the same user. */
function provisionAdmins(context: AuthContext): Promise<void> {
  const run = queue.then(() => syncAdmins(context));
  queue = run.catch(() => undefined);
  return run;
}

async function syncAdmins({ internalAdapter }: AuthContext): Promise<void> {
  const hash = getPasswordHash();
  if (!hash) console.error("ADMIN_PASSWORD_HASH is not set: admin sign-in is disabled.");

  // Without a hash nobody is provisioned, so sign-in fails closed.
  const emails = hash ? getAdminEmails() : [];
  const signature = createHash("sha256").update(`${emails.join(",")}\n${hash}`).digest("hex");
  if (signature === provisionedFor) return;

  for (const email of emails) {
    const existing = await internalAdapter.findUserByEmail(email, { includeAccounts: true });
    const user =
      existing?.user ??
      (await internalAdapter.createUser(
        { email, name: email, emailVerified: true },
        { method: "admin" },
      ));
    const credential = existing?.accounts.find((account) => account.providerId === "credential");

    if (!credential) {
      await internalAdapter.linkAccount({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hash,
      });
    } else if (credential.password !== hash) {
      await internalAdapter.updatePassword(user.id, hash);
    }
  }

  // Drop anyone who is no longer on the list.
  for (const user of await internalAdapter.listUsers()) {
    if (!emails.includes(user.email)) await internalAdapter.deleteUser(user.id);
  }

  provisionedFor = signature;
}

/**
 * Tied to the password hash, so rotating ADMIN_PASSWORD_HASH invalidates every
 * existing session cookie. Derived with a keyed hash so the cookie never
 * carries anything usable to recover the hash.
 */
function sessionVersion(): string {
  const key = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", key).update(getPasswordHash()).digest("hex").slice(0, 16);
}

export const auth = betterAuth({
  appName: event.name,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  session: {
    expiresIn: SESSION_SECONDS,
    cookieCache: { version: sessionVersion },
  },
  // Counted per IP (x-forwarded-for) in this instance's memory.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: { "/sign-in/email": { window: 60, max: 5 } },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") await provisionAdmins(ctx.context);
    }),
  },
  // Must stay last so it can forward Set-Cookie headers from server actions.
  plugins: [nextCookies()],
});
