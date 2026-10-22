"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/check-in", label: "Scan QR" },
  { href: "/check-in/printed", label: "Printed cards" },
  { href: "/check-in/progress", label: "Progress" },
];

/** The door's three jobs, for staff and admins alike. */
export function CheckInNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Check-in" className="mb-6 grid grid-cols-3 gap-1 rounded-xl border bg-card/80 p-1 backdrop-blur-sm">
      {TABS.map((tab) => {
        // A scanned QR link (/check-in/<code>) belongs to "Scan QR".
        const active =
          tab.href === "/check-in"
            ? pathname === "/check-in" || !TABS.slice(1).some((t) => pathname.startsWith(t.href))
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-2 py-2 text-center text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
