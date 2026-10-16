"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SupportNotificationItem = {
  id: string;
  name: string;
  email: string;
  issue: string;
  message: string;
  /** Already formatted in the event's time zone. */
  receivedAt: string;
};

/**
 * The admin header's bell: how many help requests are open, and the latest few
 * with everything needed to act on them. `null` means the count couldn't be
 * loaded, so the bell just links to the page without a number.
 */
export function SupportNotifications({
  notifications,
}: {
  notifications: { open: number; latest: SupportNotificationItem[] } | null;
}) {
  const open = notifications?.open ?? 0;

  if (!notifications) {
    return (
      <Button asChild variant="outline" size="icon-sm">
        <Link href="/admin/support" aria-label="Help requests">
          <Bell aria-hidden />
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="relative"
          aria-label={open > 0 ? `Help requests, ${open} open` : "Help requests, none open"}
        >
          <Bell aria-hidden />
          {open > 0 && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums"
            >
              {open > 99 ? "99+" : open}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>
          {open > 0 ? `${open} open help ${open === 1 ? "request" : "requests"}` : "Help requests"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.latest.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            No open help requests.
          </p>
        ) : (
          notifications.latest.map((item) => (
            <DropdownMenuItem key={item.id} asChild>
              <Link href="/admin/support" className="flex flex-col items-start gap-1 py-2">
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.receivedAt}</span>
                </span>
                <span className="max-w-full truncate text-xs text-muted-foreground">{item.email}</span>
                <Badge variant="outline">{item.issue}</Badge>
                {item.message && (
                  <span className="line-clamp-2 text-xs break-words">{item.message}</span>
                )}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/support" className="justify-center font-medium text-primary">
            View all help requests
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
