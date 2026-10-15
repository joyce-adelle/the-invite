import { Badge } from "@/components/ui/badge";
import type { GuestStatus } from "@/types/guest";

const STATUS: Record<
  GuestStatus,
  { label: string; variant: "secondary" | "success" | "destructive" | "outline" }
> = {
  PENDING: { label: "Pending", variant: "secondary" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

export function GuestStatusBadge({ status }: { status: GuestStatus }) {
  const { label, variant } = STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
