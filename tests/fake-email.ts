import type { EmailClient } from "@/lib/email";

type Reply = Awaited<ReturnType<EmailClient["emails"]["send"]>> | Error;

export const accepted = (id = "email-id-1"): Reply => ({ data: { id }, error: null });
export const rejected = (statusCode: number | null, name: string, message = "nope"): Reply => ({
  data: null,
  error: { message, statusCode, name },
});

/**
 * A stand-in for the Resend client. It answers with the given replies in order
 * (then "accepted"), and records every call so tests can inspect what would
 * have been sent. Nothing ever leaves the machine.
 */
export function fakeEmailClient(...replies: Reply[]) {
  const calls: { payload: Parameters<EmailClient["emails"]["send"]>[0]; options: { idempotencyKey: string } }[] = [];
  const queue = [...replies];
  const client: EmailClient = {
    emails: {
      async send(payload, options) {
        calls.push({ payload, options });
        const reply = queue.shift() ?? accepted();
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
  };
  return { client, calls };
}
