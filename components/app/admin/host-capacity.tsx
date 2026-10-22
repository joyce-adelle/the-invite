import { HostTablesDialog } from "@/components/app/admin/host-tables-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardCounts } from "@/lib/data/guests";

/**
 * Approved guests against each host's digital places. Seats at physical tables
 * are taken by printed cards, so they're shown separately and never counted as
 * free. Pending requests are not counted as used.
 */
export function HostCapacity({ hosts }: { hosts: DashboardCounts["hosts"] }) {
  if (hosts.length === 0) {
    return <p className="text-sm text-muted-foreground">No hosts are configured yet.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {hosts.map((host) => {
        const allPhysical = host.digitalCapacity === 0;
        const percent =
          host.digitalCapacity > 0 ? Math.min(100, (host.approved / host.digitalCapacity) * 100) : 0;
        const full = !allPhysical && host.remaining === 0;
        return (
          <li key={host.hostId}>
            <Card size="sm" className="h-full">
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{host.name}</h3>
                  {allPhysical ? (
                    <Badge variant="outline">Physical only</Badge>
                  ) : (
                    full && <Badge variant="destructive">Full</Badge>
                  )}
                </div>
                <div
                  role="progressbar"
                  aria-label={`${host.name} digital places used`}
                  aria-valuemin={0}
                  aria-valuemax={host.digitalCapacity}
                  aria-valuenow={host.approved}
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={full ? "h-full bg-destructive" : "h-full bg-primary"}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <span className="tabular-nums">
                    <strong className="font-semibold">{host.approved}</strong> / {host.digitalCapacity} digital
                  </span>
                  <span className="text-muted-foreground tabular-nums">{host.remaining} remaining</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {host.physicalSeats > 0 ? `${host.physicalSeats} physical · ` : ""}
                    {host.capacity} guests in all
                  </span>
                  <HostTablesDialog hostName={host.name} tables={host.tables} />
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
