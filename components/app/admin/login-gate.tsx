import { LoginForm } from "@/components/app/admin/login-form";
import { getCurrentSession } from "@/lib/admin-session";
import { redirect } from "next/navigation";
import { safeReturnPath } from "@/lib/check-in/check-in-path";
import { canCheckIn, homeFor } from "@/lib/roles";

/**
 * Shows the login form, or sends someone already signed in on: back to the
 * check-in page they came from (?next=), or to their own home, the dashboard
 * for an admin and the check-in page for a check-in account.
 */
export async function LoginGate({
  searchParams,
}: {
  searchParams: PageProps<"/admin/login">["searchParams"];
}) {
  const next = safeReturnPath((await searchParams).next);
  const session = await getCurrentSession();
  if (session && canCheckIn(session.user)) redirect(next ?? homeFor(session.user));
  return <LoginForm next={next ?? undefined} />;
}
