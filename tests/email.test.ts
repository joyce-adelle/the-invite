import "./no-email"; // first: nothing here may send real email
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { sendEmail, type EmailMessage } from "@/lib/email";
import { accepted, fakeEmailClient, rejected } from "./fake-email";

const message: EmailMessage = {
  to: "ada@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
  attachments: [{ filename: "card.pdf", content: Buffer.from("%PDF-test") }],
};
const NO_WAIT = { retryDelays: [0, 0] };

describe("sendEmail", () => {
  const original = { from: process.env.EMAIL_FROM, key: process.env.RESEND_API_KEY };
  beforeEach(() => {
    process.env.EMAIL_FROM = "TheInvite <invites@example.com>";
  });
  afterEach(() => {
    if (original.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = original.from;
    process.env.RESEND_API_KEY = original.key ?? "";
  });

  it("sends from the configured sender and returns Resend's id", async () => {
    const { client, calls } = fakeEmailClient(accepted("abc-123"));
    const result = await sendEmail(message, "access-card-approved/guest-1", { client });

    assert.deepEqual(result, { id: "abc-123" });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].payload, { from: "TheInvite <invites@example.com>", ...message });
  });

  it("sends an idempotency key shaped <event>/<entity>, new for every call", async () => {
    const { client, calls } = fakeEmailClient();
    await sendEmail(message, "access-card-approved/guest-1", { client });
    await sendEmail(message, "access-card-approved/guest-1", { client });

    const [first, second] = calls.map((c) => c.options.idempotencyKey);
    assert.match(first, /^access-card-approved\/guest-1-[0-9a-f-]{36}$/);
    assert.notEqual(first, second, "a deliberate resend must not be swallowed as a duplicate");
  });

  it("keeps the idempotency key within Resend's 256 character limit", async () => {
    const { client, calls } = fakeEmailClient();
    await sendEmail(message, `event/${"x".repeat(400)}`, { client });
    assert.ok(calls[0].options.idempotencyKey.length <= 256);
  });

  describe("retrying", () => {
    it("retries when rate limited, using the same idempotency key so it can't send twice", async () => {
      const { client, calls } = fakeEmailClient(rejected(429, "rate_limit_exceeded"), accepted("after-retry"));
      const result = await sendEmail(message, "e/1", { client, ...NO_WAIT });

      assert.deepEqual(result, { id: "after-retry" });
      assert.equal(calls.length, 2);
      assert.equal(calls[0].options.idempotencyKey, calls[1].options.idempotencyKey);
    });

    it("retries Resend server errors and requests with no response", async () => {
      const server = fakeEmailClient(rejected(500, "internal_server_error"), accepted());
      await sendEmail(message, "e/1", { client: server.client, ...NO_WAIT });
      assert.equal(server.calls.length, 2);

      const none = fakeEmailClient(rejected(null, "application_error"), accepted());
      await sendEmail(message, "e/1", { client: none.client, ...NO_WAIT });
      assert.equal(none.calls.length, 2);
    });

    it("retries a network failure that throws", async () => {
      const { client, calls } = fakeEmailClient(new Error("fetch failed"), accepted());
      await sendEmail(message, "e/1", { client, ...NO_WAIT });
      assert.equal(calls.length, 2);
      assert.equal(calls[0].options.idempotencyKey, calls[1].options.idempotencyKey);
    });

    it("gives up after three attempts and says what Resend said", async () => {
      const failure = rejected(429, "rate_limit_exceeded", "Too many requests");
      const { client, calls } = fakeEmailClient(failure, failure, failure, accepted());
      await assert.rejects(sendEmail(message, "e/1", { client, ...NO_WAIT }), /Too many requests \(rate_limit_exceeded\)/);
      assert.equal(calls.length, 3);
    });

    it("does not retry an error that would fail again, such as an invalid address or unverified domain", async () => {
      for (const [status, name] of [[422, "validation_error"], [403, "invalid_from_address"], [400, "invalid_idempotent_request"]] as const) {
        const { client, calls } = fakeEmailClient(rejected(status, name, "bad request"), accepted());
        await assert.rejects(sendEmail(message, "e/1", { client, ...NO_WAIT }), /bad request/);
        assert.equal(calls.length, 1, `${status} ${name}`);
      }
    });

    it("waits between attempts", async () => {
      const { client } = fakeEmailClient(rejected(429, "rate_limit_exceeded"), accepted());
      const started = Date.now();
      await sendEmail(message, "e/1", { client, retryDelays: [120] });
      assert.ok(Date.now() - started >= 100);
    });
  });

  describe("configuration", () => {
    it("fails before contacting Resend when the sender isn't configured", async () => {
      delete process.env.EMAIL_FROM;
      const { client, calls } = fakeEmailClient();
      await assert.rejects(sendEmail(message, "e/1", { client }), /EMAIL_FROM is not set/);
      assert.equal(calls.length, 0);
    });

    it("fails, without any network request, when the API key isn't configured", async () => {
      process.env.RESEND_API_KEY = "";
      await assert.rejects(sendEmail(message, "e/1"), /RESEND_API_KEY is not set/);
    });
  });
});
