import { Suspense } from "react";

import { AdminFrame } from "@/components/app/admin/admin-frame";

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
