import HostGrid from "@/components/app/home/host-grid";
import HostGridSkeleton from "@/components/app/home/host-grid-skeleton";
import { PageHeader } from "@/components/common/page-header";
import { PublicShell } from "@/components/layout/public-shell";
import { Suspense } from "react";
import { event } from "@/config/event";

export default function Home() {
  return (
    <PublicShell className="justify-start sm:justify-center">
      <PageHeader
        variant="public"
        eyebrow="You are invited"
        title={event.name}
        description="We would be delighted to welcome you. To request your invitation, please begin by choosing the host who invited you."
      />

      <section aria-labelledby="hosts-heading" className="mt-14">
        <h2
          id="hosts-heading"
          className="text-center text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase"
        >
          Who invited you?
        </h2>
        <Suspense fallback={<HostGridSkeleton />}>
          <HostGrid />
        </Suspense>
      </section>
    </PublicShell>
  );
}
