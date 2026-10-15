import { Suspense } from "react";

import { ListSkeleton } from "@/components/app/admin/list-skeleton";
import { SupportRequests } from "@/components/app/admin/support-requests";

export const metadata = {
  title: "Help requests",
};

export default function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  return (
    <Suspense fallback={<ListSkeleton label="Loading help requests" />}>
      <SupportRequests searchParams={searchParams} />
    </Suspense>
  );
}
