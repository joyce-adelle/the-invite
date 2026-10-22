-- Door counts for guests with printed (physical) cards: one row per entry, undone
-- entries kept as history (prisma/schema.prisma, lib/data/physical-check-in.ts).

-- CreateTable
CREATE TABLE "physical_arrivals" (
    "id" UUID NOT NULL,
    "table_number" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "recorded_by" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMPTZ(3),
    "undone_by" TEXT,
    CONSTRAINT "physical_arrivals_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "physical_arrivals_table_number_undone_at_idx" ON "physical_arrivals"("table_number", "undone_at");
-- CreateIndex
CREATE INDEX "physical_arrivals_recorded_at_idx" ON "physical_arrivals"("recorded_at");
-- AddForeignKey
ALTER TABLE "physical_arrivals" ADD CONSTRAINT "physical_arrivals_table_number_fkey" FOREIGN KEY ("table_number") REFERENCES "tables"("number") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "physical_arrivals" ADD CONSTRAINT "physical_arrivals_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "physical_arrivals" ADD CONSTRAINT "physical_arrivals_undone_by_fkey" FOREIGN KEY ("undone_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every entry counts at least one person; an undo records when and by whom, together.
ALTER TABLE "physical_arrivals" ADD CONSTRAINT "physical_arrivals_count_positive" CHECK ("count" > 0);
ALTER TABLE "physical_arrivals" ADD CONSTRAINT "physical_arrivals_undone_together" CHECK (("undone_at" IS NULL) = ("undone_by" IS NULL));
