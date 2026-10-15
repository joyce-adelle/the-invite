import { ArrowLeft } from "lucide-react";
import InviteContent from "@/components/app/invitation/invite-content";
import InviteSkeleton from "@/components/app/invitation/invite-skeleton";
import Link from "next/link";
import { PublicShell } from "@/components/layout/public-shell";
import { Suspense } from "react";

export const metadata = {
  title: "Request your invitation",
};

export default function InvitePage({ params }: PageProps<"/invite/[hostId]">) {
  return (
    <PublicShell className="justify-start sm:justify-center">
      <Link
        href="/"
        className="mb-8 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Choose a different host
      </Link>
      <Suspense fallback={<InviteSkeleton />}>
        <InviteContent params={params} />
      </Suspense>
    </PublicShell>
  );
}
