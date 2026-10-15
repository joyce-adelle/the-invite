import { Suspense } from "react";

import { PageHeader } from "@/components/common/page-header";
import { requireAdmin } from "@/lib/admin-session";

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await requireAdmin();

  return (
    <PageHeader
      title="Dashboard"
      description="You're signed in. Guest management will live here."
    />
  );
}
