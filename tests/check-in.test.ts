import "./no-email"; // first: nothing here may send real email
import "dotenv/config";

import assert from "node:assert/strict";
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import jsQR from "jsqr";
import {
  PDFDict,
  PDFName,
  type PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { PNG } from "pngjs";

import { sendAccessCard } from "@/lib/access-card";
import { CHECK_IN_TOKEN_PATTERN, checkInUrl } from "@/lib/check-in/check-in";
import {
  checkInGuest,
  ensureCheckInToken,
  getCheckInView,
} from "@/lib/data/check-in";
import { isGuestError } from "@/lib/data/errors";
import {
  cancelGuest,
  createGuest,
  getAdminGuests,
  getDashboardCounts,
  getGuest,
  rejectGuest,
  updateGuestTable,
} from "@/lib/data/guests";
import { approveInvitation, resendAccessCard } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";
import { attendanceOf } from "@/lib/utils";
import {
  checkInToFlag,
  dashboardHref,
  parseFilters,
} from "@/lib/admin-filters";
import { fakeEmailClient } from "./fake-email";
import { readCard } from "./pdf-helpers";
import type { Guest } from "@/types/guest";

// The check-in token's life and the check-in itself, against a real database:
// own host (id "test-checkin", table numbers 9501+), removed afterwards, so
// only against a local database.
const url = process.env.DATABASE_URL ?? "";
const isLocal =
  /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const HOST_ID = "test-checkin";

// Admins are real user rows, because a check-in points at one. Each has a
// username shown on the page ("TestAdmin_a") and an id stored on the guest.
const ADMIN_KEYS = ["a", "b", "one", "first", "second", ...Array.from({ length: 16 }, (_, i) => String(i))];
const adminId = (key: string | number) => `test-checkin-admin-${key}`;
const adminShown = (key: string | number) => `TestAdmin_${key}`;
const shownById = (id: string | null) => (id ? adminShown(id.replace("test-checkin-admin-", "")) : null);
const makeAdmins = () =>
  prisma.user.createMany({
    data: ADMIN_KEYS.map((key) => ({
      id: adminId(key),
      name: adminShown(key),
      email: `${key}@check-in-test.invalid`,
      username: `testadmin_${key}`,
      displayUsername: adminShown(key),
    })),
  });
const removeAdmins = () => prisma.user.deleteMany({ where: { id: { startsWith: "test-checkin-admin-" } } });
const ok = async () => ({ id: "test-email-id" });

let counter = 0;
const pending = () => {
  counter += 1;
  return createGuest({
    name: `Zzcheckin Guest ${counter}`,
    email: `checkin${counter}@check-in-test.invalid`,
    invitedBy: HOST_ID,
  });
};
const approved = async () =>
  (await approveInvitation((await pending()).id, ok)).guest;
const fresh = async (id: string) => (await getGuest(id))!;
const tokenOf = async (id: string) => (await fresh(id)).checkInToken!;

/** The address in the QR picture on a card PDF, as a camera would read it. */
async function scanCard(pdf: Uint8Array): Promise<string | null> {
  const { doc, page2 } = await readCard(pdf);
  const xobjects = page2.node
    .Resources()!
    .lookupMaybe(PDFName.of("XObject"), PDFDict)!;
  const key = xobjects.keys().find((k) => k.asString().startsWith("/Image-"))!;
  const image = xobjects.lookup(key) as PDFRawStream;
  const width = Number(image.dict.get(PDFName.of("Width"))!.toString());
  const height = Number(image.dict.get(PDFName.of("Height"))!.toString());
  const rgb = decodePDFRawStream(image).decode();
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++)
    rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
  void doc;
  return jsQR(rgba, width, height)?.data ?? null;
}
const scanPng = (png: Buffer) => {
  const { data, width, height } = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(data), width, height)?.data ?? null;
};

