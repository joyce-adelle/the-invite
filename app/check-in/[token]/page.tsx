import { Suspense } from "react";

import { CheckInContent } from "@/components/app/check-in/check-in-content";
import InviteSkeleton from "@/components/app/invitation/invite-skeleton";
import { PublicShell } from "@/components/layout/public-shell";

export const metadata = {
  title: "Check-in",
  robots: { index: false, follow: false },
  // The address carries the guest's secret, so it isn't passed on to anywhere a link leads.
  referrer: "no-referrer",
};

export default function CheckInPage({ params }: PageProps<"/check-in/[token]">) {
  return (
    <PublicShell className="justify-start sm:justify-center">
      <Suspense fallback={<InviteSkeleton />}>
        <CheckInContent params={params} />
      </Suspense>
    </PublicShell>
  );
}
