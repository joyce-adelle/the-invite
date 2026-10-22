import { hashPassword, verifyPassword } from "better-auth/crypto";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import { ROLE } from "@/lib/roles";
import { MIN_PASSWORD_LENGTH, usernameSchema } from "@/lib/validation/account";
import { randomUUID } from "node:crypto";

// Making the super admin account. Used by the seed (prisma/seed.ts), not by the app:
// there is no sign-up, and admins can only make check-in accounts in the app
// (lib/staff-accounts.ts), so this is how the first admin, the default one, comes to exist. It
// writes the rows Better Auth reads (a user, plus a credential account holding
// the password's scrypt hash, made with Better Auth's own hasher), so the
// account signs in like any other.

export { MIN_PASSWORD_LENGTH };

export type AdminInput = {
  username: string;
  password: string;
  /** Better Auth needs an address on every user. Nothing is ever sent to it. */
  email?: string;
};

/**
 * What the seed did. When more than one thing changed (say, promoted and given
 * a new password), each is listed.
 */
export type AdminChange = "created" | "promoted" | "re-enabled" | "password-changed";
export type AdminResult = AdminChange[] | "unchanged";

/**
 * Creates the super admin, or makes sure the existing account is one, is
 * enabled and has this password. Safe to run again: nothing changes if it is
 * all already as given. An ordinary admin with this username is promoted. When
 * the password differs the old one stops working and any signed-in sessions of
 * that account end. Other super admins are left as they are: there can be more
 * than one.
 */
export async function upsertAdmin(
  db: Pick<PrismaClient, "user" | "account" | "session" | "$transaction">,
  input: AdminInput,
): Promise<AdminResult> {
  const typed = input.username.trim();
  const username = typed.toLowerCase();
  if (!usernameSchema.safeParse(typed).success) {
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
        role: ROLE.SUPER_ADMIN,
        accounts: {
          create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(input.password) },
        },
      },
    });
    return ["created"];
  }

  // A check-in account with this username is not quietly made an admin.
  if (existing.role === ROLE.CHECK_IN) {
    throw new Error(`"${username}" is already a check-in account. Choose another ADMIN_USERNAME.`);
  }

  const changes: AdminChange[] = [];
  // A super admin can't be changed from the app, so the seed is how one is
  // made from an ordinary admin, and how one comes back if it was ever disabled
  // (say, as an ordinary admin, before ADMIN_USERNAME pointed at it).
  if (existing.role !== ROLE.SUPER_ADMIN || existing.banned) {
    await db.user.update({
      where: { id: existing.id },
      data: { role: ROLE.SUPER_ADMIN, banned: false, banReason: null, banExpires: null },
    });
    if (existing.role !== ROLE.SUPER_ADMIN) changes.push("promoted");
    if (existing.banned) changes.push("re-enabled");
  }

  const credential = existing.accounts[0];
  if (credential?.password && (await verifyPassword({ hash: credential.password, password: input.password }))) {
    return changes.length > 0 ? changes : "unchanged";
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
  return [...changes, "password-changed"];
}
