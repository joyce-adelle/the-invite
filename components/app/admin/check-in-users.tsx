import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";

import { AddCheckInUserButton } from "@/components/app/admin/add-check-in-user-button";
import { CheckInUserActions } from "@/components/app/admin/check-in-user-actions";
import { DateCell } from "@/components/app/admin/date-cell";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin-session";
import { listCheckInUsers } from "@/lib/check-in-users";
import { cn } from "@/lib/utils";

/** Admins only: the accounts door staff use to check guests in. */
export async function CheckInUsers() {
  await requireAdmin();
  const users = await listCheckInUsers();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-in users"
        description="Accounts for door staff. They can only open a guest's QR code and confirm their check-in: no dashboard, guest list, emails or settings."
        actions={
          <>
            <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <ArrowLeft aria-hidden /> Dashboard
            </Link>
            <AddCheckInUserButton />
          </>
        }
      />

      {users.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <Users className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">No check-in users yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add one for each person checking guests in at the door.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Username</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="hidden md:table-cell">Last changed</TableHead>
                <TableHead className="pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="pl-4 font-medium">{user.username}</TableCell>
                  <TableCell>
                    {user.disabled ? (
                      <Badge variant="outline">Disabled</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <DateCell value={user.createdAt} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <DateCell value={user.updatedAt} time />
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <CheckInUserActions user={{ id: user.id, username: user.username, disabled: user.disabled }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
