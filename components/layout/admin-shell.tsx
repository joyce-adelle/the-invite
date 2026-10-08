import { Container } from "@/components/layout/container";
import { event } from "@/config/event";

/** Page wrapper for the admin panel: slim top bar and a wide content area. */
export function AdminShell({
  actions,
  children,
}: {
  /** Right side of the top bar, e.g. the signed-in admin's menu. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-card">
        <Container size="wide" className="flex h-14 items-center justify-between gap-4">
          <span className="font-display text-xl font-semibold text-primary">
            {event.name}
            <span className="ml-2 font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Admin
            </span>
          </span>
          {actions}
        </Container>
      </header>
      <main className="flex-1 py-8">
        <Container size="wide">{children}</Container>
      </main>
    </div>
  );
}
