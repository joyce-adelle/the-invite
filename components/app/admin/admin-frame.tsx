import Link from "next/link";
import { Users } from "lucide-react";

import { formatDateTime } from "@/components/app/admin/date-cell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/app/admin/sign-out-button";
import {
  SupportNotifications,
  type SupportNotificationItem,
} from "@/components/app/admin/support-notifications";
import { AdminShell } from "@/components/layout/admin-shell";
import { requireAdmin } from "@/lib/admin-session";
import { getSupportNotifications } from "@/lib/data/support";
import { SUPPORT_ISSUE_SHORT_LABELS } from "@/lib/support";

/** Open help requests for the header bell. A failure here must not take the whole panel down. */
async function loadNotifications(): Promise<{
  open: number;
  latest: SupportNotificationItem[];
} | null> {
  try {
    const { open, latest } = await getSupportNotifications();
    return {
      open,
      latest: latest.map((request) => ({
        id: request.id,
        name: request.name,
        email: request.email,
        issue: SUPPORT_ISSUE_SHORT_LABELS[request.issueType],
        message: request.message,
        receivedAt: formatDateTime(request.createdAt),
      })),
    };
  } catch (error) {
    console.error("Loading help request notifications failed", error);
    return null;
  }
}

/** The admin page chrome. Renders only for a signed-in admin; anyone else is sent to the login page. */
export async function AdminFrame({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  const notifications = await loadNotifications();
  return (
    <AdminShell
      actions={
        <div className="flex items-center gap-3">
          <Link
            href="/admin/accounts"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
          >
            <Users aria-hidden />
            <span className="hidden md:inline">Staff accounts</span>
            <span className="sr-only md:hidden">Staff accounts</span>
          </Link>
          <SupportNotifications notifications={notifications} />
          <SignOutButton name={user.displayUsername ?? user.username ?? user.name} />
        </div>
      }
    >
      {children}
    </AdminShell>
  );
}
