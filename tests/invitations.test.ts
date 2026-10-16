import "./no-email"; // first: nothing here may send real email
import "dotenv/config";

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import { isGuestError, type GuestErrorCode } from "@/lib/data/errors";
import {
  cancelGuest,
  createGuest,
  getGuest,
  getHostOccupancy,
  rejectGuest,
  updateGuestTable,
} from "@/lib/data/guests";
import { approveInvitation, moveInvitationTable, resendAccessCard } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";
import type { Guest } from "@/types/guest";

// Seating rules against a real database. They create their own hosts and
// tables (ids starting "test-", table numbers 9001+) and delete them again,
// so they only run against a local DATABASE_URL.
const url = process.env.DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

// test-a: capacity 6 over tables of 3, so the host fills up before its tables do.
// test-b: capacity 5 but only 4 seats, so the tables fill up before the host does.
const FIXTURE_HOSTS = [
  { id: "test-a", name: "Test A", capacity: 6, tables: [[9001, 3], [9002, 3], [9003, 3]] },
  { id: "test-b", name: "Test B", capacity: 5, tables: [[9011, 2], [9012, 2]] },
] as const;

// Stand-ins for sending the card, so no test ever emails anyone.
const ok = async () => ({ id: "test-email-id" });
const failing = async (): Promise<{ id: string }> => {
  throw new Error("mail server unreachable");
};
function counting() {
  const sent: Guest[] = [];
  return {
    sent,
    send: async (guest: Guest) => {
      sent.push(guest);
      return { id: "test-email-id" };
    },
  };
}

let counter = 0;
const pending = (host = "test-a") => {
  counter += 1;
  return createGuest({
    name: `Zztest Guest ${counter}`,
    email: `guest${counter}@invitations-test.invalid`,
    invitedBy: host,
  });
};
/** A guest who has been approved (card sent), for tests that start from an approved guest. */
async function approved(host = "test-a") {
  const { guest } = await approveInvitation((await pending(host)).id, ok);
  return guest;
}
const fresh = async (id: string) => (await getGuest(id))!;
const tableOf = async (hostId: string, table: number) =>
  (await getHostOccupancy(hostId)).tables.find((t) => t.number === table)!;

async function rejectsWith(code: GuestErrorCode, promise: Promise<unknown>, message?: RegExp) {
  await assert.rejects(promise, (error) => {
    assert.ok(isGuestError(error, code), `expected ${code}, got ${error}`);
    if (message) assert.match(error.message, message);
    return true;
  });
}

// Only this file's own hosts: other test files have fixtures of their own ("test-card", "test-delivery").
const OWN_HOSTS = FIXTURE_HOSTS.map((host) => host.id);
const removeGuests = () => prisma.guest.deleteMany({ where: { invitedBy: { in: OWN_HOSTS } } });

