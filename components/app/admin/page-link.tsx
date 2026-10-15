import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { dashboardHref, type DashboardFilters } from "@/lib/admin-filters";
import { cn } from "@/lib/utils";

/** An icon button that links to another page of the guest list, or sits inert at either end. */
export function PageLink({
  filters,
  page,
  disabled,
  label,
  children,
}: {
  filters: DashboardFilters;
  page: number;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = buttonVariants({ variant: "outline", size: "icon-sm" });

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className={cn(className, "pointer-events-none opacity-50")}
      >
        {children}
      </span>
    );
  }

  return (
    <Link href={dashboardHref({ ...filters, page })} aria-label={label} className={className}>
      {children}
    </Link>
  );
}
