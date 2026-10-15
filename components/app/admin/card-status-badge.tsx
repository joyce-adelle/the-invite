import { Badge } from "@/components/ui/badge";
import type { CardStatus } from "@/types/guest";

const CARD: Record<CardStatus, { label: string; variant: "secondary" | "success" | "destructive" }> = {
  NOT_SENT: { label: "Not sent", variant: "secondary" },
  SENT: { label: "Sent", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
};

export function CardStatusBadge({ status }: { status: CardStatus }) {
  const { label, variant } = CARD[status];
  return <Badge variant={variant}>{label}</Badge>;
}
