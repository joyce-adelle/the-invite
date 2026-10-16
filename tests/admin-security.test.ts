import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Server actions are public POST endpoints, so who may call them is decided by
// the code inside them. These can't run an action without a real request and
// session, so they guard the structure instead: nothing in the admin actions
// can run, and no email can be sent, before the session has been checked.

const actions = readFileSync("lib/actions/admin.ts", "utf8");

/** The body of an exported function, up to the next top-level declaration. */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = source.slice(start + 1).search(/\n(?:export |async function |function |\/\*\*)/);
  return source.slice(start, next < 0 ? undefined : start + 1 + next);
}

describe("who can use the admin actions", () => {
  const names = [...actions.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]);

  it("finds the admin actions, including resend and approve", () => {
    assert.ok(names.includes("resendAccessCardAction"));
    assert.ok(names.includes("approveGuestAction"));
    assert.ok(names.includes("changeGuestTableAction"));
    assert.ok(names.length >= 6, names.join(", "));
  });

  it("makes every admin action check for a signed-in admin before doing anything", () => {
    for (const name of names) {
      const body = bodyOf(actions, name);
      const check = body.search(/requireAdmin\(\)|\brun\(/);
      assert.ok(check >= 0, `${name} checks the admin session (directly or through run())`);
      // Nothing that reads, writes or sends comes before the check.
      // (Pure checks such as validating an input are fine; reading, writing or awaiting anything is not.)
      const before = body.slice(0, check);
      assert.doesNotMatch(before, /await\s+[A-Za-z]/, `${name} awaits nothing before its check`);
    }
  });

  it("has run() check the session before it validates, reads, writes or sends anything", () => {
    const run = bodyOf(actions, "run");
    const check = run.indexOf("await requireAdmin()");
    assert.ok(check >= 0);
    for (const later of ["safeParse(", "operation(", "revalidatePath("]) {
      assert.ok(run.indexOf(later) > check, `${later} comes after the session check`);
    }
  });

  it("sends resend and every other card email through run(), so a signed-out caller can't trigger one", () => {
    for (const name of ["resendAccessCardAction", "approveGuestAction", "changeGuestTableAction"]) {
      assert.match(bodyOf(actions, name), /run\(|requireAdmin\(\)/, name);
    }
    // The email functions are only reachable from here and from the flows they serve.
    for (const file of ["lib/access-card.ts", "lib/email.ts"]) {
      assert.match(readFileSync(file, "utf8"), /^import "server-only";/, `${file} can't be imported by client code`);
    }
  });

  it("has the card download route check the session too", () => {
    const route = readFileSync("app/admin/guests/[id]/access-card/route.ts", "utf8");
    assert.match(route, /getAdminSession\(\)/);
    assert.ok(route.indexOf("getAdminSession()") < route.indexOf("createGuestAccessCard("), "session first, then the card");
    assert.match(route, /problem\(401/);
  });

  it("keeps the whole admin area behind the sign-in redirect", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    assert.match(proxy, /\/admin\/:path\*/);
    assert.match(proxy, /\/admin\/login/);
  });
});
