import "server-only";
import { z } from "zod";

const schema = z.object({
  ADMIN_EMAILS: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email(),
  GOOGLE_PRIVATE_KEY: z.string().min(1),
  GOOGLE_SHEET_ID: z.string().min(1),
});

type Env = Omit<z.infer<typeof schema>, "ADMIN_EMAILS"> & {
  ADMIN_EMAILS: ReadonlySet<string>;
};

let cached: Env | undefined;

// Validated lazily so `next build` works without secrets; the first request
// that needs configuration fails loudly if anything is missing.
export function env(): Env {
  if (cached) return cached;

  const result = schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${missing}`);
  }

  const parsed = result.data;
  cached = {
    ...parsed,
    ADMIN_EMAILS: new Set(
      parsed.ADMIN_EMAILS.split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
    // .env files store the key with literal "\n" sequences.
    GOOGLE_PRIVATE_KEY: parsed.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
  return cached;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && env().ADMIN_EMAILS.has(email.trim().toLowerCase());
}
