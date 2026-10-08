import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";

/** Page wrapper for the guest-facing pages: centred, narrow, generous spacing. */
export function PublicShell({
  className,
  children,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn("flex flex-1 flex-col justify-center py-16 sm:py-24", className)}
      {...props}
    >
      <Container size="narrow">{children}</Container>
    </main>
  );
}
