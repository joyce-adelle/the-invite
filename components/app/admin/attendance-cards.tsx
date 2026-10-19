import { Card, CardContent } from "@/components/ui/card";

import { Attendance } from "@/types/check-in";

/** Entry on the day, from approved guests only. Worked out from the database on every load. */
export function AttendanceCards({ attendance }: { attendance: Attendance }) {
  const stats = [
    { label: "Approved guests", value: attendance.approved },
    { label: "Checked in", value: attendance.checkedIn },
    { label: "Not yet checked in", value: attendance.notCheckedIn },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(({ label, value }) => (
        <Card key={label} size="sm">
          <CardContent>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {label}
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {value}
            </dd>
          </CardContent>
        </Card>
      ))}
      <Card size="sm">
        <CardContent>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Check-in rate
          </dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {attendance.percent}%
          </dd>
          <div
            role="progressbar"
            aria-label="Share of approved guests who have checked in"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={attendance.percent}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${attendance.percent}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </dl>
  );
}
