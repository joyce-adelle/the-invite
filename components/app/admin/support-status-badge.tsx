import { Badge } from "@/components/ui/badge";
import type { SupportRequestStatus } from "@/types/support";

export function SupportStatusBadge({ status }: { status: SupportRequestStatus }) {
  return status === "OPEN" ? (
    <Badge variant="secondary">Open</Badge>
  ) : (
    <Badge variant="success">Resolved</Badge>
  );
}
