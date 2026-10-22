import { Suspense } from "react";

import { HostDetail } from "@/components/app/admin/hosts/host-detail";
import { ListSkeleton } from "@/components/app/admin/list-skeleton";

export const metadata = {
  title: "Host",
};

export default function AdminHostPage({ params }: PageProps<"/admin/hosts/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton label="Loading host" />}>
      <HostDetail params={params} />
    </Suspense>
  );
}
