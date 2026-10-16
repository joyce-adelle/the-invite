import { event } from "@/config/event";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: event.timeZone,
});

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: event.timeZone,
});

/** Date and time of an instant, in the event's time zone. */
export function formatDateTime(value: Date): string {
  return dateTimeFormat.format(value);
}

export function DateCell({ value, time = false }: { value: Date | null; time?: boolean }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <time dateTime={value.toISOString()}>
      {(time ? dateTimeFormat : dateFormat).format(value)}
    </time>
  );
}
