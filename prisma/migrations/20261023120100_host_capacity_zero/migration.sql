-- A host can now exist with no tables yet (made on /admin/hosts, before any
-- table is given to it), so its capacity, its tables' seats added up, can be 0.
ALTER TABLE "hosts" DROP CONSTRAINT "hosts_capacity_positive";
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_capacity_not_negative" CHECK ("capacity" >= 0);
