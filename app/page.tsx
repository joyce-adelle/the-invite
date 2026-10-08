import { PageHeader } from "@/components/layout/page-header";
import { PublicShell } from "@/components/layout/public-shell";
import { event } from "@/config/event";

export default function Home() {
  return (
    <PublicShell>
      <PageHeader variant="public" eyebrow="You are invited" title={event.name} />
    </PublicShell>
  );
}
