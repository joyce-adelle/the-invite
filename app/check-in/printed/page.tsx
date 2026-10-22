import { Suspense } from "react";

import { PrintedCards } from "@/components/app/check-in/printed-cards";
import InviteSkeleton from "@/components/app/invitation/invite-skeleton";
import { PublicShell } from "@/components/layout/public-shell";

export const metadata = {
  title: "Printed cards",
  robots: { index: false, follow: false },
};

export default function PrintedCardsPage() {
  return (
    <PublicShell className="justify-start sm:justify-center">
      <Suspense fallback={<InviteSkeleton />}>
        <PrintedCards />
      </Suspense>
    </PublicShell>
  );
}
