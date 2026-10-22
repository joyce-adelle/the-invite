import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";

import { AddTableToHost, AssignTableToHost } from "@/components/app/admin/hosts/assign-table";
import { HostActions } from "@/components/app/admin/hosts/host-actions";
import { TableTypeButton } from "@/components/app/admin/hosts/table-type-button";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dashboardHref } from "@/lib/admin-filters";
import { requireAdmin } from "@/lib/admin-session";
import { getHostSummary } from "@/lib/data/host-admin";
import { cn } from "@/lib/utils";

/** Admins only: one host's overview, its tables, and everything that can be changed about it. */
export async function HostDetail({ params }: { params: PageProps<"/admin/hosts/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  const found = await getHostSummary(id);
  if (!found) notFound();
  const { host, overview } = found;

  const digitalPlaces = Math.max(0, host.capacity - host.physicalSeats);
  const guestRecords = host.guests.pending + host.guests.approved + host.guests.rejected + host.guests.cancelled;
  const others = overview.hosts.filter((h) => h.id !== host.id).map((h) => ({ id: h.id, name: h.name }));
  const stats = [
    { label: "Guests", value: host.capacity, hint: `${host.tables.length} tables × ${overview.settings.seatsPerTable}` },
    { label: "Physical seats", value: host.physicalSeats, hint: "printed cards" },
    { label: "Digital places", value: digitalPlaces, hint: `${Math.max(0, digitalPlaces - host.guests.approved)} left` },
    { label: "Approved", value: host.guests.approved, hint: `${host.guests.checkedIn} checked in` },
    { label: "Pending", value: host.guests.pending, hint: "waiting for review" },
    { label: "Rejected / cancelled", value: host.guests.rejected + host.guests.cancelled, hint: "kept as history" },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={
          <Link href="/admin/hosts" className="inline-flex items-center gap-1 hover:text-primary">
            <ArrowLeft className="size-3" aria-hidden /> Hosts
          </Link>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {host.name}
            {host.acceptingRequests ? (
              <Badge variant="success">Taking requests</Badge>
            ) : (
              <Badge variant="outline">Hidden from public page</Badge>
            )}
          </span>
        }
        description={`Web address: /invite/${host.id}`}
        actions={
          <HostActions
            host={{
              id: host.id,
              name: host.name,
              acceptingRequests: host.acceptingRequests,
              guestRecords,
              tables: host.tables.length,
            }}
          />
        }
      />

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm">
            <CardContent>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{stat.value}</dd>
              <dd className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</dd>
            </CardContent>
          </Card>
        ))}
      </dl>

      <Link
        href={dashboardHref({ status: "all", host: host.id, checkIn: "all", page: 1 })}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <Users aria-hidden /> View guests
      </Link>

      <section aria-labelledby="tables-heading" className="space-y-4">
        <div>
          <h2 id="tables-heading" className="text-lg font-semibold">
            Tables <span className="text-sm font-normal text-muted-foreground">({host.tables.length})</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Physical tables use printed cards, so their seats are taken and nobody is seated there online.
            A table with approved guests can&apos;t move or become physical until they are moved to another
            table (Change table on the dashboard).
          </p>
        </div>

        {host.tables.length > 0 && (
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Table</TableHead>
                  <TableHead>Cards</TableHead>
                  <TableHead>Seated</TableHead>
                  <TableHead>
                    <span className="sr-only">Card type</span>
                  </TableHead>
                  <TableHead className="pr-4 text-right">Move to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {host.tables.map((table) => (
                  <TableRow key={table.number}>
                    <TableCell className="pl-4 font-medium tabular-nums">Table {table.number}</TableCell>
                    <TableCell>
                      <Badge variant={table.cardType === "PHYSICAL" ? "outline" : "secondary"}>
                        {table.cardType === "PHYSICAL" ? "Physical" : "Digital"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {table.cardType === "PHYSICAL" ? (
                        <span className="text-muted-foreground">{table.capacity} printed</span>
                      ) : (
                        `${table.seated} / ${table.capacity}`
                      )}
                    </TableCell>
                    <TableCell>
                      <TableTypeButton tableNumber={table.number} cardType={table.cardType} />
                    </TableCell>
                    <TableCell className="pr-4">
                      <AssignTableToHost
                        tableNumber={table.number}
                        hosts={others}
                        currentHostId={host.id}
                        allowNone
                        label="Move to…"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Add a table</h3>
          <AddTableToHost hostId={host.id} free={overview.unassigned} />
        </div>
      </section>
    </div>
  );
}
