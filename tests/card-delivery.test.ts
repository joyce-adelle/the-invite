import "./no-email"; // first: nothing here may send real email
import "dotenv/config";

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import { sendAccessCard } from "@/lib/access-card";
import { cancelGuest, createGuest, getGuest, rejectGuest, updateGuestTable } from "@/lib/data/guests";
import { approveInvitation, moveInvitationTable, resendAccessCard } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";
import type { Guest } from "@/types/guest";
import { accepted, fakeEmailClient, rejected } from "./fake-email";
import { readCard } from "./pdf-helpers";

// The whole delivery story, through the real flows and the real card
// generator, with only the mail client replaced: the first send, a failed
// send, a resend, and a resend after the table has changed. The attached PDF
// is read back to check what it actually says.
//
// These make their own host and tables (ids starting "test-", table numbers
// 9201+) and remove them again, so they only run against a local database.
const url = process.env.DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const HOST_ID = "test-delivery";
const HOST_NAME = "Delivery Family";

let counter = 0;
const newGuest = () => {
  counter += 1;
  return createGuest({
    name: `Zzdelivery Guest ${counter}`,
    email: `delivery${counter}@delivery-test.invalid`,
    invitedBy: HOST_ID,
  });
};
const fresh = async (id: string) => (await getGuest(id))!;

type Mailer = ReturnType<typeof fakeEmailClient>;

/** The sender the app uses, with the mail client replaced. */
const via = (mailer: Mailer) => (guest: Guest) => sendAccessCard(guest, { client: mailer.client });

/** What the attached PDF says (page 2's table) and how many pages it has. */
async function attachedCard(mailer: Mailer, call = mailer.calls.length - 1) {
  const [attachment] = mailer.calls[call].payload.attachments!;
  const { doc, drawn } = await readCard(new Uint8Array(attachment.content));
  return { pages: doc.getPageCount(), table: drawn.find((d) => d.text.startsWith("TABLE"))?.text };
}

