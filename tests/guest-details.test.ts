import "./no-email"; // first: nothing here may send real email
import "dotenv/config";

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import { sendAccessCard } from "@/lib/access-card";
import { isGuestError, type GuestErrorCode } from "@/lib/data/errors";
import {
  cancelGuest,
  createGuest,
  createGuestRequest,
  getGuest,
  getHostOccupancy,
  rejectGuest,
  updateGuestDetails,
} from "@/lib/data/guests";
import { approveInvitation, resendAccessCard } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";
import type { Guest } from "@/types/guest";
import { fakeEmailClient } from "./fake-email";
import { readCard } from "./pdf-helpers";

// Adding guests as an admin (names may repeat) and correcting a guest's name
// or email. Own host and tables (ids starting "test-", table numbers 9301+),
// removed afterwards, so only against a local database.
const url = process.env.DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const HOST_ID = "test-edit";
const ok = async () => ({ id: "test-email-id" });

const add = (name: string, email = "guest@details-test.invalid") =>
  createGuest({ name, email, invitedBy: HOST_ID });
const fresh = async (id: string) => (await getGuest(id))!;

async function rejectsWith(code: GuestErrorCode, promise: Promise<unknown>) {
  await assert.rejects(promise, (error) => {
    assert.ok(isGuestError(error, code), `expected ${code}, got ${error}`);
    return true;
  });
}

