import "./no-email"; // first: nothing here may send real email
import "dotenv/config";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import { handleInvitationRequest } from "@/lib/invitation-request";
import { prisma } from "@/lib/prisma";

// What a guest sees after sending a request: a saved request and a name that
// is already registered each go to a page of their own, and everything else
// stays on the form. Own host (id "test-redirect"), removed afterwards, so
// only against a local database.
const url = process.env.DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const HOST_ID = "test-redirect";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const submit = (values: Record<string, string>) => handleInvitationRequest(form(values));

describe("where a request leads", { skip: !isLocal && "DATABASE_URL is not a local database" }, () => {
  const removeFixtures = async () => {
    await prisma.guest.deleteMany({ where: { invitedBy: HOST_ID } });
    await prisma.table.deleteMany({ where: { hostId: HOST_ID } });
    await prisma.host.deleteMany({ where: { id: HOST_ID } });
  };

  before(async () => {
    await removeFixtures();
    await prisma.host.create({
      data: { id: HOST_ID, name: "Redirect Family", capacity: 1, tables: { create: [{ number: 9401, capacity: 1 }] } },
    });
  });
  beforeEach(() => {
    mock.method(console, "error", () => {});
  });
  afterEach(() => mock.restoreAll());
  after(async () => {
    await removeFixtures();
    await prisma.$disconnect();
  });

  it("sends a saved request to the received page", async () => {
    assert.deepEqual(await submit({ name: "Zzredirect Ada", email: "ada@redirect-test.invalid", hostId: HOST_ID }), {
      goto: { hostId: HOST_ID, page: "received" },
    });
    assert.equal(await prisma.guest.count({ where: { invitedBy: HOST_ID } }), 1);
  });

  it("sends a name that is already registered to the help page, keeping the form behind it", async () => {
    assert.deepEqual(await submit({ name: "zzredirect  ADA", email: "other@redirect-test.invalid", hostId: HOST_ID }), {
      goto: { hostId: HOST_ID, page: "help" },
    });
    assert.equal(await prisma.guest.count({ where: { invitedBy: HOST_ID } }), 1, "no second guest is made");
  });

  it("keeps a host with no invitations left on the form, which shows that instead", async () => {
    await prisma.host.update({ where: { id: HOST_ID }, data: { capacity: 1 } });
    await prisma.guest.update({
      where: { normalizedName: "zzredirectada" },
      data: { status: "APPROVED", tableNumber: 9401, approvedAt: new Date() },
    });
    const outcome = await submit({ name: "Zzredirect Cy", email: "cy@redirect-test.invalid", hostId: HOST_ID });
    assert.ok("state" in outcome && outcome.state.hostFull);
  });

  it("keeps invalid input on the form, with the field errors", async () => {
    const outcome = await submit({ name: "", email: "nope", hostId: HOST_ID });
    assert.ok("state" in outcome);
    assert.ok(outcome.state.fieldErrors?.name && outcome.state.fieldErrors?.email);
  });

  it("keeps an unknown host on the form with a message", async () => {
    const outcome = await submit({ name: "Zzredirect Bo", email: "bo@redirect-test.invalid", hostId: "no-such-host" });
    assert.ok("state" in outcome);
    assert.ok(outcome.state.message);
  });
});

describe("the pages after a request", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("have a Back link, and no other way back", () => {
    const received = read("app/invite/[hostId]/received/page.tsx") + read("components/app/invitation/result-page.tsx");
    assert.match(received, /backTo="start"/);
    assert.match(read("components/app/invitation/result-page.tsx"), /Back<\/BackLink>/);
    assert.doesNotMatch(read("components/app/invitation/request-confirmation.tsx"), /Back to the start/);
  });

  it("go back to the host's form from the help page and to the start from the received page", () => {
    assert.match(read("app/invite/[hostId]/help/page.tsx"), /backTo="form"/);
    assert.match(read("app/invite/[hostId]/received/page.tsx"), /backTo="start"/);
  });

  it("keep the guest's details out of the address: the action only uses the host and the page", () => {
    const action = read("lib/actions/invitation.ts");
    assert.match(action, /redirect\(`\/invite\/\$\{hostId\}\/\$\{page\}`/);
    assert.doesNotMatch(action, /redirect\([^)]*(email|name)/);
  });
});
