import { Suspense } from "react";

import { CheckInProgressView } from "@/components/app/check-in/check-in-progress";
import InviteSkeleton from "@/components/app/invitation/invite-skeleton";
import { PublicShell } from "@/components/layout/public-shell";

export const metadata = {
  title: "Check-in progress",
  robots: { index: false, follow: false },
};

export default function CheckInProgressPage() {
  return (
    <PublicShell className="justify-start">
      <Suspense fallback={<InviteSkeleton />}>
        <CheckInProgressView />
      </Suspense>
    </PublicShell>
  );
}
