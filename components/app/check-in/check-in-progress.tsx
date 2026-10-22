import { formatDateTime } from "@/components/app/admin/date-cell";
import { RefreshButton } from "@/components/app/check-in/refresh-button";
import { StaffBar } from "@/components/app/check-in/staff-bar";
import { Badge } from "@/components/ui/badge";
import { requireCheckIn } from "@/lib/admin-session";
import {
  getCheckInProgress,
  type Progress,
} from "@/lib/data/physical-check-in";
import { isAdmin } from "@/lib/roles";
import { cn } from "@/lib/utils";

const percent = ({ expected, arrived }: Progress) =>
  expected > 0 ? Math.round((arrived / expected) * 100) : 0;

function Bar({
  progress,
  label,
  className,
}: {
  progress: Progress;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={progress.expected}
      aria-valuenow={progress.arrived}
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-success"
        style={{ width: `${percent(progress)}%` }}
      />
    </div>
  );
}

const fraction = (p: Progress) => `${p.arrived} / ${p.expected}`;

/**
 * Arrivals so far, for door staff and admins. Check-in accounts see counts
 * only, with no names; admins also see the latest arrivals. Numbers are as of
 * the moment the page was loaded; Refresh reloads them.
 */
export async function CheckInProgressView() {
  const { user } = await requireCheckIn();
  const admin = isAdmin(user);
  const progress = await getCheckInProgress({ withRecent: admin });
  const all: Progress = {
    expected: progress.digital.expected + progress.physical.expected,
    arrived: progress.digital.arrived + progress.physical.arrived,
  };
  const totals = [
    { label: "Everyone", value: all, hint: `${percent(all)}% arrived` },
    {
      label: "QR cards",
      value: progress.digital,
      hint: "approved guests checked in",
    },
    {
      label: "Printed cards",
      value: progress.physical,
      hint: "counted at the door",
    },
  ];

  return (
    <>
      <StaffBar user={user} />
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-medium text-primary">
              Check-in progress
            </h1>
            <p className="text-sm text-muted-foreground">
              As of {formatDateTime(progress.generatedAt)}
            </p>
          </div>
          <RefreshButton />
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          {totals.map((total) => (
            <div
              key={total.label}
              className="rounded-xl border bg-card/90 p-4 shadow-xs backdrop-blur-sm"
            >
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {total.label}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {fraction(total.value)}
              </dd>
              <dd className="mt-2">
                <Bar progress={total.value} label={`${total.label} arrived`} />
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">
                {total.hint}
              </dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="by-host" className="space-y-2">
          <h2 id="by-host" className="text-lg font-semibold">
            By host
          </h2>
          <ul className="space-y-2">
            {progress.hosts.map((host) => {
              const total = {
                expected: host.digital.expected + host.physical.expected,
                arrived: host.digital.arrived + host.physical.arrived,
              };
              const done =
                total.expected > 0 && total.arrived >= total.expected;
              return (
                <li
                  key={host.id}
                  className="rounded-xl border bg-card/90 shadow-xs backdrop-blur-sm"
                >
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{host.name}</span>
                          {done && <Badge variant="success">All arrived</Badge>}
                        </div>
                        <Bar
                          progress={total}
                          label={`${host.name} arrived`}
                          className="mt-2"
                        />
                        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                          {host.physical.expected > 0 &&
                            `Printed ${fraction(host.physical)}`}
                          {host.physical.expected > 0 &&
                            host.digital.expected > 0 &&
                            " · "}
                          {host.digital.expected > 0 &&
                            `QR ${fraction(host.digital)}`}
                          {host.physical.expected === 0 &&
                            host.digital.expected === 0 &&
                            "Nobody expected yet"}
                        </p>
                      </div>
                      <span className="text-lg font-semibold tabular-nums">
                        {fraction(total)}
                      </span>
                    </summary>
                    <ul className="grid grid-cols-2 gap-2 border-t p-4 sm:grid-cols-4">
                      {host.tables.map((table) => (
                        <li
                          key={table.number}
                          className="rounded-lg border p-2 text-sm"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium tabular-nums">
                              Table {table.number}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {table.cardType === "PHYSICAL" ? "Printed" : "QR"}
                            </span>
                          </div>
                          <div className="mt-1 tabular-nums">
                            {fraction(table)}
                          </div>
                          <Bar
                            progress={table}
                            label={`Table ${table.number} arrived`}
                            className="mt-1"
                          />
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>

        {progress.recent && (
          <section aria-labelledby="recent" className="space-y-2">
            <h2 id="recent" className="text-lg font-semibold">
              Latest arrivals{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (admins only)
              </span>
            </h2>
            {progress.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody has arrived yet.
              </p>
            ) : (
              <ul className="divide-y rounded-xl border bg-card/90 text-sm">
                {progress.recent.map((item, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 px-4 py-2.5",
                      item.kind === "physical" &&
                        item.undone &&
                        "text-muted-foreground line-through",
                    )}
                  >
                    <span>
                      {item.kind === "qr" ? (
                        <>
                          <strong>{item.guestName}</strong> · {item.hostName}
                          {item.tableNumber !== null &&
                            ` · table ${item.tableNumber}`}
                        </>
                      ) : (
                        <>
                          <strong>+{item.count} printed</strong> ·{" "}
                          {item.hostName} · table {item.tableNumber}
                        </>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(item.at)}
                      {item.by && ` · ${item.by}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}
