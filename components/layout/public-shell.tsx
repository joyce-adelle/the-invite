import { Container } from "@/components/layout/container";
import { FloralBackdrop } from "@/components/layout/floral-backdrop";
import { cn } from "@/lib/utils";

/** Page wrapper for the guest-facing pages: centred, narrow, generous spacing. */
export function PublicShell({
  className,
  children,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "relative isolate flex flex-1 flex-col justify-center overflow-hidden py-14",
        className,
      )}
      {...props}
    >
      <FloralBackdrop />
      <Container>{children}</Container>
    </main>
  );
}
