import { cn } from "@/lib/utils";

const sizes = {
  /** Forms and single-column public pages. */
  narrow: "max-w-xl",
  default: "max-w-3xl",
  /** Admin tables and dashboards. */
  wide: "max-w-6xl",
} as const;

export function Container({
  size = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: keyof typeof sizes }) {
  return (
    <div
      className={cn("mx-auto w-full px-4 sm:px-6", sizes[size], className)}
      {...props}
    />
  );
}
