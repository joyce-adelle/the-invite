import { Suspense } from "react";

import { Dashboard } from "@/components/app/admin/dashboard";
import { DashboardSkeleton } from "@/components/app/admin/dashboard-skeleton";

export default function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}
