import Link from "next/link";
import { ScanLine } from "lucide-react";

import { StaffBar } from "@/components/app/check-in/staff-bar";
import { requireCheckIn } from "@/lib/admin-session";

/**
 * Where a check-in account lands after signing in. There is deliberately
 * nothing to browse: guests are reached only by scanning their QR code, which
 * opens their own check-in page in the browser.
 */
export async function CheckInHome() {
  const { user } = await requireCheckIn();

  return (
    <>
      <StaffBar user={user} />
      <div className="rounded-2xl border border-gold/30 border-t-gold bg-card/90 p-6 shadow-md backdrop-blur-sm sm:p-8">
        <div className="flex flex-col items-center py-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-olive ring-1 ring-gold/40">
            <ScanLine className="size-6" aria-hidden />
          </div>
          <h1 className="mt-6 font-display text-3xl font-medium text-primary">Ready to check guests in</h1>
          <div aria-hidden className="mt-4 h-px w-12 bg-gold" />
          <ol className="mt-6 max-w-sm space-y-3 text-left text-pretty text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1.</span> Point this phone&apos;s camera at the QR
              code on the guest&apos;s access card or email.
            </li>
            <li>
              <span className="font-medium text-foreground">2.</span> Open the link it shows. The guest&apos;s
              name, table and status appear here.
            </li>
            <li>
              <span className="font-medium text-foreground">3.</span> Check it is them, then press{" "}
              <span className="font-medium text-foreground">Confirm check-in</span>.
            </li>
          </ol>
          <p className="mt-6 max-w-sm text-sm text-pretty text-muted-foreground">
            A printed card has no QR code: count those guests in under{" "}
            <Link href="/check-in/printed" className="font-medium text-primary underline-offset-4 hover:underline">
              Printed cards
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
