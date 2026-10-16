import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SupportList } from "@/components/app/admin/support-list";
import { SupportTabs } from "@/components/app/admin/support-tabs";
import { PageHeader } from "@/components/common/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin-session";
import { getSupportCounts, getSupportRequests } from "@/lib/data/support";
import { parseSupportView, viewToSupportStatus } from "@/lib/support-filters";
import { cn } from "@/lib/utils";

export async function SupportRequests({
  searchParams,
}: {
  searchParams: PageProps<"/admin/support">["searchParams"];
}) {
  await requireAdmin();

  const view = parseSupportView(await searchParams);
  const status = viewToSupportStatus(view);
  const [counts, requests] = await Promise.all([
    getSupportCounts(),
    getSupportRequests({ status }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help requests"
        description="Messages guests have sent from the invitation pages."
        actions={
          <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ArrowLeft aria-hidden /> Dashboard
          </Link>
        }
      />
      <SupportTabs
        view={view}
        counts={{ open: counts.OPEN, resolved: counts.RESOLVED, all: counts.all }}
      />
      <SupportList
        requests={requests}
        view={view}
        total={status ? counts[status] : counts.all}
      />
    </div>
  );
}
