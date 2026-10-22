import { Suspense } from "react";

import { HostsOverview } from "@/components/app/admin/hosts/hosts-overview";
import { ListSkeleton } from "@/components/app/admin/list-skeleton";

export const metadata = {
  title: "Hosts",
};

export default function AdminHostsPage() {
  return (
    <Suspense fallback={<ListSkeleton label="Loading hosts" />}>
      <HostsOverview />
    </Suspense>
  );
}
