import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { canCheckIn, isAdmin, isSuperAdmin } from "@/lib/roles";

// Server-side access checks. Every protected page, server action and route
// handler must call one of these itself: layouts don't re-run on client
// navigation. The session is looked up in the database on every request, and
// the role and disabled flag come from that row, never from the browser.

/** The signed-in user's session, whatever their role, or null. */
export const getCurrentSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** The session of an active admin, or null. A check-in account is not an admin. */
export const getAdminSession = cache(async () => {
  const session = await getCurrentSession();
  return session && isAdmin(session.user) ? session : null;
});

/** The session of an active super admin, or null. */
export const getSuperAdminSession = cache(async () => {
  const session = await getCurrentSession();
  return session && isSuperAdmin(session.user) ? session : null;
});

/** The session of anyone allowed to check guests in (an active admin or check-in account), or null. */
export const getCheckInSession = cache(async () => {
  const session = await getCurrentSession();
  return session && canCheckIn(session.user) ? session : null;
});

/**
 * For admin pages and server actions. A signed-out visitor goes to the login
 * page; a check-in account is sent to its own check-in page instead.
 */
export async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) redirect("/admin/login");
  if (!isAdmin(session.user)) redirect(canCheckIn(session.user) ? "/check-in" : "/admin/login");
  return session;
}

/** For the check-in pages: anyone who may check guests in, or off to sign in. */
export async function requireCheckIn() {
  const session = await getCheckInSession();
  if (!session) redirect("/admin/login");
  return session;
}

/**
 * For super-admin pages and server actions (host management, table settings,
 * managing admins). An ordinary admin is sent back to the dashboard; anyone
 * else is handled as requireAdmin() does.
 */
export async function requireSuperAdmin() {
  const session = await requireAdmin();
  if (!isSuperAdmin(session.user)) redirect("/admin");
  return session;
}
