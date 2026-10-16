import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/** The small link at the top of a guest page that goes back a step. */
export function BackLink({ href, children = "Back" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-8 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      {children}
    </Link>
  );
}
