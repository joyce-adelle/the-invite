import { Inbox } from "lucide-react";

import { SupportRequestRow } from "@/components/app/admin/support-request-row";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SupportView } from "@/lib/support-filters";
import type { SupportRequest } from "@/types/support";

const EMPTY: Record<SupportView, { title: string; hint: string }> = {
  open: { title: "No open help requests", hint: "Messages from guests will appear here." },
  resolved: { title: "Nothing resolved yet", hint: "Requests you mark as resolved are listed here." },
  all: { title: "No help requests yet", hint: "Messages from guests will appear here." },
};

export function SupportList({
  requests,
  view,
  total,
}: {
  requests: SupportRequest[];
  view: SupportView;
  /** Matching requests in all, to say so when the list is cut short. */
  total: number;
}) {
  if (requests.length === 0) {
    const { title, hint } = EMPTY[view];
    return (
      <Card className="items-center py-12 text-center">
        <Inbox className="size-8 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">From</TableHead>
            <TableHead className="hidden md:table-cell">Issue</TableHead>
            <TableHead className="hidden md:table-cell">Message</TableHead>
            <TableHead className="hidden md:table-cell">Received</TableHead>
            <TableHead className="hidden md:table-cell">Status</TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <SupportRequestRow key={request.id} request={request} />
          ))}
        </TableBody>
      </Table>
      {total > requests.length && (
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Showing the newest {requests.length} of {total}.
        </p>
      )}
    </Card>
  );
}
