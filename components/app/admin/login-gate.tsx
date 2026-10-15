import { redirect } from "next/navigation";

import { LoginForm } from "@/components/app/admin/login-form";
import { getAdminSession } from "@/lib/admin-session";

/** Shows the login form, or sends an already signed-in admin on to the dashboard. */
export async function LoginGate() {
  if (await getAdminSession()) redirect("/admin");
  return <LoginForm />;
}
