-- CreateTable
CREATE TABLE "hosts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "hosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "number" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "host_id" TEXT NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("number")
);

-- CreateIndex
CREATE INDEX "tables_host_id_idx" ON "tables"("host_id");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "hosts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "hosts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_table_number_fkey" FOREIGN KEY ("table_number") REFERENCES "tables"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma's schema language can't express (kept in sync by hand).
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "tables" ADD CONSTRAINT "tables_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "tables" ADD CONSTRAINT "tables_number_positive" CHECK ("number" > 0);
