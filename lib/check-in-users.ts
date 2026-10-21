import "server-only";

import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ROLE } from "@/lib/roles";
import type { NewAccountInput } from "@/lib/validation/account";

// Check-in accounts: made and managed by admins in the app, and stored by
// Better Auth like every other account (users + a credential account holding
// the password's hash). Every change goes through Better Auth's admin API with
// the acting admin's own request headers, so Better Auth checks their role too:
// a check-in account asking for any of this is refused there as well as here.
//
// Only accounts with the check_in role can be reached through these functions.
// Admin accounts are made by the seed alone and can't be changed from the app.

/** What an admin sees of a check-in account. Never a password or its hash. */
export type CheckInUser = {
  id: string;
  username: string;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CheckInUserErrorCode = "USERNAME_TAKEN" | "NOT_FOUND" | "FORBIDDEN";

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

function toCheckInUser(user: Prisma.UserGetPayload<{ select: typeof select }>): CheckInUser {
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
  const user = await prisma.user.findFirst({ where: { id, role: ROLE.CHECK_IN }, select });
  if (!user) throw new CheckInUserError("NOT_FOUND", "That check-in account could not be found.");
  return toCheckInUser(user);
}

/** Better Auth's refusals, in our terms. Anything unexpected is passed on. */
function translate(error: unknown): never {
  if (error instanceof APIError) {
    if (error.status === "FORBIDDEN" || error.status === "UNAUTHORIZED") {
      throw new CheckInUserError("FORBIDDEN", "Only an admin can manage check-in accounts.");
    }
    if (error.status === "NOT_FOUND") {
      throw new CheckInUserError("NOT_FOUND", "That check-in account could not be found.");
    }
    if (error.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      throw new CheckInUserError("USERNAME_TAKEN", "That username is already taken.");
    }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new CheckInUserError("USERNAME_TAKEN", "That username is already taken.");
  }
  throw error;
}

/**
 * Makes a check-in account. Usernames are unique across every account, admins
 * included, and compared without case. Better Auth needs an email address on
 * every account; this one is a placeholder nobody ever sees or sends to.
 */
export async function createCheckInUser(headers: Headers, input: NewAccountInput): Promise<CheckInUser> {
  const typed = input.username.trim();
  const username = typed.toLowerCase();

  if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
    throw new CheckInUserError("USERNAME_TAKEN", "That username is already taken.");
  }

  let id: string;
  try {
    const { user } = await auth.api.createUser({
      headers,
      body: {
        email: `${username}@check-in.invalid`,
        name: typed,
        password: input.password,
        role: ROLE.CHECK_IN,
        data: { username, displayUsername: typed },
      },
    });
    id = user.id;
  } catch (error) {
    translate(error);
  }
  return findCheckInUser(id);
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
      await auth.api.banUser({ headers, body: { userId: id, banReason: "Disabled by an admin" } });
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
export async function resetCheckInUserPassword(headers: Headers, id: string, password: string): Promise<CheckInUser> {
  await findCheckInUser(id);
  try {
    await auth.api.setUserPassword({ headers, body: { userId: id, newPassword: password } });
    await auth.api.revokeUserSessions({ headers, body: { userId: id } });
  } catch (error) {
    translate(error);
  }
  return findCheckInUser(id);
}
