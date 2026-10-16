import { Suspense } from "react";

import { LoginGate } from "@/components/app/admin/login-gate";
import { PageHeader } from "@/components/common/page-header";
import { PublicShell } from "@/components/layout/public-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { event } from "@/config/event";

export const metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <PublicShell>
      <PageHeader variant="public" eyebrow="Admin" title={event.name} />
      <div className="mt-10 rounded-2xl border border-border bg-card/60 p-6 shadow-sm sm:p-8">
        <Suspense fallback={<Skeleton className="h-60 w-full" />}>
          <LoginGate />
        </Suspense>
      </div>
    </PublicShell>
  );
}
