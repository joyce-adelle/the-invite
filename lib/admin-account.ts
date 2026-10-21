import { hashPassword, verifyPassword } from "better-auth/crypto";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import { randomUUID } from "node:crypto";

// Making an admin account. Used by the seed (prisma/seed.ts), not by the app:
// there is no sign-up, so this is the only way an account comes to exist. It
// writes the rows Better Auth reads (a user, plus a credential account holding
// the password's scrypt hash, made with Better Auth's own hasher), so the
// account signs in like any other.

/** Better Auth's own default rules for a username, and the length we require of a password. */
export const MIN_PASSWORD_LENGTH = 8;
const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

export type AdminInput = {
  username: string;
  password: string;
  /** Better Auth needs an address on every user. Nothing is ever sent to it. */
  email?: string;
};

export type AdminResult = "created" | "password-changed" | "unchanged";

/**
 * Creates the admin, or makes sure the existing one has this password. Safe to
 * run again: nothing changes if it is all already as given, and when the
 * password differs the old one stops working and any signed-in sessions of
 * that admin end.
 */
export async function upsertAdmin(
  db: Pick<PrismaClient, "user" | "account" | "session" | "$transaction">,
  input: AdminInput,
): Promise<AdminResult> {
  const typed = input.username.trim();
  const username = typed.toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("The admin username must be 3 to 30 characters: letters, numbers, underscores or dots.");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The admin password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const email = (input.email?.trim() || `${username}@admin.invalid`).toLowerCase();

  const existing = await db.user.findUnique({
    where: { username },
    include: { accounts: { where: { providerId: "credential" } } },
  });

  if (!existing) {
    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) throw new Error(`Another account already uses the email ${email}.`);

    const id = randomUUID();
    await db.user.create({
      data: {
        id,
        name: typed,
        email,
        emailVerified: true,
        username,
        displayUsername: typed,
        accounts: {
          create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(input.password) },
        },
      },
    });
    return "created";
  }

  const credential = existing.accounts[0];
  if (credential?.password && (await verifyPassword({ hash: credential.password, password: input.password }))) {
    return "unchanged";
  }

  const hash = await hashPassword(input.password);
  await db.$transaction([
    credential
      ? db.account.update({ where: { id: credential.id }, data: { password: hash } })
      : db.account.create({
        data: { id: randomUUID(), accountId: existing.id, providerId: "credential", userId: existing.id, password: hash },
      }),
    db.session.deleteMany({ where: { userId: existing.id } }),
  ]);
  return "password-changed";
}
