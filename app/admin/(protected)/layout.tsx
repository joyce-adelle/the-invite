import { Suspense } from "react";

import { SignOutButton } from "@/components/app/admin/sign-out-button";
import { AdminShell } from "@/components/layout/admin-shell";
import { requireAdmin } from "@/lib/admin-session";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Each page under here must still call requireAdmin() itself: layouts aren't
// re-rendered on client-side navigation.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminFrame>{children}</AdminFrame>
    </Suspense>
  );
}

async function AdminFrame({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return <AdminShell actions={<SignOutButton email={user.email} />}>{children}</AdminShell>;
}
