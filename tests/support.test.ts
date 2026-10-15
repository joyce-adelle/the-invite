import "dotenv/config";

import assert from "node:assert/strict";
import { after, afterEach, before, describe, it, mock } from "node:test";

import { submitSupportRequest } from "@/lib/actions/support";
import {
  createSupportRequest,
  getSupportCounts,
  getSupportNotifications,
  getSupportRequests,
  resolveSupportRequest,
} from "@/lib/data/support";
import { prisma } from "@/lib/prisma";

// These tests write to the database in DATABASE_URL, so they only run against
// a local one. Everything they create uses TEST_DOMAIN and is deleted afterwards.
const TEST_DOMAIN = "@support-test.invalid";
const url = process.env.DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const input = (suffix: string, extra: Record<string, string> = {}) => ({
  name: "Test Guest",
  email: `${suffix}${TEST_DOMAIN}`,
  issueType: "CARD_NOT_RECEIVED",
  message: "Where is my card?",
  ...extra,
});

const IDLE = { status: "idle" } as const;

// Prisma's model objects can't be patched in place, so swap the whole model.
// Everything swapped is put back after each test.
const restores: (() => void)[] = [];
function replaceModel(name: "guest" | "invitationSupportRequest", fake: object) {
  const real = prisma[name];
  const define = (value: object) =>
    Object.defineProperty(prisma, name, { value, configurable: true, writable: true });
  define(fake);
  restores.push(() => define(real));
}
const testRows = () =>
  prisma.invitationSupportRequest.findMany({ where: { email: { endsWith: TEST_DOMAIN } } });

