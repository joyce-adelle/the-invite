import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/utils";

// Server-side admin checks. Every admin page, server action and route handler
// must call one of these itself: layouts don't re-run on client navigation and
// the proxy only does an optimistic redirect.

/**
 * The current admin session, or null. The session cookie is verified by Better
 * Auth, and the email must still be in ADMIN_EMAILS, so removing an admin
 * takes effect on their next request.
 */
export const getAdminSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session && isAdminEmail(session.user.email) ? session : null;
});

/** For pages and server actions: redirects to the login page when not signed in as an admin. */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}
