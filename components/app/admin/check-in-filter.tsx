"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHECK_IN_VIEWS,
  CHECK_IN_VIEW_LABELS,
  dashboardHref,
  type CheckInView,
  type DashboardFilters,
} from "@/lib/admin-filters";

/** Checked in or not yet, for the Approved tab. */
export function CheckInFilter({ filters }: { filters: DashboardFilters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="check-in-filter" className="text-muted-foreground">
        Check-in
      </Label>
      <Select
        value={filters.checkIn}
        onValueChange={(checkIn) =>
          startTransition(() =>
            router.push(dashboardHref({ ...filters, checkIn: checkIn as CheckInView, page: 1 })),
          )
        }
      >
        <SelectTrigger id="check-in-filter" size="sm" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CHECK_IN_VIEWS.map((view) => (
            <SelectItem key={view} value={view}>
              {CHECK_IN_VIEW_LABELS[view]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
    </div>
  );
}
