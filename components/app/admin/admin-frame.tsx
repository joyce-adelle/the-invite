import { SignOutButton } from "@/components/app/admin/sign-out-button";
import { AdminShell } from "@/components/layout/admin-shell";
import { requireAdmin } from "@/lib/admin-session";

/** The admin page chrome. Renders only for a signed-in admin; anyone else is sent to the login page. */
export async function AdminFrame({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return <AdminShell actions={<SignOutButton email={user.email} />}>{children}</AdminShell>;
}