describe("invitation approval rules", { skip: !isLocal && "DATABASE_URL is not a local database" }, () => {
  before(async () => {
    await removeGuests();
    await prisma.table.deleteMany({ where: { hostId: { in: OWN_HOSTS } } });
    await prisma.host.deleteMany({ where: { id: { in: OWN_HOSTS } } });
    for (const host of FIXTURE_HOSTS) {
      await prisma.host.create({
        data: {
          id: host.id,
          name: host.name,
          capacity: host.capacity,
          tables: { create: host.tables.map(([number, capacity]) => ({ number, capacity })) },
        },
      });
    }
  });
  beforeEach(() => {
    mock.method(console, "info", () => {});
    mock.method(console, "error", () => {});
  });
  afterEach(async () => {
    mock.restoreAll();
    await removeGuests();
  });
  after(async () => {
    await removeGuests();
    await prisma.table.deleteMany({ where: { hostId: { in: OWN_HOSTS } } });
    await prisma.host.deleteMany({ where: { id: { in: OWN_HOSTS } } });
    await prisma.$disconnect();
  });

  describe("approving", () => {
    it("seats the guest, stamps approvedAt, and leaves the card unsent until the email succeeds", async () => {
      const guest = await pending();
      let duringSend: Guest | undefined;

      const result = await approveInvitation(guest.id, async (g) => {
        duringSend = await fresh(g.id);
        return { id: "test-email-id" };
      });

      // While the email was being sent the guest was already approved, but the card was not "sent".
      assert.equal(duringSend?.status, "APPROVED");
      assert.equal(duringSend?.cardStatus, "NOT_SENT");
      assert.equal(duringSend?.cardSentAt, null);

      assert.equal(result.delivery.status, "SENT");
      assert.equal(result.guest.status, "APPROVED");
      assert.equal(result.guest.tableNumber, 9001);
      assert.ok(result.guest.approvedAt instanceof Date);
      assert.equal(result.guest.cardStatus, "SENT");
      assert.ok(result.guest.cardSentAt instanceof Date);
    });

    it("marks the card FAILED, rather than pretending, when email isn't configured", async () => {
      // The default sender with no RESEND_API_KEY (tests blank it): nothing is sent.
      const guest = await pending();
      const result = await approveInvitation(guest.id);
      assert.equal(result.delivery.status, "FAILED");
      assert.match(result.delivery.status === "FAILED" ? result.delivery.reason : "", /RESEND_API_KEY is not set/);
      const stored = await fresh(guest.id);
      assert.equal(stored.status, "APPROVED");
      assert.equal(stored.cardStatus, "FAILED");
    });

    it("sends the same thing every time: on approval, on a table change and on a resend", async () => {
      const calls: unknown[][] = [];
      const send = async (...args: [Guest, ...unknown[]]) => {
        calls.push(args.slice(1));
        return { id: "test-email-id" };
      };
      const guest = (await approveInvitation((await pending()).id, send)).guest;
      await moveInvitationTable(guest.id, 9002, send);
      await resendAccessCard(guest.id, send);
      assert.equal(calls.length, 3);
      assert.ok(calls.every((extra) => extra.length === 0), "no per-case options: one template for all");
    });

    it("keeps the approval and marks the card FAILED when the email fails", async () => {
      const guest = await pending();
      const result = await approveInvitation(guest.id, failing);

      assert.equal(result.delivery.status, "FAILED");
      assert.match(result.delivery.status === "FAILED" ? result.delivery.reason : "", /mail server unreachable/, "the admin is told why");
      const stored = await fresh(guest.id);
      assert.equal(stored.status, "APPROVED");
      assert.equal(stored.tableNumber, 9001);
      assert.equal(stored.cardStatus, "FAILED");
      assert.equal(stored.cardSentAt, null);

      // ...and an admin can retry from the failed state.
      const retry = await resendAccessCard(guest.id, ok);
      assert.equal(retry.guest.cardStatus, "SENT");
      assert.ok(retry.guest.cardSentAt);
    });

    it("does not count pending requests towards capacity", async () => {
      for (let i = 0; i < 10; i++) await pending();
      const before = await getHostOccupancy("test-a");
      assert.deepEqual([before.approved, before.remaining], [0, 6]);

      for (const guest of (await prisma.guest.findMany({ where: { invitedBy: "test-a" }, take: 6 }))) {
        await approveInvitation(guest.id, ok);
      }
      assert.equal((await getHostOccupancy("test-a")).remaining, 0);
    });

    it("doesn't count rejected guests either", async () => {
      const guest = await pending();
      await rejectGuest(guest.id);
      const occupancy = await getHostOccupancy("test-a");
      assert.deepEqual([occupancy.approved, occupancy.remaining], [0, 6]);
    });
  });

  describe("automatic table allocation", () => {
    it("fills the first table with room, then the next", async () => {
      const tables: (number | null)[] = [];
      for (let i = 0; i < 5; i++) tables.push((await approved()).tableNumber);
      assert.deepEqual(tables, [9001, 9001, 9001, 9002, 9002]);
    });

    it("picks the first table with room, even when a later table has room too", async () => {
      const guests: Guest[] = [];
      for (let i = 0; i < 5; i++) guests.push(await approved()); // 9001: 3/3, 9002: 2/3
      await cancelGuest(guests[0].id); // 9001: 2/3, 9002: 2/3. Both have room.
      const next = await approved();
      assert.equal(next.tableNumber, 9001, "the first table with room wins, not the last one used");
    });

    it("never goes past a table's capacity", async () => {
      for (let i = 0; i < 6; i++) await approved();
      const occupancy = await getHostOccupancy("test-a");
      for (const table of occupancy.tables) assert.ok(table.occupied <= table.capacity);
      assert.deepEqual(occupancy.tables.map((t) => t.occupied), [3, 3, 0]);
    });
  });

  describe("host at capacity", () => {
    it("refuses the next approval and leaves the guest pending", async () => {
      for (let i = 0; i < 6; i++) await approved();
      const extra = await pending();
      const { sent, send } = counting();

      await rejectsWith("HOST_FULL", approveInvitation(extra.id, send), /Cancel another invitation to free a place/);

      const stored = await fresh(extra.id);
      assert.equal(stored.status, "PENDING");
      assert.equal(stored.tableNumber, null);
      assert.equal(stored.approvedAt, null);
      assert.equal(sent.length, 0, "no email for an approval that was refused");
      assert.equal((await getHostOccupancy("test-a")).approved, 6);
    });

    it("lets the same guest through once a place is freed", async () => {
      const seated: Guest[] = [];
      for (let i = 0; i < 6; i++) seated.push(await approved());
      const waiting = await pending();
      await rejectsWith("HOST_FULL", approveInvitation(waiting.id, ok));

      await cancelGuest(seated[1].id);
      const result = await approveInvitation(waiting.id, ok);
      assert.equal(result.guest.status, "APPROVED");
      assert.equal(result.guest.tableNumber, 9001, "takes the table the cancelled guest left");
    });

    it("holds the limit when many approvals arrive at once", async () => {
      const guests = await Promise.all(Array.from({ length: 15 }, () => pending()));
      const results = await Promise.allSettled(guests.map((g) => approveInvitation(g.id, ok)));

      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      assert.equal(results.length - failures.length, 6);
      assert.ok(failures.every((f) => isGuestError(f.reason, "HOST_FULL")));
      const occupancy = await getHostOccupancy("test-a");
      assert.deepEqual(occupancy.tables.map((t) => t.occupied), [3, 3, 0]);
    });
  });

  describe("table full", () => {
    it("refuses an approval when every table is full, even though the host has room", async () => {
      for (let i = 0; i < 4; i++) await approved("test-b");
      const extra = await pending("test-b");
      assert.equal((await getHostOccupancy("test-b")).remaining, 1, "the host itself still has a place");
      const { sent, send } = counting();

      await rejectsWith("TABLE_FULL", approveInvitation(extra.id, send), /Cancel another invitation to free a seat/);

      assert.equal((await fresh(extra.id)).status, "PENDING");
      assert.equal(sent.length, 0);
    });

    it("never overfills tables under concurrent approvals", async () => {
      const guests = await Promise.all(Array.from({ length: 8 }, () => pending("test-b")));
      const results = await Promise.allSettled(guests.map((g) => approveInvitation(g.id, ok)));

      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      assert.equal(results.length - failures.length, 4);
      assert.ok(failures.every((f) => isGuestError(f.reason, "TABLE_FULL")));
      assert.deepEqual((await getHostOccupancy("test-b")).tables.map((t) => t.occupied), [2, 2]);
    });
  });

  describe("duplicate and repeated approvals", () => {
    it("lets only one of several simultaneous approvals of the same guest through", async () => {
      const guest = await pending();
      const { sent, send } = counting();

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => approveInvitation(guest.id, send)),
      );

      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      assert.equal(results.length - failures.length, 1);
      assert.ok(failures.every((f) => isGuestError(f.reason, "INVALID_STATUS")));
      assert.equal(sent.length, 1, "the card is emailed once");
      assert.equal((await getHostOccupancy("test-a")).approved, 1, "and only one seat is used");
    });

    it("refuses to approve an already approved guest, changing nothing", async () => {
      const guest = await approved();
      const { sent, send } = counting();

      await rejectsWith("INVALID_STATUS", approveInvitation(guest.id, send), /already approved/);

      const after = await fresh(guest.id);
      assert.equal(after.tableNumber, guest.tableNumber);
      assert.equal(after.approvedAt?.getTime(), guest.approvedAt?.getTime());
      assert.equal(after.cardSentAt?.getTime(), guest.cardSentAt?.getTime());
      assert.equal(sent.length, 0);
      assert.equal((await getHostOccupancy("test-a")).approved, 1);
    });
  });

  describe("rejected guests", () => {
    it("can still be approved: seated, card sent, capacity used", async () => {
      const guest = await pending();
      await rejectGuest(guest.id);
      assert.equal((await getHostOccupancy("test-a")).approved, 0, "rejected guests use no capacity");

      const result = await approveInvitation(guest.id, ok);

      assert.equal(result.guest.status, "APPROVED");
      assert.equal(result.guest.tableNumber, 9001);
      assert.ok(result.guest.approvedAt);
      assert.equal(result.guest.cardStatus, "SENT");
      assert.equal((await getHostOccupancy("test-a")).approved, 1);
    });

    it("is blocked with a clear message when the host is full, then approved once a place is freed", async () => {
      const seated: Guest[] = [];
      for (let i = 0; i < 6; i++) seated.push(await approved());
      const guest = await pending();
      await rejectGuest(guest.id);
      const { sent, send } = counting();

      await rejectsWith("HOST_FULL", approveInvitation(guest.id, send), /Cancel another invitation to free a place, then approve again/);
      assert.equal((await fresh(guest.id)).status, "REJECTED", "still rejected, nothing changed");
      assert.equal(sent.length, 0);

      await cancelGuest(seated[0].id); // what the message asks for
      const result = await approveInvitation(guest.id, send);
      assert.equal(result.guest.status, "APPROVED");
      assert.equal(sent.length, 1);
    });

    it("only pending requests can be rejected", async () => {
      const guest = await approved();
      await rejectsWith("INVALID_STATUS", rejectGuest(guest.id));
      assert.equal((await fresh(guest.id)).status, "APPROVED");
    });
  });

  describe("cancelling", () => {
    it("keeps the record and its history, and releases the seat and the host's place", async () => {
      const guest = await approved();
      const before = await fresh(guest.id);
      assert.equal(before.cardStatus, "SENT");
      const taken = await getHostOccupancy("test-a");
      assert.deepEqual([taken.approved, taken.tables[0].remaining], [1, 2]);

      const cancelled = await cancelGuest(guest.id);

      assert.equal(cancelled.status, "CANCELLED");
      assert.ok(cancelled.cancelledAt instanceof Date);
      // Nothing is deleted or blanked out.
      assert.equal(cancelled.id, before.id);
      assert.equal(cancelled.name, before.name);
      assert.equal(cancelled.email, before.email);
      assert.equal(cancelled.invitedBy, before.invitedBy);
      assert.equal(cancelled.tableNumber, before.tableNumber);
      assert.equal(cancelled.createdAt.getTime(), before.createdAt.getTime());
      assert.equal(cancelled.approvedAt?.getTime(), before.approvedAt?.getTime());
      assert.equal(cancelled.cardStatus, "SENT");
      assert.equal(cancelled.cardSentAt?.getTime(), before.cardSentAt?.getTime());
      assert.ok(await getGuest(guest.id), "the guest is still in the database");

      const freed = await getHostOccupancy("test-a");
      assert.deepEqual([freed.approved, freed.remaining, freed.tables[0].occupied], [0, 6, 0]);
    });

    it("makes the capacity available to the next approval", async () => {
      const seated: Guest[] = [];
      for (let i = 0; i < 6; i++) seated.push(await approved());
      await cancelGuest(seated[0].id);

      const next = await approved();
      assert.equal(next.status, "APPROVED");
      assert.equal((await getHostOccupancy("test-a")).remaining, 0);
    });

    it("can be approved again: a fresh seat and card, and the cancellation is cleared", async () => {
      const guest = await approved();
      const cancelled = await cancelGuest(guest.id);
      assert.ok(cancelled.cancelledAt);
      assert.equal((await getHostOccupancy("test-a")).approved, 0, "cancelled guests use no capacity");

      const result = await approveInvitation(guest.id, ok);

      assert.equal(result.guest.status, "APPROVED");
      assert.equal(result.guest.tableNumber, 9001);
      assert.equal(result.guest.cancelledAt, null);
      assert.ok(result.guest.approvedAt!.getTime() >= cancelled.approvedAt!.getTime());
      assert.equal(result.guest.cardStatus, "SENT");
      assert.equal((await getHostOccupancy("test-a")).approved, 1);
    });

    it("is blocked when the host is full again, and approved after a seat is freed", async () => {
      const guests: Guest[] = [];
      for (let i = 0; i < 6; i++) guests.push(await approved());
      await cancelGuest(guests[0].id);
      await approved(); // someone else takes the freed place
      const { sent, send } = counting();

      await rejectsWith("HOST_FULL", approveInvitation(guests[0].id, send), /Cancel another invitation to free a place/);
      assert.equal((await fresh(guests[0].id)).status, "CANCELLED");

      await cancelGuest(guests[1].id);
      const result = await approveInvitation(guests[0].id, send);
      assert.equal(result.guest.status, "APPROVED");
      assert.equal(sent.length, 1);
    });

    it("can't be cancelled twice, moved or sent a card while cancelled", async () => {
      const guest = await approved();
      await cancelGuest(guest.id);
      const { sent, send } = counting();

      await rejectsWith("INVALID_STATUS", cancelGuest(guest.id));
      await rejectsWith("INVALID_STATUS", moveInvitationTable(guest.id, 9002, send));
      await rejectsWith("INVALID_STATUS", resendAccessCard(guest.id, send));

      assert.equal(sent.length, 0);
      assert.equal((await fresh(guest.id)).status, "CANCELLED");
      assert.equal((await getHostOccupancy("test-a")).approved, 0);
    });

    it("only approved invitations can be cancelled", async () => {
      const guest = await pending();
      await rejectsWith("INVALID_STATUS", cancelGuest(guest.id), /pending/);
      assert.equal((await fresh(guest.id)).status, "PENDING");
    });

    it("doesn't clash with a table move happening at the same moment", async () => {
      const guest = await approved();
      const settled = await Promise.allSettled([
        cancelGuest(guest.id),
        moveInvitationTable(guest.id, 9002, ok),
      ]);
      const stored = await fresh(guest.id);
      // Whichever came first wins; the guest never ends up cancelled *and* moved.
      if (settled[0].status === "fulfilled" && settled[1].status === "rejected") {
        assert.equal(stored.status, "CANCELLED");
        assert.equal(stored.tableNumber, 9001);
      } else {
        assert.equal(settled[0].status, "fulfilled");
        assert.equal(stored.status, "CANCELLED");
        assert.equal(stored.tableNumber, 9002);
      }
    });
  });

  describe("changing table", () => {
    it("moves the guest, never past capacity, and sends a new card for the new table", async () => {
      const guest = await approved();
      const { sent, send } = counting();
      const sentAt = (await fresh(guest.id)).cardSentAt!;

      const result = await moveInvitationTable(guest.id, 9002, send);

      assert.equal(result.guest.tableNumber, 9002);
      assert.equal(result.delivery?.status, "SENT");
      assert.equal(result.guest.cardStatus, "SENT");
      assert.ok(result.guest.cardSentAt!.getTime() >= sentAt.getTime());
      assert.equal(sent.length, 1);
      assert.equal(sent[0].tableNumber, 9002, "the email is for the new table");
      assert.deepEqual(
        [(await tableOf("test-a", 9001)).occupied, (await tableOf("test-a", 9002)).occupied],
        [0, 1],
      );
    });

    it("marks the old card as outdated while the new one is on its way", async () => {
      const guest = await approved();
      let duringSend: Guest | undefined;
      await moveInvitationTable(guest.id, 9002, async (g) => {
        duringSend = await fresh(g.id);
        return { id: "test-email-id" };
      });
      assert.equal(duringSend?.cardStatus, "NOT_SENT");
    });

    it("keeps the move but marks the card FAILED if the new email fails", async () => {
      const guest = await approved();
      const result = await moveInvitationTable(guest.id, 9002, failing);
      assert.equal(result.delivery?.status, "FAILED");
      const stored = await fresh(guest.id);
      assert.equal(stored.tableNumber, 9002);
      assert.equal(stored.cardStatus, "FAILED");
    });

    it("refuses a full table, changing nothing and sending nothing", async () => {
      const guests: Guest[] = [];
      for (let i = 0; i < 4; i++) guests.push(await approved()); // 9001 ×3 (full), 9002 ×1
      const mover = guests[3];
      const { sent, send } = counting();

      await rejectsWith(
        "TABLE_FULL",
        moveInvitationTable(mover.id, 9001, send),
        /Table 9001 is full\. Choose a table with a free seat, or move another guest off it first/,
      );

      const stored = await fresh(mover.id);
      assert.equal(stored.tableNumber, 9002);
      assert.equal(stored.cardStatus, "SENT", "their card is still the right one");
      assert.equal(sent.length, 0);
      assert.equal((await tableOf("test-a", 9001)).occupied, 3);
    });

    it("lets only one of two guests take the last seat on a table", async () => {
      const guests: Guest[] = [];
      for (let i = 0; i < 6; i++) guests.push(await approved()); // 9001 ×3, 9002 ×3
      await cancelGuest(guests[3].id); // 9002 has one free seat
      const [a, b] = [guests[0], guests[1]];

      const results = await Promise.allSettled([
        moveInvitationTable(a.id, 9002, ok),
        moveInvitationTable(b.id, 9002, ok),
      ]);

      assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
      assert.ok(isGuestError((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason, "TABLE_FULL"));
      assert.equal((await tableOf("test-a", 9002)).occupied, 3);
    });

    it("rejects tables that aren't the host's, and tables that don't exist", async () => {
      const guest = await approved();
      await rejectsWith("UNKNOWN_TABLE", moveInvitationTable(guest.id, 9011, ok)); // test-b's table
      await rejectsWith("UNKNOWN_TABLE", moveInvitationTable(guest.id, 424242, ok));
      assert.equal((await fresh(guest.id)).tableNumber, 9001);
    });

    it("does nothing, and sends nothing, when the guest is already at that table", async () => {
      const guest = await approved();
      const { sent, send } = counting();
      const result = await moveInvitationTable(guest.id, 9001, send);
      assert.equal(result.delivery, null);
      assert.equal(sent.length, 0);
      assert.equal((await fresh(guest.id)).cardSentAt?.getTime(), guest.cardSentAt?.getTime());
    });

    it("is only for approved guests", async () => {
      const guest = await pending();
      await rejectsWith("INVALID_STATUS", moveInvitationTable(guest.id, 9002, ok));
      await rejectsWith("INVALID_STATUS", updateGuestTable(guest.id, 9002));
      await rejectsWith("GUEST_NOT_FOUND", moveInvitationTable("00000000-0000-4000-8000-000000000000", 9002, ok));
    });
  });

  describe("resending a card", () => {
    it("works for approved guests only: nothing is sent for pending, rejected or cancelled guests", async () => {
      const { sent, send } = counting();
      const waiting = await pending();
      const rejected = await pending();
      await rejectGuest(rejected.id);
      const cancelled = await approved();
      await cancelGuest(cancelled.id);

      for (const guest of [waiting, rejected, cancelled]) {
        await rejectsWith("INVALID_STATUS", resendAccessCard(guest.id, send));
      }
      await rejectsWith("GUEST_NOT_FOUND", resendAccessCard("00000000-0000-4000-8000-000000000000", send));
      assert.equal(sent.length, 0);
    });

    it("keeps a failed resend's guest approved, marks the card FAILED and keeps the last successful send time", async () => {
      const guest = await approved();
      const sentAt = (await fresh(guest.id)).cardSentAt!;

      const result = await resendAccessCard(guest.id, failing);

      assert.equal(result.delivery.status, "FAILED");
      const stored = await fresh(guest.id);
      assert.equal(stored.status, "APPROVED");
      assert.equal(stored.cardStatus, "FAILED");
      assert.equal(stored.cardSentAt?.getTime(), sentAt.getTime(), "not re-stamped as sent");
    });
  });
});
