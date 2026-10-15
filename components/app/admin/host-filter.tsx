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
import { dashboardHref, type DashboardFilters } from "@/lib/admin-filters";

export function HostFilter({
  hosts,
  filters,
}: {
  hosts: { id: string; name: string }[];
  filters: DashboardFilters;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="host-filter" className="text-muted-foreground">
        Host
      </Label>
      <Select
        value={filters.host}
        onValueChange={(host) =>
          startTransition(() => router.push(dashboardHref({ ...filters, host, page: 1 })))
        }
      >
        <SelectTrigger id="host-filter" size="sm" className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All hosts</SelectItem>
          {hosts.map((host) => (
            <SelectItem key={host.id} value={host.id}>
              {host.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
    </div>
  );
}
