import { cn } from "@/lib/utils";

/**
 * Title block for a page. `public` uses the display serif with a gold rule;
 * `admin` stays compact and left-aligned with room for actions.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  variant = "admin",
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small label above the title. */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: "public" | "admin";
  className?: string;
}) {
  if (variant === "public") {
    return (
      <header className={cn("flex flex-col items-center text-center", className)}>
        {eyebrow && (
          <p className="text-xs font-medium tracking-[0.3em] text-olive uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 font-display text-4xl font-medium text-balance text-primary sm:text-5xl">
          {title}
        </h1>
        <div aria-hidden className="mt-5 h-px w-16 bg-gold" />
        {description && (
          <p className="mt-5 max-w-prose text-pretty text-muted-foreground">{description}</p>
        )}
      </header>
    );
  }

  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        {eyebrow && (
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
