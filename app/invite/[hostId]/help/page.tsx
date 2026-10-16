import InviteSkeleton from "@/components/app/invitation/invite-skeleton";
import { PublicShell } from "@/components/layout/public-shell";
import { RequestDuplicate } from "@/components/app/invitation/request-duplicate";
import ResultPage from "@/components/app/invitation/result-page";
import { Suspense } from "react";

export const metadata = {
  title: "Error registering your invitation",
  robots: { index: false },
};

export default function HelpPage({
  params,
}: PageProps<"/invite/[hostId]/help">) {
  return (
    <PublicShell className="justify-start sm:justify-center">
      <Suspense fallback={<InviteSkeleton />}>
        <ResultPage params={params}>
          <RequestDuplicate />
        </ResultPage>
      </Suspense>
    </PublicShell>
  );
}
