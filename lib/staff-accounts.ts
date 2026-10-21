import "server-only";

import { APIError } from "better-auth/api";

import { defaultAdminUsername } from "@/lib/admin-account";
import { auth } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin, ROLE, type Role } from "@/lib/roles";
import { parseNewAccount, parsePassword, type NewAccountInput } from "@/lib/validation/account";

// Staff accounts, managed by admins in the app: admins and check-in accounts,
// stored by Better Auth like every other account (users + a credential account
// holding the password's hash). Admins can create either kind, and disable,
// re-enable or reset the password of any of them, with two exceptions:
//   - the default admin, the one ADMIN_USERNAME names (the seed's account),
//     so there is always an admin nobody can lock out from the app;
//   - their own account, so nobody disables or signs out themselves by mistake.
// Every change goes through Better Auth's admin API with the acting admin's own
// request headers, so Better Auth checks their role too: a check-in account
// asking for any of this is refused there as well as here.

/** What an admin sees of a staff account. Never a password or its hash. */
export type StaffAccount = {
  id: string;
  username: string;
  role: Role;
  disabled: boolean;
  /** The admin ADMIN_USERNAME names: listed, but never changeable from the app. */
  isDefaultAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type StaffAccountErrorCode = "USERNAME_TAKEN" | "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "PROTECTED";

export class StaffAccountError extends Error {
  name = "StaffAccountError";
  constructor(
    readonly code: StaffAccountErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const NOT_FOUND = "That account could not be found.";
const STAFF_ROLES = [ROLE.ADMIN, ROLE.CHECK_IN];

const select = {
  id: true,
  username: true,
  displayUsername: true,
  role: true,
  banned: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

function toStaffAccount(user: Prisma.UserGetPayload<{ select: typeof select }>): StaffAccount {
  const defaultAdmin = defaultAdminUsername();
  return {
    id: user.id,
    username: user.displayUsername ?? user.username ?? "",
    role: user.role as Role,
    disabled: user.banned,
    isDefaultAdmin: user.role === ROLE.ADMIN && defaultAdmin !== null && user.username === defaultAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Every account with this role. Admins oldest first; check-in accounts active first, then by username. */
export async function listStaffAccounts(role: Role): Promise<StaffAccount[]> {
  const users = await prisma.user.findMany({
    where: { role },
    select,
    orderBy:
      role === ROLE.ADMIN
        ? [{ createdAt: "asc" }, { username: "asc" }]
        : [{ banned: "asc" }, { username: "asc" }],
  });
  return users.map(toStaffAccount);
}

async function findStaffAccount(id: string): Promise<StaffAccount> {
  const user = await prisma.user.findFirst({ where: { id, role: { in: STAFF_ROLES } }, select });
  if (!user) throw new StaffAccountError("NOT_FOUND", NOT_FOUND);
  return toStaffAccount(user);
}

/**
 * The account an admin wants to change, once it's clear they may: it exists,
 * it isn't the default admin, and it isn't their own. The acting admin comes
 * from the request's verified session, not from anything the browser says.
 */
async function findManageable(headers: Headers, id: string): Promise<StaffAccount> {
  const session = await auth.api.getSession({ headers });
  if (!session || !isAdmin(session.user)) {
    throw new StaffAccountError("FORBIDDEN", "Only an admin can manage staff accounts.");
  }

  const account = await findStaffAccount(id);
  if (account.isDefaultAdmin) {
    throw new StaffAccountError(
      "PROTECTED",
      `"${account.username}" is the default admin from ADMIN_USERNAME, so it can't be changed here.`,
    );
  }
  if (account.id === session.user.id) {
    throw new StaffAccountError("PROTECTED", "You can't change your own account here.");
  }
  return account;
}

/** Better Auth's refusals, in our terms. Anything unexpected is passed on. */
function translate(error: unknown): never {
  // Better Auth throws more than one APIError class (its own and its router's),
  // so recognise them by shape rather than by class.
  if (error instanceof APIError || (error instanceof Error && error.name === "APIError")) {
    const api = error as APIError;
    if (api.status === "FORBIDDEN" || api.status === "UNAUTHORIZED") {
      throw new StaffAccountError("FORBIDDEN", "Only an admin can manage staff accounts.");
    }
    if (api.status === "NOT_FOUND") throw new StaffAccountError("NOT_FOUND", NOT_FOUND);
    if (api.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      throw new StaffAccountError("USERNAME_TAKEN", "That username is already taken.");
    }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new StaffAccountError("USERNAME_TAKEN", "That username is already taken.");
  }
  throw error;
}

/**
 * Makes an account with this role through Better Auth's admin API. Usernames
 * are unique across every account, whatever its role, and compared without
 * case. Better Auth needs an email address on every account; this one is a
 * placeholder nobody ever sees or sends to.
 */
export async function createStaffAccount(headers: Headers, input: NewAccountInput, role: Role): Promise<StaffAccount> {
  // Checked here as well as in the server action: Better Auth's createUser
  // doesn't apply the minimum password length itself.
  const parsed = parseNewAccount(input);
  if (!parsed.success) {
    throw new StaffAccountError(
      "INVALID",
      parsed.fieldErrors.username ?? parsed.fieldErrors.password ?? "Check the username and password.",
    );
  }
  const typed = parsed.data.username;
  const username = typed.toLowerCase();

  if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
    throw new StaffAccountError("USERNAME_TAKEN", "That username is already taken.");
  }

  let id: string;
  try {
    const { user } = await auth.api.createUser({
      headers,
      body: {
        email: `${username}@${role === ROLE.ADMIN ? "admin" : "check-in"}.invalid`,
        name: typed,
        password: parsed.data.password,
        // Better Auth only lets a caller who may set roles choose one: an admin, never a check-in account.
        role,
        data: { username, displayUsername: typed },
      },
    });
    id = user.id;
  } catch (error) {
    translate(error);
  }
  return findStaffAccount(id);
}

/**
 * Disables or re-enables an account. Disabling (Better Auth's "ban") stops it
 * signing in and deletes every session it has, so a phone or laptop that was
 * signed in can't do anything more. A disabled admin has no admin rights at
 * all (lib/roles.ts) until re-enabled.
 */
export async function setStaffAccountDisabled(headers: Headers, id: string, disabled: boolean): Promise<StaffAccount> {
  await findManageable(headers, id);
  try {
    if (disabled) {
      await auth.api.banUser({ headers, body: { userId: id, banReason: "Disabled by an admin" } });
    } else {
      await auth.api.unbanUser({ headers, body: { userId: id } });
    }
  } catch (error) {
    translate(error);
  }
  return findStaffAccount(id);
}

/** Gives an account a new password, and signs it out everywhere. */
export async function resetStaffAccountPassword(headers: Headers, id: string, password: string): Promise<StaffAccount> {
  const parsed = parsePassword(password);
  if (!parsed.success) throw new StaffAccountError("INVALID", parsed.error);
  await findManageable(headers, id);
  try {
    await auth.api.setUserPassword({ headers, body: { userId: id, newPassword: parsed.data } });
    await auth.api.revokeUserSessions({ headers, body: { userId: id } });
  } catch (error) {
    translate(error);
  }
  return findStaffAccount(id);
}
