import { HostUnavailable } from "./host-unavailable";
import { PageHeader } from "@/components/common/page-header";
import { RequestForm } from "./request-form";
import { getPublicHost } from "@/lib/data/hosts";
import { hostHasCapacity } from "@/lib/data/guests";
import { notFound } from "next/navigation";

export default async function InviteContent({
  params,
}: {
  params: PageProps<"/invite/[hostId]">["params"];
}) {
  const { hostId } = await params;
  const host = await getPublicHost(hostId);
  if (!host) notFound();

  const open = await hostHasCapacity(host.id);

  return (
    <>
      <PageHeader
        variant="public"
        eyebrow="Your invitation"
        title={host.name}
        description={
          open
            ? "We would be honoured to have you with us. Share a few details below and we will send your access card."
            : undefined
        }
      />
      <div className="mt-10 rounded-2xl border border-border bg-card/60 p-6 shadow-sm sm:p-8">
        {open ? <RequestForm hostId={host.id} /> : <HostUnavailable />}
      </div>
    </>
  );
}
