import Link from "next/link";
import { ArrowLeft, ShieldCheck, Users } from "lucide-react";

import { AccountActions } from "@/components/app/admin/account-actions";
import { AddAccountButton } from "@/components/app/admin/add-account-button";
import { DateCell } from "@/components/app/admin/date-cell";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin-session";
import { ROLE, type Role } from "@/lib/roles";
import { listStaffAccounts, type StaffAccount } from "@/lib/staff-accounts";
import { cn } from "@/lib/utils";

/** Admins only: every staff account, admins first, then check-in users. */
export async function StaffAccounts() {
  const { user: me } = await requireAdmin();
  const [admins, checkIns] = await Promise.all([listStaffAccounts(ROLE.ADMIN), listStaffAccounts(ROLE.CHECK_IN)]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Staff accounts"
        description="Who can sign in: admins, who can do everything, and check-in users for the door."
        actions={
          <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ArrowLeft aria-hidden /> Dashboard
          </Link>
        }
      />

      <AccountsSection
        role={ROLE.ADMIN}
        title="Admins"
        description="Full access, including managing staff accounts. The default admin, from ADMIN_USERNAME, can't be changed here, and nor can your own account."
        accounts={admins}
        meId={me.id}
      />

      <AccountsSection
        role={ROLE.CHECK_IN}
        title="Check-in users"
        description="For door staff. They can only open a guest's QR code and confirm their check-in: no dashboard, guest list, emails or settings."
        accounts={checkIns}
        meId={me.id}
        empty={{ title: "No check-in users yet", hint: "Add one for each person checking guests in at the door." }}
      />
    </div>
  );
}

function AccountsSection({
  role,
  title,
  description,
  accounts,
  meId,
  empty,
}: {
  role: Role;
  title: string;
  description: string;
  accounts: StaffAccount[];
  meId: string;
  empty?: { title: string; hint: string };
}) {
  const headingId = `${role}-accounts-heading`;
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={headingId} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <AddAccountButton role={role} />
      </div>

      {accounts.length === 0 && empty ? (
        <Card className="items-center py-12 text-center">
          <Users className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">{empty.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{empty.hint}</p>
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
              {accounts.map((account) => {
                const isMe = account.id === meId;
                return (
                  <TableRow key={account.id}>
                    <TableCell className="pl-4 font-medium">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {role === ROLE.ADMIN && <ShieldCheck className="size-4 text-olive" aria-hidden />}
                        {account.username}
                        {account.isDefaultAdmin && <Badge variant="outline">Default</Badge>}
                        {isMe && <Badge variant="secondary">You</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      {account.disabled ? (
                        <Badge variant="outline">Disabled</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <DateCell value={account.createdAt} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <DateCell value={account.updatedAt} time />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {/* The server refuses both of these anyway (lib/staff-accounts.ts). */}
                      {account.isDefaultAdmin || isMe ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <AccountActions
                          user={{ id: account.id, username: account.username, disabled: account.disabled, role }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  );
}
