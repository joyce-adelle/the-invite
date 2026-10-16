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
// A second host, capacity 1 with a single seat, so it is easy to fill.
const OTHER_HOST_ID = "test-edit-b";
const OWN_HOSTS = [HOST_ID, OTHER_HOST_ID];
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
    await prisma.guest.deleteMany({ where: { invitedBy: { in: OWN_HOSTS } } });
    await prisma.table.deleteMany({ where: { hostId: { in: OWN_HOSTS } } });
    await prisma.host.deleteMany({ where: { id: { in: OWN_HOSTS } } });
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
    await prisma.host.create({
      data: {
        id: OTHER_HOST_ID,
        name: "Other Edit Family",
        capacity: 1,
        tables: { create: [{ number: 9311, capacity: 1 }] },
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
    await prisma.guest.deleteMany({ where: { invitedBy: { in: OWN_HOSTS } } });
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

  describe("moving a guest to another host", () => {
    const moveTo = (id: string, hostId: string, guest: Guest) =>
      updateGuestDetails(id, { name: guest.name, email: guest.email, invitedBy: hostId });

    it("changes a pending guest's host and nothing else", async () => {
      const guest = await add("Zzedit Pending Mover");
      const { guest: moved, changed } = await moveTo(guest.id, OTHER_HOST_ID, guest);
      assert.deepEqual(changed, { name: false, email: false, host: true });
      assert.equal(moved.invitedBy, OTHER_HOST_ID);
      assert.equal(moved.status, "PENDING");
      assert.equal(moved.tableNumber, null);
    });

    it("keeps the host when it is the same one, and reports no change", async () => {
      const guest = await add("Zzedit Stays Put");
      const { changed } = await moveTo(guest.id, HOST_ID, guest);
      assert.deepEqual(changed, { name: false, email: false, host: false });
    });

    it("seats an approved guest at the new host's first free table and frees their old seat", async () => {
      const { guest: seated } = await approveInvitation((await add("Zzedit Seated Mover")).id, ok);
      assert.equal(seated.tableNumber, 9301);

      const { guest, changed } = await moveTo(seated.id, OTHER_HOST_ID, seated);
      assert.equal(changed.host, true);
      assert.equal(guest.status, "APPROVED");
      assert.equal(guest.invitedBy, OTHER_HOST_ID);
      assert.equal(guest.tableNumber, 9311);
      assert.equal(guest.cardStatus, "NOT_SENT", "the card names the old host and table");

      assert.equal((await getHostOccupancy(HOST_ID)).approved, 0);
      assert.equal((await getHostOccupancy(OTHER_HOST_ID)).approved, 1);
    });

    it("refuses when the new host has no invitations left, changing nothing", async () => {
      await approveInvitation((await add("Zzedit Fills Other", "f@details-test.invalid")).id, ok).then(({ guest }) =>
        moveTo(guest.id, OTHER_HOST_ID, guest),
      );
      const { guest: seated } = await approveInvitation((await add("Zzedit Turned Away")).id, ok);

      await rejectsWith("HOST_FULL", moveTo(seated.id, OTHER_HOST_ID, seated));

      const after = await fresh(seated.id);
      assert.equal(after.invitedBy, HOST_ID);
      assert.equal(after.tableNumber, seated.tableNumber);
      assert.equal(after.cardStatus, "SENT", "a refused move leaves the card alone");
    });

    it("can still move a pending guest to a host that is full, since they take no seat yet", async () => {
      await approveInvitation((await add("Zzedit Occupant")).id, ok).then(({ guest }) =>
        moveTo(guest.id, OTHER_HOST_ID, guest),
      );
      const waiting = await add("Zzedit Waiting");
      const { guest } = await moveTo(waiting.id, OTHER_HOST_ID, waiting);
      assert.equal(guest.invitedBy, OTHER_HOST_ID);
      await rejectsWith("HOST_FULL", approveInvitation(guest.id, ok));
    });

    it("clears the old host's table from a cancelled guest, who can be approved at the new host", async () => {
      const cancelled = await cancelGuest((await approveInvitation((await add("Zzedit Cancelled Mover")).id, ok)).guest.id);
      assert.equal(cancelled.tableNumber, 9301);

      const { guest } = await moveTo(cancelled.id, OTHER_HOST_ID, cancelled);
      assert.equal(guest.status, "CANCELLED");
      assert.equal(guest.invitedBy, OTHER_HOST_ID);
      assert.equal(guest.tableNumber, null);

      const { guest: approvedAgain } = await approveInvitation(guest.id, ok);
      assert.equal(approvedAgain.tableNumber, 9311);
    });

    it("refuses an unknown host", async () => {
      const guest = await add("Zzedit Lost");
      await rejectsWith("UNKNOWN_HOST", moveTo(guest.id, "no-such-host", guest));
      assert.equal((await fresh(guest.id)).invitedBy, HOST_ID);
    });

    it("puts the new host and table on the next card", async () => {
      const { guest: seated } = await approveInvitation((await add("Zzedit Card Mover")).id, ok);
      await moveTo(seated.id, OTHER_HOST_ID, seated);

      const mailer = fakeEmailClient();
      await resendAccessCard(seated.id, (guest: Guest) => sendAccessCard(guest, { client: mailer.client }));

      const [{ payload }] = mailer.calls;
      assert.match(payload.text, /Guest Type: Other Edit Family\nYour table: Table 9311/);
      const { drawn } = await readCard(new Uint8Array(payload.attachments![0].content));
      const texts = drawn.map((d) => d.text);
      assert.ok(texts.includes("OTHER EDIT FAMILY"), texts.join(" | "));
      assert.ok(texts.includes("TABLE 9311"));
      assert.ok(!texts.includes("EDIT FAMILY") && !texts.includes("TABLE 9301"));
    });

    it("lets opposite moves happen together without deadlocking", async () => {
      // One guest per host, both moving to the other's host at the same moment.
      const a = await add("Zzedit Swap A");
      const b = await createGuest({ name: "Zzedit Swap B", email: "b@details-test.invalid", invitedBy: OTHER_HOST_ID });
      const results = await Promise.all([moveTo(a.id, OTHER_HOST_ID, a), moveTo(b.id, HOST_ID, b)]);
      assert.deepEqual(results.map((r) => r.guest.invitedBy), [OTHER_HOST_ID, HOST_ID]);
    });
  });

  describe("correcting a guest's details", () => {
    it("fixes a name and an email, storing the email trimmed and lowercase", async () => {
      const guest = await add("Zzedit Adaa Obi", "ada@wrong.invalid");
      const { guest: updated, changed } = await updateGuestDetails(guest.id, {
        name: "Zzedit Ada Obi",
        email: "  Ada@Right.INVALID ",
      });
      assert.deepEqual(changed, { name: true, email: true, host: false });
      assert.equal(updated.name, "Zzedit Ada Obi");
      assert.equal(updated.email, "ada@right.invalid");
      assert.equal(updated.normalizedName, "zzeditadaobi");
    });

    it("changes only what differs, and writes nothing when nothing does", async () => {
      const guest = await add("Zzedit Same", "same@details-test.invalid");
      const noop = await updateGuestDetails(guest.id, { name: "Zzedit Same", email: "SAME@details-test.invalid" });
      assert.deepEqual(noop.changed, { name: false, email: false, host: false });

      const emailOnly = await updateGuestDetails(guest.id, { name: "Zzedit Same", email: "other@details-test.invalid" });
      assert.deepEqual(emailOnly.changed, { name: false, email: true, host: false });
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
