import { LoginForm } from "@/components/app/admin/login-form";
import { getAdminSession } from "@/lib/admin-session";
import { redirect } from "next/navigation";
import { safeReturnPath } from "@/lib/check-in/check-in-path";

/**
 * Shows the login form, or sends an already signed-in admin on: back to the
 * check-in page they came from (?next=), or to the dashboard.
 */
export async function LoginGate({
  searchParams,
}: {
  searchParams: PageProps<"/admin/login">["searchParams"];
}) {
  const next = safeReturnPath((await searchParams).next);
  if (await getAdminSession()) redirect(next ?? "/admin");
  return <LoginForm next={next ?? undefined} />;
}