describe("adding and editing guests", { skip: !isLocal && "DATABASE_URL is not a local database" }, () => {
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
        name: "Edit Family",
        capacity: 4,
        tables: { create: [9301, 9302].map((number) => ({ number, capacity: 2 })) },
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

  describe("an admin adding a guest", () => {
    it("creates a pending guest who takes no capacity", async () => {
      const guest = await add("Zzedit Ada Obi");
      assert.equal(guest.status, "PENDING");
      assert.equal(guest.tableNumber, null);
      assert.equal(guest.cardStatus, "NOT_SENT");
      assert.equal((await getHostOccupancy(HOST_ID)).approved, 0);
    });

    it("allows two guests with the same name, which the public form does not", async () => {
      const first = await add("Zzedit Same Name");
      const second = await add("zzedit  same name");
      assert.notEqual(first.id, second.id);
      assert.equal(second.name, "zzedit  same name");
      assert.notEqual(first.normalizedName, second.normalizedName);

      await rejectsWith(
        "DUPLICATE_NAME",
        createGuestRequest({ name: "Zzedit Same Name", email: "x@details-test.invalid", invitedBy: HOST_ID }),
      );
    });

    it("lets both same-named guests be approved and seated", async () => {
      const first = await add("Zzedit Twin");
      const second = await add("Zzedit Twin");
      const a = (await approveInvitation(first.id, ok)).guest;
      const b = (await approveInvitation(second.id, ok)).guest;
      assert.deepEqual([a.status, b.status], ["APPROVED", "APPROVED"]);
      assert.equal(a.name, b.name);
    });

    it("refuses an unknown host", async () => {
      await rejectsWith("UNKNOWN_HOST", createGuest({ name: "Zzedit Nobody", email: "n@details-test.invalid", invitedBy: "no-such-host" }));
    });
  });

  describe("correcting a guest's details", () => {
    it("fixes a name and an email, storing the email trimmed and lowercase", async () => {
      const guest = await add("Zzedit Adaa Obi", "ada@wrong.invalid");
      const { guest: updated, changed } = await updateGuestDetails(guest.id, {
        name: "Zzedit Ada Obi",
        email: "  Ada@Right.INVALID ",
      });
      assert.deepEqual(changed, { name: true, email: true });
      assert.equal(updated.name, "Zzedit Ada Obi");
      assert.equal(updated.email, "ada@right.invalid");
      assert.equal(updated.normalizedName, "zzeditadaobi");
    });

    it("changes only what differs, and writes nothing when nothing does", async () => {
      const guest = await add("Zzedit Same", "same@details-test.invalid");
      const noop = await updateGuestDetails(guest.id, { name: "Zzedit Same", email: "SAME@details-test.invalid" });
      assert.deepEqual(noop.changed, { name: false, email: false });

      const emailOnly = await updateGuestDetails(guest.id, { name: "Zzedit Same", email: "other@details-test.invalid" });
      assert.deepEqual(emailOnly.changed, { name: false, email: true });
      assert.equal(emailOnly.guest.name, "Zzedit Same");
    });

    it("lets a name be corrected to one another guest already has", async () => {
      await add("Zzedit Taken");
      const other = await add("Zzedit Takn");
      const { guest } = await updateGuestDetails(other.id, { name: "Zzedit Taken", email: other.email });
      assert.equal(guest.name, "Zzedit Taken");
      assert.notEqual(guest.normalizedName, "zzedittaken");
    });

    it("works whatever the guest's status, leaving the status alone", async () => {
      const rejected = await rejectGuest((await add("Zzedit Rejected")).id);
      const cancelled = await cancelGuest((await approveInvitation((await add("Zzedit Cancelled")).id, ok)).guest.id);

      for (const guest of [await add("Zzedit Pending"), rejected, cancelled]) {
        const { guest: updated } = await updateGuestDetails(guest.id, { name: `${guest.name} Fixed`, email: "fixed@details-test.invalid" });
        assert.equal(updated.status, guest.status);
        assert.equal(updated.name, `${guest.name} Fixed`);
      }
      assert.equal((await fresh(cancelled.id)).cancelledAt?.getTime(), cancelled.cancelledAt?.getTime());
    });

    it("keeps an approved guest's seat but marks their card as needing to be sent again", async () => {
      const { guest: seated } = await approveInvitation((await add("Zzedit Seated")).id, ok);
      assert.equal(seated.cardStatus, "SENT");

      const { guest } = await updateGuestDetails(seated.id, { name: "Zzedit Seated Right", email: seated.email });
      assert.equal(guest.status, "APPROVED");
      assert.equal(guest.tableNumber, seated.tableNumber);
      assert.equal(guest.approvedAt?.getTime(), seated.approvedAt?.getTime());
      assert.equal(guest.cardStatus, "NOT_SENT");
      assert.equal(guest.cardSentAt?.getTime(), seated.cardSentAt?.getTime(), "the history of the last send is kept");
    });

    it("leaves an approved guest's card alone when nothing changed", async () => {
      const { guest: seated } = await approveInvitation((await add("Zzedit Untouched")).id, ok);
      const { guest } = await updateGuestDetails(seated.id, { name: seated.name, email: seated.email });
      assert.equal(guest.cardStatus, "SENT");
    });

    it("sends the next card to the corrected email, with the corrected name on it", async () => {
      const { guest: seated } = await approveInvitation(
        (await add("Zzedit Wrong Name", "wrong@details-test.invalid")).id,
        ok,
      );
      await updateGuestDetails(seated.id, { name: "Zzedit Right Name", email: "right@details-test.invalid" });

      const mailer = fakeEmailClient();
      await resendAccessCard(seated.id, (guest: Guest) => sendAccessCard(guest, { client: mailer.client }));

      const [{ payload }] = mailer.calls;
      assert.equal(payload.to, "right@details-test.invalid");
      assert.match(payload.text, /Dear Zzedit Right Name,/);
      const { drawn } = await readCard(new Uint8Array(payload.attachments![0].content));
      // The card prints names in capitals.
      assert.ok(drawn.some((d) => d.text === "ZZEDIT RIGHT NAME"), drawn.map((d) => d.text).join(" | "));
      assert.ok(!drawn.some((d) => d.text.includes("WRONG")));
      assert.equal((await fresh(seated.id)).cardStatus, "SENT");
    });

    it("reports an unknown guest and a name with no letters", async () => {
      await rejectsWith("GUEST_NOT_FOUND", updateGuestDetails("00000000-0000-4000-8000-000000000000", { name: "Zzedit X", email: "x@details-test.invalid" }));
      const guest = await add("Zzedit Valid");
      await rejectsWith("INVALID_NAME", updateGuestDetails(guest.id, { name: "!!!", email: guest.email }));
    });
  });
});
