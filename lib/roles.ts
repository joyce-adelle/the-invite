// Who may do what. Three roles, stored in `users.role` by Better Auth's admin
// plugin (lib/auth.ts):
//   super_admin  made only by the seed (ADMIN_USERNAME). Everything an admin can
//                do, plus the event's table settings, host management, and
//                adding, disabling or resetting admins. Nobody can disable,
//                reset or demote a super admin from the app.
//   admin        runs the event: guests, cards, check-in, help requests and
//                check-in accounts
//   check_in     only the check-in pages: view a scanned guest and confirm entry
// A disabled account (`banned`) has no permissions at all, whatever its role.
// No Node or server imports here, so pages and components can share it.

export const ROLE = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  CHECK_IN: "check_in",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

/** The roles an account can be given in the app. A super admin is only ever made by the seed. */
export type CreatableRole = typeof ROLE.ADMIN | typeof ROLE.CHECK_IN;

/** The fields of a Better Auth user that decide access. */
export type AccessUser = { role?: string | null; banned?: boolean | null };

const isActive = (user: AccessUser) => user.banned !== true;

/** Can do everything, including host management and managing admins. */
export function isSuperAdmin(user: AccessUser): boolean {
  return isActive(user) && user.role === ROLE.SUPER_ADMIN;
}

/** Full event access: the dashboard, guests, emails, support, check-in accounts. Super admins too. */
export function isAdmin(user: AccessUser): boolean {
  return isActive(user) && (user.role === ROLE.ADMIN || user.role === ROLE.SUPER_ADMIN);
}

/** May open a scanned invitation and confirm a check-in. */
export function canCheckIn(user: AccessUser): boolean {
  return isAdmin(user) || (isActive(user) && user.role === ROLE.CHECK_IN);
}

/** Where a user goes after signing in, when nothing more specific was asked for. */
export function homeFor(user: AccessUser): string {
  return isAdmin(user) ? "/admin" : "/check-in";
}
