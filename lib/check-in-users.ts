import "server-only";

import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ROLE, type Role } from "@/lib/roles";
import { parseNewAccount, parsePassword, type NewAccountInput } from "@/lib/validation/account";

// Staff accounts made by admins in the app: check-in accounts, which admins
// can also disable, re-enable and give new passwords, and other admins, which
// can only be created here. Check-in accounts are and stored by
// Better Auth like every other account (users + a credential account holding
// the password's hash). Every change goes through Better Auth's admin API with
// the acting admin's own request headers, so Better Auth checks their role too:
// a check-in account asking for any of this is refused there as well as here.
//
// Only check-in accounts can be disabled or have their password reset through
// these functions; an admin, once made, can't be changed from the app.

/** What an admin sees of a check-in account. Never a password or its hash. */
export type CheckInUser = {
  id: string;
  username: string;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CheckInUserErrorCode = "USERNAME_TAKEN" | "NOT_FOUND" | "FORBIDDEN" | "INVALID";

export class CheckInUserError extends Error {
  name = "CheckInUserError";
  constructor(
    readonly code: CheckInUserErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const select = {
  id: true,
  username: true,
  displayUsername: true,
  banned: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

function toCheckInUser(
  user: Prisma.UserGetPayload<{ select: typeof select }>,
): CheckInUser {
  return {
    id: user.id,
    username: user.displayUsername ?? user.username ?? "",
    disabled: user.banned,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Every check-in account, active ones first, then by username. */
export async function listCheckInUsers(): Promise<CheckInUser[]> {
  const users = await prisma.user.findMany({
    where: { role: ROLE.CHECK_IN },
    select,
    orderBy: [{ banned: "asc" }, { username: "asc" }],
  });
  return users.map(toCheckInUser);
}

/** The check-in account with this id. An admin account, or no account, is "not found". */
async function findCheckInUser(id: string): Promise<CheckInUser> {
  const user = await prisma.user.findFirst({
    where: { id, role: ROLE.CHECK_IN },
    select,
  });
  if (!user)
    throw new CheckInUserError(
      "NOT_FOUND",
      "That check-in account could not be found.",
    );
  return toCheckInUser(user);
}

/** Better Auth's refusals, in our terms. Anything unexpected is passed on. */
function translate(error: unknown): never {
  // Better Auth throws more than one APIError class (its own and its router's),
  // so recognise them by shape rather than by class.
  if (error instanceof APIError || (error instanceof Error && error.name === "APIError")) {
    const api = error as APIError;
    if (api.status === "FORBIDDEN" || api.status === "UNAUTHORIZED") {
      throw new CheckInUserError(
        "FORBIDDEN",
        "Only an admin can manage check-in accounts.",
      );
    }
    if (api.status === "NOT_FOUND") {
      throw new CheckInUserError(
        "NOT_FOUND",
        "That check-in account could not be found.",
      );
    }
    if (api.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      throw new CheckInUserError(
        "USERNAME_TAKEN",
        "That username is already taken.",
      );
    }
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new CheckInUserError(
      "USERNAME_TAKEN",
      "That username is already taken.",
    );
  }
  throw error;
}

/**
 * Makes an account with this role through Better Auth's admin API. Usernames
 * are unique across every account, whatever its role, and compared without
 * case. Better Auth needs an email address on every account; this one is a
 * placeholder nobody ever sees or sends to. Returns the new user's id.
 */
async function createAccount(
  headers: Headers,
  input: NewAccountInput,
  role: Role,
): Promise<string> {
  // Checked here as well as in the server action: Better Auth's createUser
  // doesn't apply the minimum password length itself.
  const parsed = parseNewAccount(input);
  if (!parsed.success) {
    throw new CheckInUserError(
      "INVALID",
      parsed.fieldErrors.username ?? parsed.fieldErrors.password ?? "Check the username and password.",
    );
  }
  const typed = parsed.data.username;
  const username = typed.toLowerCase();

  if (
    await prisma.user.findUnique({ where: { username }, select: { id: true } })
  ) {
    throw new CheckInUserError(
      "USERNAME_TAKEN",
      "That username is already taken.",
    );
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
  return id;
}

/** Makes a check-in account: it can only check guests in. */
export async function createCheckInUser(
  headers: Headers,
  input: NewAccountInput,
): Promise<CheckInUser> {
  return findCheckInUser(await createAccount(headers, input, ROLE.CHECK_IN));
}

/** What an admin sees of another admin. Never a password or its hash. */
export type AdminUser = { id: string; username: string; createdAt: Date };

/**
 * Makes another admin, with every right the acting admin has, including making
 * more admins. Admins are listed but can't be disabled or changed from the app.
 */
export async function createAdminUser(
  headers: Headers,
  input: NewAccountInput,
): Promise<AdminUser> {
  const id = await createAccount(headers, input, ROLE.ADMIN);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      username: true,
      displayUsername: true,
      createdAt: true,
    },
  });
  return {
    id: user.id,
    username: user.displayUsername ?? user.username ?? "",
    createdAt: user.createdAt,
  };
}

/** Every admin, oldest first. */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const users = await prisma.user.findMany({
    where: { role: ROLE.ADMIN },
    select: {
      id: true,
      username: true,
      displayUsername: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { username: "asc" }],
  });
  return users.map((user) => ({
    id: user.id,
    username: user.displayUsername ?? user.username ?? "",
    createdAt: user.createdAt,
  }));
}

/**
 * Disables or re-enables a check-in account. Disabling (Better Auth's "ban")
 * stops it signing in and deletes every session it has, so a phone that was
 * signed in can't check anyone else in.
 */
export async function setCheckInUserDisabled(
  headers: Headers,
  id: string,
  disabled: boolean,
): Promise<CheckInUser> {
  await findCheckInUser(id);
  try {
    if (disabled) {
      await auth.api.banUser({
        headers,
        body: { userId: id, banReason: "Disabled by an admin" },
      });
    } else {
      await auth.api.unbanUser({ headers, body: { userId: id } });
    }
  } catch (error) {
    translate(error);
  }
  return findCheckInUser(id);
}

/**
 * Gives a check-in account a new password. Its sessions are ended too, so
 * whoever had the old password is signed out everywhere.
 */
export async function resetCheckInUserPassword(
  headers: Headers,
  id: string,
  password: string,
): Promise<CheckInUser> {
  const parsed = parsePassword(password);
  if (!parsed.success) throw new CheckInUserError("INVALID", parsed.error);
  await findCheckInUser(id);
  try {
    await auth.api.setUserPassword({
      headers,
      body: { userId: id, newPassword: parsed.data },
    });
    await auth.api.revokeUserSessions({ headers, body: { userId: id } });
  } catch (error) {
    translate(error);
  }
  return findCheckInUser(id);
}
