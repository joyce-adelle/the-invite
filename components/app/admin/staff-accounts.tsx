import Link from "next/link";
import { ArrowLeft, ShieldCheck, Users } from "lucide-react";

import { AddAccountButton } from "@/components/app/admin/add-account-button";
import { CheckInUserActions } from "@/components/app/admin/check-in-user-actions";
import { DateCell } from "@/components/app/admin/date-cell";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin-session";
import { listAdminUsers, listCheckInUsers } from "@/lib/check-in-users";
import { ROLE } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** Admins only: every staff account. Admins are listed; check-in accounts can be managed too. */
export async function StaffAccounts() {
  const { user: me } = await requireAdmin();
  const [admins, users] = await Promise.all([
    listAdminUsers(),
    listCheckInUsers(),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Staff accounts"
        description="Who can sign in: admins, who can do everything, and check-in users for the door."
        actions={
          <Link
            href="/admin"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ArrowLeft aria-hidden /> Dashboard
          </Link>
        }
      />

      <section aria-labelledby="admins-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="admins-heading" className="text-lg font-semibold">
              Admins
            </h2>
            <p className="text-sm text-muted-foreground">
              Full access, including adding more staff accounts.
            </p>
          </div>
          <AddAccountButton role={ROLE.ADMIN} />
        </div>
        <Card className="gap-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Username</TableHead>
                <TableHead className="pr-4">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell className="pl-4 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <ShieldCheck className="size-4 text-olive" aria-hidden />
                      {admin.username}
                      {admin.id === me.id && (
                        <Badge variant="secondary">You</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="pr-4">
                    <DateCell value={admin.createdAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section aria-labelledby="check-in-users-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="check-in-users-heading" className="text-lg font-semibold">
              Check-in users
            </h2>
            <p className="text-sm text-muted-foreground">
              For door staff. They can only open a guest&apos;s QR code and
              confirm their check-in: no dashboard, guest list, emails or
              settings.
            </p>
          </div>
          <AddAccountButton role={ROLE.CHECK_IN} />
        </div>

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
                  <TableHead className="hidden sm:table-cell">
                    Created
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Last changed
                  </TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="pl-4 font-medium">
                      {user.username}
                    </TableCell>
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
                      <CheckInUserActions
                        user={{
                          id: user.id,
                          username: user.username,
                          disabled: user.disabled,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