describe(
  "check-in",
  { skip: !isLocal && "DATABASE_URL is not a local database" },
  () => {
    const removeFixtures = async () => {
      await prisma.guest.deleteMany({ where: { invitedBy: HOST_ID } });
      await removeAdmins(); // after the guests: a check-in holds its admin in place
      await prisma.table.deleteMany({ where: { hostId: HOST_ID } });
      await prisma.host.deleteMany({ where: { id: HOST_ID } });
    };

    before(async () => {
      await removeFixtures();
      await makeAdmins();
      await prisma.host.create({
        data: {
          id: HOST_ID,
          name: "Check-in Family",
          capacity: 40,
          tables: {
            create: [9501, 9502, 9503, 9504].map((number) => ({
              number,
              capacity: 10,
            })),
          },
        },
      });
    });
    beforeEach(() => {
      process.env.EMAIL_FROM = "TheInvite <invites@example.com>";
      mock.method(console, "error", () => { });
      mock.method(console, "info", () => { });
    });
    afterEach(async () => {
      mock.restoreAll();
      await prisma.guest.deleteMany({ where: { invitedBy: HOST_ID } });
    });
    after(async () => {
      await removeFixtures();
      await prisma.$disconnect();
    });

    describe("the token", () => {
      it("is made when a guest is approved, and not before", async () => {
        const guest = await pending();
        assert.equal(guest.checkInToken, null);

        const { guest: seated } = await approveInvitation(guest.id, ok);
        assert.match(seated.checkInToken!, CHECK_IN_TOKEN_PATTERN);
        assert.equal(await tokenOf(guest.id), seated.checkInToken);
      });

      it("is different for every guest, and the database refuses a repeat", async () => {
        const guests = await Promise.all(Array.from({ length: 8 }, approved));
        assert.equal(
          new Set(guests.map((g) => g.checkInToken)).size,
          guests.length,
        );

        const [a, b] = guests;
        await assert.rejects(
          prisma.guest.update({
            where: { id: b.id },
            data: { checkInToken: a.checkInToken },
          }),
          (error: { code?: string }) => error.code === "P2002",
        );
      });

      it("has nothing to do with the guest's name, email, id or position", async () => {
        const guest = await approved();
        const token = guest.checkInToken!.toLowerCase();
        for (const secret of [
          guest.id,
          guest.name,
          guest.normalizedName,
          guest.email,
          guest.email.split("@")[0],
        ]) {
          assert.ok(
            !token.includes(secret.toLowerCase().replace(/[^a-z0-9]/g, "")),
            `not derived from ${secret}`,
          );
        }
      });

      it("stays the same when the guest is approved again after a cancellation", async () => {
        const guest = await approved();
        await cancelGuest(guest.id);
        const { guest: again } = await approveInvitation(guest.id, ok);
        assert.equal(again.checkInToken, guest.checkInToken);
      });

      it("stays the same when the card is resent, many times", async () => {
        const guest = await approved();
        for (let i = 0; i < 3; i++) await resendAccessCard(guest.id, ok);
        assert.equal(await tokenOf(guest.id), guest.checkInToken);
      });

      it("stays the same when the table changes, while the card shows the new table", async () => {
        const guest = await approved();
        assert.equal(guest.tableNumber, 9501);
        await updateGuestTable(guest.id, 9503);
        assert.equal(await tokenOf(guest.id), guest.checkInToken);

        const mailer = fakeEmailClient();
        await resendAccessCard(guest.id, (g: Guest) =>
          sendAccessCard(g, { client: mailer.client }),
        );
        const [pdf, qr] = mailer.calls[0].payload.attachments!;
        const { drawn } = await readCard(new Uint8Array(pdf.content));
        assert.ok(drawn.some((d) => d.text === "TABLE 9503"));
        assert.equal(
          await scanCard(new Uint8Array(pdf.content)),
          checkInUrl(guest.checkInToken!),
        );
        assert.equal(scanPng(qr.content), checkInUrl(guest.checkInToken!));
      });

      it("is the one in the QR code of the PDF and the email, for the first send and every resend", async () => {
        const guest = await approved();
        const expected = checkInUrl(guest.checkInToken!);
        const mailer = fakeEmailClient();
        const send = (g: Guest) => sendAccessCard(g, { client: mailer.client });

        await send(guest);
        await resendAccessCard(guest.id, send);
        await resendAccessCard(guest.id, send);

        assert.equal(mailer.calls.length, 3);
        for (const { payload } of mailer.calls) {
          const [pdf, qr] = payload.attachments!;
          assert.equal(await scanCard(new Uint8Array(pdf.content)), expected);
          assert.equal(scanPng(qr.content), expected);
        }
        assert.equal(await tokenOf(guest.id), guest.checkInToken);
      });

      it("is given once to a guest approved before QR codes, when their card is next sent, and never replaced", async () => {
        const guest = await approved();
        await prisma.guest.update({
          where: { id: guest.id },
          data: { checkInToken: null },
        });
        assert.equal(await tokenOf(guest.id).catch(() => null), null);

        const mailer = fakeEmailClient();
        const send = (g: Guest) => sendAccessCard(g, { client: mailer.client });
        await resendAccessCard(guest.id, send);
        const made = await tokenOf(guest.id);
        assert.match(made, CHECK_IN_TOKEN_PATTERN);

        await resendAccessCard(guest.id, send);
        assert.equal(await tokenOf(guest.id), made);
        assert.equal(
          scanPng(mailer.calls[1].payload.attachments![1].content),
          checkInUrl(made),
        );
      });

      it("is made only once however many requests ask at the same moment", async () => {
        const guest = await approved();
        await prisma.guest.update({
          where: { id: guest.id },
          data: { checkInToken: null },
        });
        const tokens = await Promise.all(
          Array.from({ length: 15 }, () => ensureCheckInToken(guest.id)),
        );
        assert.equal(new Set(tokens).size, 1);
        assert.equal(await tokenOf(guest.id), tokens[0]);
      });

      it("isn't made for a guest who isn't approved", async () => {
        const guest = await pending();
        await assert.rejects(ensureCheckInToken(guest.id), (error) =>
          isGuestError(error, "INVALID_STATUS"),
        );
        assert.equal((await fresh(guest.id)).checkInToken, null);
      });

      it("is left out of the admin guest list that goes to the browser", async () => {
        await approved();
        const { guests } = await getAdminGuests(
          { status: "APPROVED", invitedBy: HOST_ID },
          { page: 1, pageSize: 20 },
        );
        assert.ok(guests.length > 0);
        for (const guest of guests)
          assert.ok(!("checkInToken" in guest), "no token in the list");
      });
    });

    describe("checking a guest in", () => {
      it("records when and by whom, together, for an approved guest", async () => {
        const guest = await approved();
        assert.equal(guest.checkedInAt, null);
        assert.equal(guest.checkedInBy, null);

        const before = Date.now();
        const result = await checkInGuest(
          guest.checkInToken!,
          adminId("one"),
        );
        const after = Date.now();

        assert.equal(result.outcome, "checked-in");
        assert.ok("guest" in result);
        assert.equal(result.guest.checkedInBy, adminShown("one"), "shown by username");
        const stored = await fresh(guest.id);
        assert.equal(stored.checkedInBy, adminId("one"), "stored as the user id");
        assert.ok(
          stored.checkedInAt &&
          stored.checkedInAt.getTime() >= before - 1000 &&
          stored.checkedInAt.getTime() <= after + 1000,
        );
        assert.equal(
          result.guest.checkedInAt?.getTime(),
          stored.checkedInAt.getTime(),
        );
      });

      it("shows the admin the guest's name, table, host and status, and nothing private", async () => {
        const guest = await approved();
        const result = await checkInGuest(guest.checkInToken!, adminId("a"));
        assert.ok("guest" in result);
        assert.deepEqual(Object.keys(result.guest).sort(), [
          "checkedInAt",
          "checkedInBy",
          "hostName",
          "name",
          "status",
          "tableNumber",
        ]);
        assert.equal(result.guest.name, guest.name);
        assert.equal(result.guest.tableNumber, 9501);
        assert.equal(result.guest.hostName, "Check-in Family");
        assert.equal(result.guest.status, "APPROVED");
      });

      it("only reads, when asked to view, and changes nothing", async () => {
        const guest = await approved();
        const view = await getCheckInView(guest.checkInToken!);
        assert.equal(view?.name, guest.name);
        assert.equal(view?.checkedInAt, null);
        assert.equal(
          (await fresh(guest.id)).checkedInAt,
          null,
          "looking is not checking in",
        );
        assert.equal(
          await tokenOf(guest.id),
          guest.checkInToken,
          "and does not remake the token",
        );
      });

      it("lets a guest in only once, and keeps the first check-in's details", async () => {
        const guest = await approved();
        const first = await checkInGuest(
          guest.checkInToken!,
          adminId("first"),
        );
        const stored = await fresh(guest.id);

        const second = await checkInGuest(
          guest.checkInToken!,
          adminId("second"),
        );
        assert.equal(first.outcome, "checked-in");
        assert.equal(second.outcome, "already-checked-in");
        assert.ok("guest" in second);
        assert.equal(second.guest.checkedInBy, adminShown("first"));
        assert.equal(
          second.guest.checkedInAt?.getTime(),
          stored.checkedInAt?.getTime(),
        );

        const after = await fresh(guest.id);
        assert.equal(after.checkedInBy, adminId("first"));
        assert.equal(
          after.checkedInAt?.getTime(),
          stored.checkedInAt?.getTime(),
        );
      });

      it("lets exactly one of many simultaneous check-ins through", async () => {
        const guest = await approved();
        const admins = Array.from(
          { length: 16 },
          (_, i) => adminId(i),
        );
        const results = await Promise.all(
          admins.map((admin) => checkInGuest(guest.checkInToken!, admin)),
        );

        const winners = results.filter((r) => r.outcome === "checked-in");
        assert.equal(winners.length, 1, "one success");
        assert.equal(
          results.filter((r) => r.outcome === "already-checked-in").length,
          admins.length - 1,
        );

        const winner = winners[0];
        assert.ok("guest" in winner);
        const stored = await fresh(guest.id);
        assert.equal(
          shownById(stored.checkedInBy),
          winner.guest.checkedInBy,
          "the stored admin is the one told they succeeded",
        );
        // Everyone who lost is shown the winner's details.
        for (const result of results) {
          assert.ok("guest" in result);
          assert.equal(result.guest.checkedInBy, shownById(stored.checkedInBy));
          assert.equal(
            result.guest.checkedInAt?.getTime(),
            stored.checkedInAt?.getTime(),
          );
        }
      });

      it("never checks in a pending, rejected or cancelled invitation", async () => {
        const waiting = await pending();
        const rejected = await rejectGuest((await pending()).id);
        const cancelled = await cancelGuest((await approved()).id);

        // A pending or rejected guest has no QR code at all; give them one anyway to prove status is what blocks.
        for (const guest of [waiting, rejected]) {
          await prisma.guest.update({
            where: { id: guest.id },
            data: {
              checkInToken: `${guest.status.padEnd(24, "x")}`.slice(0, 24),
            },
          });
        }
        for (const guest of [waiting, rejected, cancelled]) {
          const token = await tokenOf(guest.id);
          const result = await checkInGuest(token, adminId("a"));
          assert.equal(result.outcome, "not-eligible", guest.status);
          assert.ok("guest" in result && result.guest.status === guest.status);
          const stored = await fresh(guest.id);
          assert.equal(stored.checkedInAt, null);
          assert.equal(stored.checkedInBy, null);
        }
      });

      it("refuses a cancelled guest even though their original QR code still scans", async () => {
        const guest = await approved();
        assert.equal(
          (await getCheckInView(guest.checkInToken!))?.status,
          "APPROVED",
        );
        await cancelGuest(guest.id);

        assert.equal(
          (await getCheckInView(guest.checkInToken!))?.status,
          "CANCELLED",
        );
        assert.equal(
          (await checkInGuest(guest.checkInToken!, adminId("a"))).outcome,
          "not-eligible",
        );
        assert.equal((await fresh(guest.id)).checkedInAt, null);
      });

      it("lets a cancelled guest back in once approved again, with the same code", async () => {
        const guest = await approved();
        await cancelGuest(guest.id);
        await approveInvitation(guest.id, ok);
        assert.equal(
          (await checkInGuest(guest.checkInToken!, adminId("a"))).outcome,
          "checked-in",
        );
      });

      it("keeps the record of a guest who checked in and was cancelled afterwards, and still refuses them", async () => {
        const guest = await approved();
        await checkInGuest(guest.checkInToken!, adminId("a"));
        await cancelGuest(guest.id);

        const result = await checkInGuest(guest.checkInToken!, adminId("b"));
        assert.equal(result.outcome, "not-eligible");
        assert.ok("guest" in result);
        assert.equal(
          result.guest.checkedInBy,
          adminShown("a"),
          "the earlier check-in is shown, not overwritten",
        );
      });

      it("doesn't know a token that belongs to no one, or that isn't shaped like one", async () => {
        for (const token of [
          "",
          "short",
          "x".repeat(24),
          "../../etc/passwd",
          "a'; DROP TABLE guests;--",
          "A".repeat(500),
        ]) {
          assert.deepEqual(
            await checkInGuest(token, adminId("a")),
            { outcome: "not-found" },
            token,
          );
          assert.equal(await getCheckInView(token), null, token);
        }
        assert.equal(
          await prisma.guest.count({
            where: { checkedInAt: { not: null }, invitedBy: HOST_ID },
          }),
          0,
        );
      });

      it("keeps the record of who let a guest in: an admin with check-ins can't be deleted", async () => {
        const guest = await approved();
        await checkInGuest(guest.checkInToken!, adminId("a"));

        await assert.rejects(
          prisma.user.delete({ where: { id: adminId("a") } }),
          (error: { code?: string }) => error.code === "P2003",
          "refused while a check-in points at them",
        );
        assert.equal((await fresh(guest.id)).checkedInBy, adminId("a"));
        // An admin who has checked nobody in can still be removed.
        await prisma.user.delete({ where: { id: adminId("b") } });
        await prisma.user.create({
          data: { id: adminId("b"), name: adminShown("b"), email: "b@check-in-test.invalid", username: "testadmin_b", displayUsername: adminShown("b") },
        });
      });

      it("won't record a check-in with no admin named", async () => {
        const guest = await approved();
        await assert.rejects(checkInGuest(guest.checkInToken!, "   "));
        assert.equal((await fresh(guest.id)).checkedInAt, null);
      });

      it("can't be half recorded: the database requires both fields, and a token", async () => {
        const guest = await approved();
        const cases: [string, Record<string, unknown>][] = [
          ["time without an admin", { checkedInAt: new Date() }],
          ["an admin without a time", { checkedInBy: adminId("a") }],
          ["an admin who doesn't exist", { checkedInAt: new Date(), checkedInBy: "no-such-user" }],
          ["an empty admin", { checkedInAt: new Date(), checkedInBy: "" }],
        ];
        for (const [name, data] of cases) {
          await assert.rejects(
            prisma.guest.update({ where: { id: guest.id }, data }),
            name,
          );
        }
        await prisma.guest.update({
          where: { id: guest.id },
          data: { checkedInAt: new Date(), checkedInBy: adminId("a") },
        });
        await assert.rejects(
          prisma.guest.update({
            where: { id: guest.id },
            data: { checkedInBy: null },
          }),
          "clearing one of the two",
        );
        await assert.rejects(
          prisma.guest.update({
            where: { id: guest.id },
            data: { checkInToken: null },
          }),
          "a check-in with no token",
        );
      });
    });

    describe("attendance numbers and the check-in filter", () => {
      it("counts approved and checked-in guests from the database, event-wide", async () => {
        const before = (await getDashboardCounts()).attendance;
        const guests = await Promise.all(Array.from({ length: 5 }, approved));
        await pending(); // pending guests count towards nothing
        await checkInGuest(guests[0].checkInToken!, adminId("a"));
        await checkInGuest(guests[1].checkInToken!, adminId("a"));
        await checkInGuest(guests[1].checkInToken!, adminId("a")); // a repeat adds nothing
        await cancelGuest(guests[2].id); // no longer approved

        const now = (await getDashboardCounts()).attendance;
        assert.equal(now.approved - before.approved, 4);
        assert.equal(now.checkedIn - before.checkedIn, 2);
        assert.equal(now.notCheckedIn - before.notCheckedIn, 2);
        assert.deepEqual(now, attendanceOf(now.approved, now.checkedIn));
      });

      it("doesn't count a cancelled guest who had checked in", async () => {
        const before = (await getDashboardCounts()).attendance;
        const guest = await approved();
        await checkInGuest(guest.checkInToken!, adminId("a"));
        await cancelGuest(guest.id);
        const now = (await getDashboardCounts()).attendance;
        assert.equal(now.approved, before.approved);
        assert.equal(now.checkedIn, before.checkedIn);
      });

      it("works out the percentage, rounded, and 0 when nobody is approved", () => {
        assert.deepEqual(attendanceOf(0, 0), {
          approved: 0,
          checkedIn: 0,
          notCheckedIn: 0,
          percent: 0,
        });
        assert.deepEqual(attendanceOf(3, 1), {
          approved: 3,
          checkedIn: 1,
          notCheckedIn: 2,
          percent: 33,
        });
        assert.deepEqual(attendanceOf(8, 8), {
          approved: 8,
          checkedIn: 8,
          notCheckedIn: 0,
          percent: 100,
        });
        assert.equal(attendanceOf(200, 1).percent, 1);
      });

      it("lists checked-in and not-yet-checked-in guests separately", async () => {
        const guests = await Promise.all(Array.from({ length: 4 }, approved));
        await checkInGuest(guests[0].checkInToken!, adminId("a"));
        await checkInGuest(guests[3].checkInToken!, adminId("b"));

        const list = async (checkedIn?: boolean) =>
          (
            await getAdminGuests(
              { status: "APPROVED", invitedBy: HOST_ID, checkedIn },
              { page: 1, pageSize: 50 },
            )
          ).guests;
        const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

        assert.deepEqual(ids(await list(true)), ids([guests[0], guests[3]]));
        assert.deepEqual(ids(await list(false)), ids([guests[1], guests[2]]));
        assert.equal((await list()).length, 4);
        const checked = await list(true);
        assert.ok(checked.every((g) => g.checkedInAt && g.checkedInBy));
        assert.ok(
          (await list(false)).every((g) => !g.checkedInAt && !g.checkedInBy),
        );
      });

      it("pages the filtered list with the right totals", async () => {
        const guests = await Promise.all(Array.from({ length: 5 }, approved));
        for (const guest of guests.slice(0, 3))
          await checkInGuest(guest.checkInToken!, adminId("a"));
        const page = await getAdminGuests(
          { status: "APPROVED", invitedBy: HOST_ID, checkedIn: true },
          { page: 1, pageSize: 2 },
        );
        assert.equal(page.total, 3);
        assert.equal(page.totalPages, 2);
        assert.equal(page.guests.length, 2);
      });
    });
  },
);

