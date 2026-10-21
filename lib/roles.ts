// Who may do what. Two roles, stored in `users.role` by Better Auth's admin
// plugin (lib/auth.ts):
//   admin     everything, as before, including check-in
//   check_in  only the check-in pages: view a scanned guest and confirm entry
// A disabled account (`banned`) has no permissions at all, whatever its role.
// No Node or server imports here, so pages and components can share it.

export const ROLE = {
  ADMIN: "admin",
  CHECK_IN: "check_in",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

/** The fields of a Better Auth user that decide access. */
export type AccessUser = { role?: string | null; banned?: boolean | null };

const isActive = (user: AccessUser) => user.banned !== true;

/** Full access: the dashboard, guests, emails, support, check-in accounts. */
export function isAdmin(user: AccessUser): boolean {
  return isActive(user) && user.role === ROLE.ADMIN;
}

/** May open a scanned invitation and confirm a check-in. */
export function canCheckIn(user: AccessUser): boolean {
  return isActive(user) && (user.role === ROLE.ADMIN || user.role === ROLE.CHECK_IN);
}

/** Where a user goes after signing in, when nothing more specific was asked for. */
export function homeFor(user: AccessUser): string {
  return isAdmin(user) ? "/admin" : "/check-in";
}
