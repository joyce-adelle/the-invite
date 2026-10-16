import InviteSkeleton from "@/components/app/invitation/invite-skeleton";
import { PublicShell } from "@/components/layout/public-shell";
import { RequestConfirmation } from "@/components/app/invitation/request-confirmation";
import ResultPage from "@/components/app/invitation/result-page";
import { Suspense } from "react";

export const metadata = {
  title: "Request received",
  robots: { index: false },
};

export default function ReceivedPage({
  params,
}: PageProps<"/invite/[hostId]/received">) {
  return (
    <PublicShell className="justify-start sm:justify-center">
      <Suspense fallback={<InviteSkeleton />}>
        <ResultPage params={params}>
          <RequestConfirmation />
        </ResultPage>
      </Suspense>
    </PublicShell>
  );
}
