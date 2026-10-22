import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { AssignTableToHost } from "@/components/app/admin/hosts/assign-table";
import { AddHostButton } from "@/components/app/admin/hosts/add-host-button";
import { TableSettingsButton } from "@/components/app/admin/hosts/table-settings-button";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/admin-session";
import { getHostsOverview } from "@/lib/data/host-admin";
import { cn } from "@/lib/utils";

/** Super admins only: every host, its tables and guests, and the tables nobody has yet. */
export async function HostsOverview() {
  await requireSuperAdmin();
  const { settings, hosts, unassigned } = await getHostsOverview();

  const assigned = hosts.reduce((sum, h) => sum + h.tables.length, 0);
  const physical = hosts.reduce((sum, h) => sum + h.tables.filter((t) => t.cardType === "PHYSICAL").length, 0);
  const hostOptions = hosts.map((h) => ({ id: h.id, name: h.name }));
  const stats = [
    { label: "Tables", value: `${assigned} / ${settings.maxTables}`, hint: `${settings.seatsPerTable} seats each` },
    { label: "Physical tables", value: physical, hint: `${physical * settings.seatsPerTable} seats` },
    { label: "Digital tables", value: assigned - physical, hint: `${(assigned - physical) * settings.seatsPerTable} seats` },
    { label: "Unassigned", value: unassigned.length, hint: "free to give to a host" },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Hosts"
        description="Who guests are celebrating with, and the tables each host has. A host's guest count is always its tables × seats per table."
        actions={
          <>
            <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <ArrowLeft aria-hidden /> Dashboard
            </Link>
            <TableSettingsButton maxTables={settings.maxTables} seatsPerTable={settings.seatsPerTable} />
            <AddHostButton />
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm">
            <CardContent>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{stat.value}</dd>
              <dd className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</dd>
            </CardContent>
          </Card>
        ))}
      </dl>

      <section aria-labelledby="hosts-heading" className="space-y-4">
        <h2 id="hosts-heading" className="text-lg font-semibold">
          Hosts <span className="text-sm font-normal text-muted-foreground">({hosts.length})</span>
        </h2>
        {hosts.length === 0 ? (
          <Card className="items-center py-12 text-center">
            <p className="font-medium">No hosts yet</p>
            <p className="text-sm text-muted-foreground">Add one, then give it tables.</p>
          </Card>
        ) : (
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Host</TableHead>
                  <TableHead>Tables</TableHead>
                  <TableHead className="hidden md:table-cell">Guests</TableHead>
                  <TableHead className="hidden lg:table-cell">Approved</TableHead>
                  <TableHead className="hidden lg:table-cell">Pending</TableHead>
                  <TableHead className="hidden xl:table-cell">Checked in</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Manage</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.map((host) => {
                  const physicalTables = host.tables.filter((t) => t.cardType === "PHYSICAL").length;
                  return (
                    <TableRow key={host.id}>
                      <TableCell className="pl-4 whitespace-normal">
                        <Link href={`/admin/hosts/${host.id}`} className="font-medium hover:text-primary hover:underline">
                          {host.name}
                        </Link>
                        {!host.acceptingRequests && (
                          <Badge variant="outline" className="ml-2">
                            Hidden
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="tabular-nums">{host.tables.length}</span>
                        {host.tables.length > 0 && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {physicalTables} physical · {host.tables.length - physicalTables} digital
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">{host.capacity}</TableCell>
                      <TableCell className="hidden tabular-nums lg:table-cell">{host.guests.approved}</TableCell>
                      <TableCell className="hidden tabular-nums lg:table-cell">{host.guests.pending}</TableCell>
                      <TableCell className="hidden tabular-nums xl:table-cell">{host.guests.checkedIn}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <Link
                          href={`/admin/hosts/${host.id}`}
                          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                          aria-label={`Manage ${host.name}`}
                        >
                          Manage <ChevronRight aria-hidden />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <section aria-labelledby="unassigned-heading" className="space-y-4">
        <div>
          <h2 id="unassigned-heading" className="text-lg font-semibold">
            Unassigned tables <span className="text-sm font-normal text-muted-foreground">({unassigned.length})</span>
          </h2>
          <p className="text-sm text-muted-foreground">Tables no host has. Give one to a host to add its seats to theirs.</p>
        </div>
        {unassigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every table belongs to a host.</p>
        ) : (
          <Card className="gap-0 py-0">
            <Table>
              <TableBody>
                {unassigned.map((table) => (
                  <TableRow key={table.number}>
                    <TableCell className="pl-4 font-medium tabular-nums">Table {table.number}</TableCell>
                    <TableCell>
                      <Badge variant={table.cardType === "PHYSICAL" ? "outline" : "secondary"}>
                        {table.cardType === "PHYSICAL" ? "Physical" : "Digital"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-4">
                      <AssignTableToHost tableNumber={table.number} hosts={hostOptions} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
