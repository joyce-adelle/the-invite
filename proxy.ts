import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/utils";

// Gives signed-out visitors a real redirect before anything renders. Stateless
// sessions are validated by decrypting the cookie, so this makes no database
// call. It's not the only gate: pages, actions and route handlers still call
// requireAdmin() / getAdminSession() themselves (lib/admin-session.ts).
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isAdminEmail(session.user.email)) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything under /admin except the login page.
  matcher: ["/admin", "/admin/((?!login).*)"],
};
