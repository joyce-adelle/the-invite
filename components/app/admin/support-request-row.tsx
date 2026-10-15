import { DateCell } from "@/components/app/admin/date-cell";
import { ResolveSupportButton } from "@/components/app/admin/resolve-support-button";
import { SupportStatusBadge } from "@/components/app/admin/support-status-badge";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { SUPPORT_ISSUE_SHORT_LABELS } from "@/lib/support";
import { SupportRequestStatus, type SupportRequest } from "@/types/support";

/** Must stay in step with the header cells in SupportList. */
export function SupportRequestRow({ request }: { request: SupportRequest }) {
  const issue = SUPPORT_ISSUE_SHORT_LABELS[request.issueType];
  const message = request.message || null;

  return (
    <TableRow className="align-top">
      <TableCell className="max-w-64 pl-4 whitespace-normal">
        <div className="font-medium break-words">{request.name}</div>
        <a
          href={`mailto:${request.email}`}
          className="text-sm break-all text-primary underline-offset-4 hover:underline"
        >
          {request.email}
        </a>
        {/* Below md the other columns are hidden, so their content stacks here. */}
        <div className="mt-2 space-y-1.5 md:hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{issue}</Badge>
            <SupportStatusBadge status={request.status} />
          </div>
          <div className="text-xs text-muted-foreground">
            <DateCell value={request.createdAt} time />
          </div>
          <p className="text-sm break-words whitespace-pre-wrap">
            {message ?? <span className="text-muted-foreground">No message</span>}
          </p>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Badge variant="outline">{issue}</Badge>
      </TableCell>
      <TableCell className="hidden max-w-md break-words whitespace-pre-wrap md:table-cell">
        {message ?? <span className="text-muted-foreground">No message</span>}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <DateCell value={request.createdAt} time />
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <SupportStatusBadge status={request.status} />
      </TableCell>
      <TableCell className="pr-4 text-right">
        {request.status === SupportRequestStatus.OPEN && (
          <ResolveSupportButton id={request.id} name={request.name} />
        )}
      </TableCell>
    </TableRow>
  );
}