describe("the check-in filter in the address", () => {
  const hosts = ["host-01"];

  it("is read only on the Approved tab, and anything else means everyone", () => {
    assert.equal(
      parseFilters({ status: "approved", checkin: "checked-in" }, hosts)
        .checkIn,
      "checked-in",
    );
    assert.equal(
      parseFilters({ status: "approved", checkin: "not-checked-in" }, hosts)
        .checkIn,
      "not-checked-in",
    );
    assert.equal(parseFilters({ status: "approved" }, hosts).checkIn, "all");
    assert.equal(
      parseFilters({ status: "approved", checkin: "nonsense" }, hosts).checkIn,
      "all",
    );
    assert.equal(
      parseFilters({ status: "approved", checkin: ["checked-in"] }, hosts)
        .checkIn,
      "all",
    );
    for (const status of [
      "pending",
      "rejected",
      "cancelled",
      "all",
      undefined,
    ]) {
      assert.equal(
        parseFilters({ status, checkin: "checked-in" }, hosts).checkIn,
        "all",
        String(status),
      );
    }
  });

  it("goes into the address only on the Approved tab, keeping the host and page", () => {
    const base = {
      status: "approved",
      host: "host-01",
      checkIn: "checked-in",
      page: 2,
    } as const;
    assert.equal(
      dashboardHref(base),
      "/admin?status=approved&host=host-01&checkin=checked-in&page=2",
    );
    assert.equal(
      dashboardHref({ ...base, checkIn: "all" }),
      "/admin?status=approved&host=host-01&page=2",
    );
    assert.equal(
      dashboardHref({ ...base, status: "rejected" }),
      "/admin?status=rejected&host=host-01&page=2",
      "dropped off the Approved tab",
    );
  });

  it("means has or hasn't checked in for the query", () => {
    assert.equal(checkInToFlag("all"), undefined);
    assert.equal(checkInToFlag("checked-in"), true);
    assert.equal(checkInToFlag("not-checked-in"), false);
  });
});
