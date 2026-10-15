-- AlterTable: added nullable so existing rows can be backfilled first.
ALTER TABLE "guests" ADD COLUMN "normalized_name" TEXT;

-- Backfill: lowercase alphanumerics of "name", mirroring normalizeName() in lib/utils.ts.
-- Rows are visited oldest first. When a value is already taken the next free numeric
-- suffix is used ("janedoe", "janedoe2", …), so no row is deleted and no "name" is changed.
DO $$
DECLARE
  g RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR g IN SELECT id, name FROM "guests" ORDER BY created_at, id LOOP
    base := lower(regexp_replace(normalize(g.name, NFC), '[^[:alnum:]]', '', 'g'));
    IF base = '' THEN
      base := 'guest';
    END IF;

    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "guests" WHERE normalized_name = candidate) LOOP
      n := n + 1;
      candidate := base || n;
    END LOOP;

    UPDATE "guests" SET normalized_name = candidate WHERE id = g.id;
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "guests" ALTER COLUMN "normalized_name" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "guests_normalized_name_key" ON "guests"("normalized_name");
