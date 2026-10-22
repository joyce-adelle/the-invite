-- Host management (/admin/hosts): event-wide table settings, hosts that can be
-- hidden from the public page, and tables that can be unassigned.

-- AlterTable
ALTER TABLE "hosts" ADD COLUMN "accepting_requests" BOOLEAN NOT NULL DEFAULT true;

-- A table may be given to no host for a while, then given to one again.
-- AlterTable
ALTER TABLE "tables" ALTER COLUMN "host_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "event_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "max_tables" INTEGER NOT NULL,
    "seats_per_table" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "event_settings_pkey" PRIMARY KEY ("id")
);

-- One row only, and sensible numbers.
ALTER TABLE "event_settings" ADD CONSTRAINT "event_settings_single_row" CHECK ("id" = 1);
ALTER TABLE "event_settings" ADD CONSTRAINT "event_settings_positive" CHECK ("max_tables" > 0 AND "seats_per_table" > 0);

-- Start from what's already there (the seeds then set it explicitly): as many
-- tables as the highest number in use, or 80, at the most common table size,
-- or 10.
INSERT INTO "event_settings" ("id", "max_tables", "seats_per_table", "updated_at")
VALUES (
  1,
  COALESCE((SELECT MAX("number") FROM "tables"), 80),
  COALESCE((SELECT "capacity" FROM "tables" GROUP BY "capacity" ORDER BY COUNT(*) DESC, "capacity" LIMIT 1), 10),
  CURRENT_TIMESTAMP
);
