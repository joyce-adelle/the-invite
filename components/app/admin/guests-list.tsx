import { GuestRow } from "@/components/app/admin/guest-row";
import { GuestsEmptyState } from "@/components/app/admin/guests-empty-state";
import { GuestsPagination } from "@/components/app/admin/guests-pagination";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  checkInToFlag,
  PAGE_SIZE,
  viewToStatus,
  type DashboardFilters,
} from "@/lib/admin-filters";
import { getAdminGuests } from "@/lib/data/guests";
import type { TableOccupancy } from "@/types/hosts";

export async function GuestsList({
  filters,
  hostName,
  tablesByHost,
  hosts,
}: {
  filters: DashboardFilters;
  hostName?: string;
  tablesByHost: Record<string, TableOccupancy[]>;
  hosts: { id: string; name: string }[];
}) {
  const { guests, ...pageInfo } = await getAdminGuests(
    {
      status: viewToStatus(filters.status),
      invitedBy: filters.host === "all" ? undefined : filters.host,
      checkedIn: checkInToFlag(filters.checkIn),
    },
    { page: filters.page, pageSize: PAGE_SIZE },
  );

  if (guests.length === 0)
    return <GuestsEmptyState filters={filters} hostName={hostName} />;

  const approvedView = filters.status === "approved";

  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Guest</TableHead>
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead className="hidden sm:table-cell">Guest Type</TableHead>
            {approvedView ? (
              <>
                <TableHead>Table</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead className="hidden lg:table-cell">Approved</TableHead>
              </>
            ) : (
              <>
                <TableHead className="hidden lg:table-cell">
                  Requested
                </TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
              </>
            )}
            <TableHead className="pr-4 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {guests.map((guest) => (
            <GuestRow
              key={guest.id}
              guest={guest}
              approvedView={approvedView}
              tables={tablesByHost[guest.invitedBy] ?? []}
              hosts={hosts}
            />
          ))}
        </TableBody>
      </Table>
      <GuestsPagination filters={filters} {...pageInfo} />
    </Card>
  );
}
