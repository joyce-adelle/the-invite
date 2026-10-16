import "server-only";

import { Resend } from "resend";

// Sends email through Resend. Configuration comes from the environment and is
// read when an email is sent, so the app builds and runs without it:
//   RESEND_API_KEY  the API key
//   EMAIL_FROM      the sender, e.g. "TheInvite <invites@your-domain.com>". The
//                   domain must be verified in Resend. Resend's test sender
//                   (onboarding@resend.dev) only delivers to your own account.

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
};

/** The part of the Resend client this app uses; tests supply their own. */
export type EmailClient = {
  emails: {
    send(
      payload: EmailMessage & { from: string },
      options: { idempotencyKey: string },
    ): Promise<{
      data: { id: string } | null;
      error: { message: string; statusCode: number | null; name: string } | null;
    }>;
  };
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];

let cached: { key: string; client: EmailClient } | undefined;

function defaultClient(): EmailClient {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set, so email can't be sent.");
  if (cached?.key !== key) cached = { key, client: new Resend(key) as unknown as EmailClient };
  return cached.client;
}

/**
 * Worth trying again: rate limited (429), a Resend server problem (5xx), no
 * response at all (null), or another request using the same idempotency key
 * still in progress (409). Anything else, such as an invalid address or an
 * unverified domain, would fail the same way again.
 */
function isRetryable(error: { statusCode: number | null; name: string }): boolean {
  return (
    error.statusCode === null ||
    error.statusCode === 429 ||
    error.statusCode >= 500 ||
    error.name === "concurrent_idempotent_requests"
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends one email and resolves with its Resend id, or throws. Failures that
 * might pass (see `isRetryable`) are retried a couple of times. Every attempt
 * carries the same idempotency key, so a retry can never deliver the email
 * twice. The key is new for each call, so deliberately sending the same
 * message again (an admin resending a card) still goes out.
 *
 * `idempotencyKey` should look like "<event-type>/<entity-id>"; a unique part
 * is added to it here.
 */
export async function sendEmail(
  message: EmailMessage,
  idempotencyKey: string,
  { client = defaultClient(), retryDelays = RETRY_DELAYS_MS }: { client?: EmailClient; retryDelays?: number[] } = {},
): Promise<{ id: string }> {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set, so email can't be sent.");

  const key = `${idempotencyKey}-${crypto.randomUUID()}`.slice(0, 256);
  let failure = "unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retryable = true;
    try {
      const { data, error } = await client.emails.send({ from, ...message }, { idempotencyKey: key });
      if (data) return { id: data.id };
      failure = error ? `${error.message} (${error.name})` : "no response";
      retryable = error ? isRetryable(error) : true;
    } catch (thrown) {
      // A network-level failure rather than an error response.
      failure = thrown instanceof Error ? thrown.message : String(thrown);
    }

    if (!retryable || attempt === MAX_ATTEMPTS) break;
    await wait(retryDelays[attempt - 1] ?? 0);
  }

  throw new Error(`Resend couldn't send the email: ${failure}`);
}
