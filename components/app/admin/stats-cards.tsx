import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardCounts } from "@/lib/data/guests";

const STATS = [
  { key: "total", label: "Total requests" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "CANCELLED", label: "Cancelled" },
] as const;

export function StatsCards({ counts }: { counts: Pick<DashboardCounts, "total" | "byStatus"> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {STATS.map(({ key, label }) => {
        const value = key === "total" ? counts.total : counts.byStatus[key];
        const needsAttention = key === "PENDING" && value > 0;
        return (
          <Card
            key={key}
            size="sm"
            className={cn(
              "first:col-span-2 sm:first:col-span-1",
              needsAttention && "ring-gold/60",
            )}
          >
            <CardContent>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {label}
              </dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
            </CardContent>
          </Card>
        );
      })}
    </dl>
  );
}
