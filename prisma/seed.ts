// Seeds the hosts and their tables, and the first admin. Run with `npm run db:seed`.
//
// Safe to re-run: hosts are upserted by id and tables by number, so names,
// capacities and table assignments are updated in place. Hosts or tables
// removed from this list are NOT deleted, because guests may reference them.

import { upsertAdmin } from "../lib/admin-account";
import { prisma } from "../lib/prisma";

// Every table seats the same number of guests; a host's capacity is
// tables × TABLE_SIZE.
const TABLE_SIZE = 10;
const TOTAL_TABLES = 80;

type SeedHost = {
  /** Stable slug stored on every guest; don't change it once guests exist. */
  id: string;
  name: string;
  /** Number of tables. */
  tables: number;
};

// Dummy data: replace names and table counts before the event.
// Tables are numbered 1–{TOTAL_TABLES} in list order, so reordering hosts or
// changing counts renumbers the tables after them. Finalise this before
// seeding a database that holds real guests.
const hosts: SeedHost[] = [
  { id: "host-01", name: "Host One's Guests", tables: 10 },
  { id: "host-02", name: "Host Two's Guests", tables: 9 },
  { id: "host-03", name: "Host Three's Guests", tables: 10 },
  { id: "host-04", name: "Host Four's Guests", tables: 8 },
  { id: "host-05", name: "Host Five's Guests", tables: 8 },
  { id: "host-06", name: "Host Six's Guests", tables: 7 },
  { id: "host-07", name: "Host Seven's Guests", tables: 7 },
  { id: "host-08", name: "Host Eight's Guests", tables: 6 },
  { id: "host-09", name: "Host Nine's Guests", tables: 5 },
  { id: "host-10", name: "Host Ten's Guests", tables: 6 },
  { id: "host-11", name: "Host Eleven's Guests", tables: 3 },
  { id: "host-12", name: "Host Twelve's Guests", tables: 1 },
];

// Assign consecutive table numbers in list order.
function plan() {
  let next = 1;
  return hosts.map((host) => {
    const numbers = Array.from({ length: host.tables }, () => next++);
    return { id: host.id, name: host.name, capacity: host.tables * TABLE_SIZE, numbers };
  });
}

// Catch mistakes before touching the database.
function validate() {
  const ids = new Set<string>();
  for (const host of hosts) {
    if (ids.has(host.id)) throw new Error(`Duplicate host id: ${host.id}`);
    ids.add(host.id);
    if (!Number.isInteger(host.tables) || host.tables < 1) {
      throw new Error(`${host.id}: tables must be a positive integer`);
    }
  }
  const total = hosts.reduce((sum, host) => sum + host.tables, 0);
  if (total !== TOTAL_TABLES) {
    throw new Error(`Hosts have ${total} tables in total; expected ${TOTAL_TABLES}`);
  }
}

async function main() {
  validate();
  await prisma.$transaction(async (tx) => {
    for (const { numbers, ...host } of plan()) {
      await tx.host.upsert({ where: { id: host.id }, create: host, update: host });
      for (const number of numbers) {
        const data = { number, capacity: TABLE_SIZE, hostId: host.id };
        await tx.table.upsert({ where: { number }, create: data, update: data });
      }
    }
  });
  console.log(
    `Seeded ${hosts.length} hosts, ${TOTAL_TABLES} tables, ${TOTAL_TABLES * TABLE_SIZE} seats.`,
  );
}

/**
 * The admin account, from ADMIN_USERNAME / ADMIN_PASSWORD (and optionally
 * ADMIN_EMAIL). Skipped when neither is set, so hosts can be seeded alone. Run
 * it again with a new ADMIN_PASSWORD to change that admin's password.
 */
async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username && !password) {
    console.log("No ADMIN_USERNAME / ADMIN_PASSWORD set: no admin account made or changed.");
    return;
  }
  if (!username || !password) {
    throw new Error("Set both ADMIN_USERNAME and ADMIN_PASSWORD to seed an admin, or neither.");
  }
  const result = await upsertAdmin(prisma, { username, password, email: process.env.ADMIN_EMAIL });
  console.log(
    {
      created: `Created admin "${username}".`,
      "password-changed": `Changed the password of admin "${username}" (their sessions were ended).`,
      "re-enabled": `Re-enabled admin "${username}", which had been disabled.`,
      unchanged: `Admin "${username}" already exists with that password.`,
    }[result],
  );
}

main()
  .then(seedAdmin)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
