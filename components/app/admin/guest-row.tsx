import { CardStatusBadge } from "@/components/app/admin/card-status-badge";
import { DateCell } from "@/components/app/admin/date-cell";
import { GuestActions } from "@/components/app/admin/guest-actions";
import { Badge } from "@/components/ui/badge";
import { GuestStatusBadge } from "@/components/app/admin/guest-status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type { AdminGuest } from "@/types/guest";
import type { TableOccupancy } from "@/types/hosts";

/** Must stay in step with the header cells in GuestsList. */
export function GuestRow({
  guest,
  approvedView,
  tables,
  hosts,
}: {
  guest: AdminGuest;
  approvedView: boolean;
  tables: TableOccupancy[];
  hosts: { id: string; name: string }[];
}) {
  return (
    <TableRow>
      <TableCell className="max-w-56 pl-4 whitespace-normal">
        <div className="font-medium">{guest.name}</div>
        <div className="break-all text-xs text-muted-foreground md:hidden">{guest.email}</div>
        <div className="text-xs text-muted-foreground sm:hidden">{guest.hostName}</div>
        <div className="text-xs text-muted-foreground lg:hidden">
          {approvedView ? "Approved" : "Requested"}{" "}
          <DateCell value={approvedView ? guest.approvedAt : guest.createdAt} />
        </div>
        {!approvedView && (
          <div className="mt-1.5 sm:hidden">
            <GuestStatusBadge status={guest.status} />
          </div>
        )}
      </TableCell>
      <TableCell className="hidden break-all md:table-cell">{guest.email}</TableCell>
      <TableCell className="hidden sm:table-cell">{guest.hostName}</TableCell>
      {approvedView ? (
        <>
          <TableCell className="tabular-nums">{guest.tableNumber ?? "—"}</TableCell>
          <TableCell>
            <CardStatusBadge status={guest.cardStatus} />
          </TableCell>
          <TableCell>
            {guest.checkedInAt ? (
              <>
                <Badge variant="success">Checked in</Badge>
                <div className="mt-1 text-xs text-muted-foreground">
                  <DateCell value={guest.checkedInAt} time />
                </div>
              </>
            ) : (
              <Badge variant="secondary">Not yet</Badge>
            )}
          </TableCell>
          <TableCell className="hidden lg:table-cell">
            <DateCell value={guest.approvedAt} />
          </TableCell>
        </>
      ) : (
        <>
          <TableCell className="hidden lg:table-cell">
            <DateCell value={guest.createdAt} />
          </TableCell>
          <TableCell className="hidden sm:table-cell">
            <GuestStatusBadge status={guest.status} />
          </TableCell>
        </>
      )}
      <TableCell className="pr-4 text-right">
        <GuestActions guest={guest} tables={tables} hosts={hosts} />
      </TableCell>
    </TableRow>
  );
}