describe("support requests (database)", { skip: !isLocal && "DATABASE_URL is not a local database" }, () => {
  const clean = () =>
    prisma.invitationSupportRequest.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });

  before(clean);
  afterEach(() => {
    mock.restoreAll();
    while (restores.length) restores.pop()!();
  });
  after(async () => {
    await clean();
    await prisma.$disconnect();
  });

  describe("submitSupportRequest", () => {
    it("saves a valid request as OPEN with a normalized email", async () => {
      const result = await submitSupportRequest(IDLE, form(input("save", { email: `  SAVE${TEST_DOMAIN} ` })));
      assert.deepEqual(result, { status: "success" });

      const [row, ...rest] = await testRows();
      assert.equal(rest.length, 0);
      assert.equal(row.email, `save${TEST_DOMAIN}`);
      assert.equal(row.name, "Test Guest");
      assert.equal(row.issueType, "CARD_NOT_RECEIVED");
      assert.equal(row.message, "Where is my card?");
      assert.equal(row.status, "OPEN");
      assert.ok(row.createdAt instanceof Date && row.updatedAt instanceof Date);
    });

    it("returns field errors and saves nothing for invalid input", async () => {
      const result = await submitSupportRequest(
        IDLE,
        form(input("invalid", { name: "", email: `not-an-email`, issueType: "HACK" })),
      );
      assert.equal(result.status, "error");
      assert.ok(result.status === "error" && result.fieldErrors?.name);
      assert.ok(result.status === "error" && result.fieldErrors?.email);
      assert.ok(result.status === "error" && result.fieldErrors?.issueType);
      assert.equal((await testRows()).filter((row) => row.email.startsWith("invalid")).length, 0);
    });

    it("ignores fields the form doesn't have, such as a forged status", async () => {
      await submitSupportRequest(IDLE, form(input("forged", { status: "RESOLVED", id: "x" })));
      const row = (await testRows()).find((r) => r.email.startsWith("forged"));
      assert.equal(row?.status, "OPEN");
    });

    it("answers the same way however often an email is used", async () => {
      // Nothing about earlier requests, or about guests, may show in the response.
      const first = await submitSupportRequest(IDLE, form(input("repeat")));
      const second = await submitSupportRequest(IDLE, form(input("repeat")));
      assert.deepEqual(first, { status: "success" });
      assert.deepEqual(second, first);
    });

    it("never touches the guests table", async () => {
      replaceModel(
        "guest",
        new Proxy(
          {},
          {
            get() {
              throw new Error("the guests table was accessed");
            },
          },
        ),
      );
      const result = await submitSupportRequest(IDLE, form(input("noguest")));
      assert.deepEqual(result, { status: "success" });
    });

    it("hides database errors from the guest and keeps nothing", async () => {
      mock.method(console, "error", () => {});
      replaceModel("invitationSupportRequest", {
        create: async () => {
          throw new Error('connection to "db.secret-host.internal" refused');
        },
      });
      const result = await submitSupportRequest(IDLE, form(input("dbfail")));
      assert.deepEqual(result, {
        status: "error",
        message: "We couldn't send your message. Please try again.",
      });
      assert.ok(!JSON.stringify(result).includes("secret-host"));
      mock.restoreAll();
      while (restores.length) restores.pop()!();
      assert.equal((await testRows()).filter((row) => row.email.startsWith("dbfail")).length, 0);
    });
  });

  describe("data layer", () => {
    it("lists newest first, filtered by status, with matching counts", async () => {
      const a = await createSupportRequest({ ...input("list-a"), issueType: "OTHER", message: "a" });
      const b = await createSupportRequest({ ...input("list-b"), issueType: "OTHER", message: "b" });
      await resolveSupportRequest(a.id);

      const mine = <T extends { email: string }>(rows: T[]) => rows.filter((r) => r.email.startsWith("list-"));
      assert.deepEqual(mine(await getSupportRequests({ status: "OPEN" })).map((r) => r.id), [b.id]);
      assert.deepEqual(mine(await getSupportRequests({ status: "RESOLVED" })).map((r) => r.id), [a.id]);
      assert.deepEqual(mine(await getSupportRequests()).map((r) => r.id), [b.id, a.id]);

      const counts = await getSupportCounts();
      assert.equal(counts.all, counts.OPEN + counts.RESOLVED);
      assert.ok(counts.OPEN >= 1 && counts.RESOLVED >= 1);
    });

    it("resolves a request, and resolving again is a harmless no-op", async () => {
      const created = await createSupportRequest({ ...input("resolve"), issueType: "OTHER", message: "x" });
      const resolved = await resolveSupportRequest(created.id);
      assert.equal(resolved?.status, "RESOLVED");
      assert.ok(resolved!.updatedAt >= created.updatedAt);

      const again = await resolveSupportRequest(created.id);
      assert.equal(again?.status, "RESOLVED");
      assert.equal(again?.updatedAt.getTime(), resolved?.updatedAt.getTime());
    });

    it("returns null when resolving a request that doesn't exist", async () => {
      assert.equal(await resolveSupportRequest("00000000-0000-4000-8000-000000000000"), null);
    });

    it("feeds the notification bell: open total plus the newest open requests", async () => {
      const created = await createSupportRequest({ ...input("bell"), issueType: "OTHER", message: "ring" });
      const { open, latest } = await getSupportNotifications(3);
      assert.ok(open >= 1);
      assert.ok(latest.length <= 3);
      assert.ok(latest.every((request) => request.status === "OPEN"));
      assert.equal(latest[0].id, created.id);
      assert.equal(latest[0].name, "Test Guest");
      assert.equal(latest[0].message, "ring");

      await resolveSupportRequest(created.id);
      assert.ok(!(await getSupportNotifications(50)).latest.some((r) => r.id === created.id));
    });

    it("has database limits behind the validation", async () => {
      const raw = (extra: object) =>
        prisma.invitationSupportRequest.create({
          data: { name: "T", email: `limit${TEST_DOMAIN}`, issueType: "OTHER", message: "m", ...extra },
        });
      await assert.rejects(raw({ message: "m".repeat(2001) }), /support_message_length|check constraint/i);
      await assert.rejects(raw({ name: "n".repeat(81) }), /support_name_length|check constraint/i);
      await assert.rejects(raw({ name: "" }), /support_name_length|check constraint/i);
      await assert.rejects(raw({ issueType: "HACK" }), /enum|issueType|Invalid/i);
    });
  });
});
