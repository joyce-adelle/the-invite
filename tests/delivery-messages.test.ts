import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deliveryMessage, resendMessage } from "@/lib/delivery-messages";

const guest = { name: "Ada Lovelace", email: "ada@example.com" };
const failed = { status: "FAILED", reason: "The domain is not verified (invalid_from_address)" } as const;

describe("what an admin reads after a card email", () => {
  it("confirms who the card was emailed to when it worked", () => {
    assert.equal(
      deliveryMessage("Ada approved and seated at table 4", { status: "SENT" }, guest.email),
      "Ada approved and seated at table 4. Access card emailed to ada@example.com.",
    );
    assert.deepEqual(resendMessage(guest, { status: "SENT" }), {
      ok: true,
      message: "Access card emailed to ada@example.com.",
    });
  });

  it("after an approval whose email failed: still approved, with the reason and how to retry, shown as a warning", () => {
    const result = deliveryMessage("Ada approved and seated at table 4", failed, guest.email);
    assert.ok(typeof result === "object" && result.notice, "a notice (warning), not a success");
    assert.match(result.message, /^Ada approved and seated at table 4, but the access card could not be emailed/);
    assert.match(result.message, /The domain is not verified \(invalid_from_address\)/, "the reason");
    assert.match(result.message, /marked failed/);
    assert.match(result.message, /Resend access card/, "how to try again");
  });

  it("after a resend that failed: a plain error with the reason, naming the guest", () => {
    const result = resendMessage(guest, failed);
    assert.equal(result.ok, false);
    assert.match(result.message, /The access card for Ada Lovelace could not be emailed/);
    assert.match(result.message, /The domain is not verified/);
    assert.match(result.message, /marked failed/);
    assert.match(result.message, /try again/);
  });

  it("never claims the email went out when it didn't", () => {
    for (const result of [deliveryMessage("x", failed, guest.email), resendMessage(guest, failed).message]) {
      const text = typeof result === "string" ? result : result.message;
      assert.doesNotMatch(text, /emailed to/);
      assert.doesNotMatch(text, /sent to/i);
    }
  });
});
