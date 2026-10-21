import { Suspense } from "react";

import { CheckInUsers } from "@/components/app/admin/check-in-users";
import { ListSkeleton } from "@/components/app/admin/list-skeleton";

export const metadata = {
  title: "Check-in users",
};

export default function AdminCheckInUsersPage() {
  return (
    <Suspense fallback={<ListSkeleton label="Loading check-in users" />}>
      <CheckInUsers />
    </Suspense>
  );
}
