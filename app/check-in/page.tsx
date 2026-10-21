import { Suspense } from "react";

import { CheckInHome } from "@/components/app/check-in/check-in-home";
import InviteSkeleton from "@/components/app/invitation/invite-skeleton";
import { PublicShell } from "@/components/layout/public-shell";

export const metadata = {
  title: "Check-in",
  robots: { index: false, follow: false },
};

export default function CheckInHomePage() {
  return (
    <PublicShell className="justify-start sm:justify-center">
      <Suspense fallback={<InviteSkeleton />}>
        <CheckInHome />
      </Suspense>
    </PublicShell>
  );
}