describe("access card delivery", { skip: !isLocal && "DATABASE_URL is not a local database" }, () => {
  const removeFixtures = async () => {
    await prisma.guest.deleteMany({ where: { invitedBy: HOST_ID } });
    await prisma.table.deleteMany({ where: { hostId: HOST_ID } });
    await prisma.host.deleteMany({ where: { id: HOST_ID } });
  };

  before(async () => {
    await removeFixtures();
    await prisma.host.create({
      data: {
        id: HOST_ID,
        name: HOST_NAME,
        capacity: 6,
        tables: { create: [9201, 9202, 9203].map((number) => ({ number, capacity: 2 })) },
      },
    });
  });
  beforeEach(() => {
    process.env.EMAIL_FROM = "TheInvite <invites@example.com>";
    mock.method(console, "error", () => {});
    mock.method(console, "info", () => {});
  });
  afterEach(async () => {
    mock.restoreAll();
    await prisma.guest.deleteMany({ where: { invitedBy: HOST_ID } });
  });
  after(async () => {
    await removeFixtures();
    await prisma.$disconnect();
  });

  describe("the first send, when a guest is approved", () => {
    it("emails the card to the guest's own address and records it as SENT", async () => {
      const guest = await newGuest();
      const mailer = fakeEmailClient(accepted("mail-1"));
      const before = Date.now();

      const result = await approveInvitation(guest.id, via(mailer));

      assert.deepEqual(result.delivery, { status: "SENT" });
      const stored = await fresh(guest.id);
      assert.equal(stored.status, "APPROVED");
      assert.equal(stored.cardStatus, "SENT");
      assert.ok(stored.cardSentAt && stored.cardSentAt.getTime() >= before - 1000 && stored.cardSentAt.getTime() <= Date.now());

      assert.equal(mailer.calls.length, 1, "exactly one email");
      assert.equal(mailer.calls[0].payload.to, guest.email);
    });

    it("attaches a two-page card for the table they were seated at, and says so in the email", async () => {
      const guest = await newGuest();
      const mailer = fakeEmailClient();
      await approveInvitation(guest.id, via(mailer));

      assert.deepEqual(await attachedCard(mailer), { pages: 2, table: "TABLE 9201" });
      const { text, html } = mailer.calls[0].payload;
      for (const body of [text, html]) {
        assert.match(body, /Dear Zzdelivery Guest/);
        assert.match(body, new RegExp(HOST_NAME));
        assert.match(body, /Table 9201/);
      }
    });

    it("only sends once the guest really is approved, and leaves the card unsent until it has gone", async () => {
      const guest = await newGuest();
      let during: Guest | undefined;
      const sender = async (g: Guest) => {
        during = await fresh(g.id);
        return { id: "x" };
      };
      await approveInvitation(guest.id, sender);
      assert.equal(during?.status, "APPROVED");
      assert.equal(during?.cardStatus, "NOT_SENT");
      assert.equal(during?.cardSentAt, null);
    });

    it("sends nothing for a pending, rejected or cancelled guest", async () => {
      const mailer = fakeEmailClient();
      const send = via(mailer);

      const pending = await newGuest();
      const toReject = await newGuest();
      await rejectGuest(toReject.id);
      const toCancel = await newGuest();
      await approveInvitation(toCancel.id, async () => ({ id: "x" }));
      await cancelGuest(toCancel.id);

      for (const guest of [pending, await fresh(toReject.id), await fresh(toCancel.id)]) {
        await assert.rejects(send(guest), /isn't approved/);
        await assert.rejects(resendAccessCard(guest.id, send));
      }
      assert.equal(mailer.calls.length, 0);
    });
  });

  describe("a failed send", () => {
    it("keeps the guest APPROVED, marks the card FAILED, never stamps cardSentAt, and says why", async () => {
      const guest = await newGuest();
      const mailer = fakeEmailClient(rejected(403, "invalid_from_address", "The domain is not verified"));

      const result = await approveInvitation(guest.id, via(mailer));

      assert.equal(result.delivery.status, "FAILED");
      assert.match(result.delivery.status === "FAILED" ? result.delivery.reason : "", /The domain is not verified/);
      assert.equal(result.guest.cardStatus, "FAILED");

      const stored = await fresh(guest.id);
      assert.equal(stored.status, "APPROVED", "still approved");
      assert.equal(stored.tableNumber, 9201, "still seated");
      assert.equal(stored.cardStatus, "FAILED");
      assert.equal(stored.cardSentAt, null, "not marked as sent");
    });

    it("treats a network failure the same way, after Resend's retries are used up", async () => {
      const guest = await newGuest();
      const down = () => new Error("fetch failed");
      const mailer = fakeEmailClient(down(), down(), down());

      const result = await approveInvitation(guest.id, via(mailer));

      assert.equal(mailer.calls.length, 3, "tried three times");
      assert.equal(result.delivery.status, "FAILED");
      const stored = await fresh(guest.id);
      assert.deepEqual([stored.status, stored.cardStatus, stored.cardSentAt], ["APPROVED", "FAILED", null]);
    });

    it("fails, and says so, when email isn't configured at all", async () => {
      const guest = await newGuest();
      // The app's own sender with no API key (the tests blank it): nothing can be sent.
      const result = await approveInvitation(guest.id);
      assert.equal(result.delivery.status, "FAILED");
      assert.match(result.delivery.status === "FAILED" ? result.delivery.reason : "", /RESEND_API_KEY is not set/);
      assert.equal((await fresh(guest.id)).status, "APPROVED");
    });

    it("can be put right with a resend", async () => {
      const guest = await newGuest();
      await approveInvitation(guest.id, via(fakeEmailClient(rejected(403, "invalid_from_address", "no"))));
      assert.equal((await fresh(guest.id)).cardStatus, "FAILED");

      const mailer = fakeEmailClient();
      const result = await resendAccessCard(guest.id, via(mailer));

      assert.deepEqual(result.delivery, { status: "SENT" });
      const stored = await fresh(guest.id);
      assert.deepEqual([stored.status, stored.cardStatus], ["APPROVED", "SENT"]);
      assert.ok(stored.cardSentAt);
    });

    it("a failed resend leaves an earlier successful send time alone", async () => {
      const guest = await newGuest();
      await approveInvitation(guest.id, via(fakeEmailClient()));
      const sentAt = (await fresh(guest.id)).cardSentAt!;

      const result = await resendAccessCard(guest.id, via(fakeEmailClient(rejected(422, "validation_error", "bad address"))));

      assert.equal(result.delivery.status, "FAILED");
      const stored = await fresh(guest.id);
      assert.deepEqual([stored.status, stored.cardStatus], ["APPROVED", "FAILED"]);
      assert.equal(stored.cardSentAt?.getTime(), sentAt.getTime());
    });
  });

  describe("a resend", () => {
    it("emails the card again, even though one was already sent, with the same wording", async () => {
      const guest = await newGuest();
      const mailer = fakeEmailClient();
      await approveInvitation(guest.id, via(mailer));
      const firstSentAt = (await fresh(guest.id)).cardSentAt!;
      await new Promise((resolve) => setTimeout(resolve, 15));

      const result = await resendAccessCard(guest.id, via(mailer));

      assert.deepEqual(result.delivery, { status: "SENT" });
      assert.equal(mailer.calls.length, 2, "a second email really went out");
      assert.equal(mailer.calls[1].payload.to, guest.email);
      assert.equal(mailer.calls[1].payload.subject, mailer.calls[0].payload.subject);
      assert.equal(mailer.calls[1].payload.text, mailer.calls[0].payload.text);
      assert.notEqual(
        mailer.calls[0].options.idempotencyKey,
        mailer.calls[1].options.idempotencyKey,
        "a deliberate resend is never swallowed as a duplicate",
      );
      assert.ok((await fresh(guest.id)).cardSentAt!.getTime() > firstSentAt.getTime(), "send time updated");
    });
  });

  describe("a resend after the table has changed", () => {
    it("generates the card again from the current table: TABLE 9203, not TABLE 9201", async () => {
      const guest = await newGuest();
      const mailer = fakeEmailClient();
      await approveInvitation(guest.id, via(mailer));
      assert.equal((await attachedCard(mailer)).table, "TABLE 9201");

      // The admin changes the table, and no email goes with it.
      await updateGuestTable(guest.id, 9203);
      assert.equal((await fresh(guest.id)).cardStatus, "NOT_SENT", "the old card is flagged as outdated");

      await resendAccessCard(guest.id, via(mailer));

      const resent = await attachedCard(mailer);
      assert.deepEqual(resent, { pages: 2, table: "TABLE 9203" });
      assert.notEqual(resent.table, "TABLE 9201");
      assert.match(mailer.calls[1].payload.text, /Table 9203/);
      assert.doesNotMatch(mailer.calls[1].payload.text, /Table 9201/);
      assert.equal((await fresh(guest.id)).cardStatus, "SENT");
    });

    it("also when the email that went with the table change failed", async () => {
      const guest = await newGuest();
      await approveInvitation(guest.id, via(fakeEmailClient()));

      const move = await moveInvitationTable(guest.id, 9203, via(fakeEmailClient(rejected(403, "invalid_from_address", "no"))));
      assert.equal(move.delivery?.status, "FAILED");
      assert.equal((await fresh(guest.id)).cardStatus, "FAILED");

      const mailer = fakeEmailClient();
      await resendAccessCard(guest.id, via(mailer));
      assert.equal((await attachedCard(mailer)).table, "TABLE 9203");
      assert.equal((await fresh(guest.id)).cardStatus, "SENT");
    });

    it("and the email sent with the move itself already carries the new table", async () => {
      const guest = await newGuest();
      const mailer = fakeEmailClient();
      await approveInvitation(guest.id, via(mailer));
      await moveInvitationTable(guest.id, 9202, via(mailer));
      await resendAccessCard(guest.id, via(mailer));

      assert.deepEqual(
        await Promise.all([0, 1, 2].map(async (call) => (await attachedCard(mailer, call)).table)),
        ["TABLE 9201", "TABLE 9202", "TABLE 9202"],
      );
    });

    it("follows the host's name too: the card is regenerated from everything current", async () => {
      const guest = await newGuest();
      await approveInvitation(guest.id, via(fakeEmailClient()));
      await prisma.host.update({ where: { id: HOST_ID }, data: { name: "Renamed Family" } });

      const mailer = fakeEmailClient();
      await resendAccessCard(guest.id, via(mailer));
      await prisma.host.update({ where: { id: HOST_ID }, data: { name: HOST_NAME } });

      assert.match(mailer.calls[0].payload.text, /Invited by: Renamed Family/);
    });
  });
});
