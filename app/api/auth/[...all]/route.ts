import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

const handler = toNextJsHandler(auth);

// Only what the login page needs. Everything else Better Auth offers (sign-up,
// password change/reset, profile updates…) stays unreachable over HTTP.
const ALLOWED_PATHS = new Set(["/api/auth/sign-in/username", "/api/auth/sign-out"]);

export function POST(request: Request) {
  if (!ALLOWED_PATHS.has(new URL(request.url).pathname)) {
    return new Response(null, { status: 404 });
  }
  return handler.POST(request);
}
