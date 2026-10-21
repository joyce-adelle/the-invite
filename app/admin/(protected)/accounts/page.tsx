import { Suspense } from "react";

import { ListSkeleton } from "@/components/app/admin/list-skeleton";
import { StaffAccounts } from "@/components/app/admin/staff-accounts";

export const metadata = {
  title: "Staff accounts",
};

export default function AdminAccountsPage() {
  return (
    <Suspense fallback={<ListSkeleton label="Loading staff accounts" />}>
      <StaffAccounts />
    </Suspense>
  );
}
