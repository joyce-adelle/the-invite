import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

// Server-side admin checks. Every admin page, server action and route handler
// must call one of these itself: layouts don't re-run on client navigation and
// the proxy only does an optimistic redirect.

/**
 * The current admin session, or null. Every user is an admin (sign-up is
 * disabled), and the session is looked up in the database, so signing out or
 * deleting a user takes effect on their next request.
 */
export const getAdminSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** For pages and server actions: redirects to the login page when not signed in as an admin. */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}
