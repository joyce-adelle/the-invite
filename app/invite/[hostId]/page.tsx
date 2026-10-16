import { BackLink } from "@/components/common/back-link";
import InviteContent from "@/components/app/invitation/invite-content";
import InviteSkeleton from "@/components/app/invitation/invite-skeleton";
import { PublicShell } from "@/components/layout/public-shell";
import { Suspense } from "react";

export const metadata = {
  title: "Request your invitation",
};

export default function InvitePage({ params }: PageProps<"/invite/[hostId]">) {
  return (
    <PublicShell className="justify-start sm:justify-center">
      <BackLink href="/">Choose a different host</BackLink>
      <Suspense fallback={<InviteSkeleton />}>
        <InviteContent params={params} />
      </Suspense>
    </PublicShell>
  );
}
