import { event } from "@/config/event";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: event.timeZone,
});

export function DateCell({ value }: { value: Date | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <time dateTime={value.toISOString()}>{dateFormat.format(value)}</time>;
}
