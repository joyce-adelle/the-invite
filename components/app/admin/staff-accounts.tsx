import Link from "next/link";
import { ArrowLeft, Crown, ShieldCheck, Users } from "lucide-react";

import { AccountActions } from "@/components/app/admin/account-actions";
import { AddAccountButton } from "@/components/app/admin/add-account-button";
import { DateCell } from "@/components/app/admin/date-cell";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin-session";
import { isSuperAdmin, ROLE } from "@/lib/roles";
import { listStaffAccounts, type StaffAccount } from "@/lib/staff-accounts";
import { cn } from "@/lib/utils";

/**
 * Admins only: every staff account. Any admin manages check-in users; only a
 * super admin adds or changes admins; nobody changes a super admin or their own
 * account here. The server enforces all of it (lib/staff-accounts.ts); this
 * only hides what it would refuse.
 */
export async function StaffAccounts() {
  const { user: me } = await requireAdmin();
  const superAdmin = isSuperAdmin(me);
  const [admins, checkIns] = await Promise.all([listStaffAccounts("admins"), listStaffAccounts(ROLE.CHECK_IN)]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Staff accounts"
        description="Who can sign in: super admins, admins who run the event, and check-in users for the door."
        actions={
          <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ArrowLeft aria-hidden /> Dashboard
          </Link>
        }
      />

      <AccountsSection
        title="Admins"
        description={
          superAdmin
            ? "Super admins (made by the seed) can do everything and can't be changed here. You can add, disable or reset ordinary admins."
            : "Only a super admin can add or change admins."
        }
        accounts={admins}
        meId={me.id}
        add={superAdmin ? ROLE.ADMIN : null}
        canManage={(account) => superAdmin && account.role === ROLE.ADMIN}
      />

      <AccountsSection
        title="Check-in users"
        description="For door staff. They can only open a guest's QR code and confirm their check-in: no dashboard, guest list, emails or settings."
        accounts={checkIns}
        meId={me.id}
        add={ROLE.CHECK_IN}
        canManage={() => true}
        empty={{ title: "No check-in users yet", hint: "Add one for each person checking guests in at the door." }}
      />
    </div>
  );
}

function AccountsSection({
  title,
  description,
  accounts,
  meId,
  add,
  canManage,
  empty,
}: {
  title: string;
  description: string;
  accounts: StaffAccount[];
  meId: string;
  add: typeof ROLE.ADMIN | typeof ROLE.CHECK_IN | null;
  canManage: (account: StaffAccount) => boolean;
  empty?: { title: string; hint: string };
}) {
  const headingId = `${title.toLowerCase().replace(/\W+/g, "-")}-heading`;
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={headingId} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {add && <AddAccountButton role={add} />}
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
                const manageable = !account.isSuperAdmin && !isMe && canManage(account);
                return (
                  <TableRow key={account.id}>
                    <TableCell className="pl-4 font-medium">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {account.isSuperAdmin ? (
                          <Crown className="size-4 text-gold" aria-hidden />
                        ) : (
                          account.role === ROLE.ADMIN && <ShieldCheck className="size-4 text-olive" aria-hidden />
                        )}
                        {account.username}
                        {account.isSuperAdmin && <Badge variant="outline">Super admin</Badge>}
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
                      {manageable && (account.role === ROLE.ADMIN || account.role === ROLE.CHECK_IN) ? (
                        <AccountActions
                          user={{ id: account.id, username: account.username, disabled: account.disabled, role: account.role }}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
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
