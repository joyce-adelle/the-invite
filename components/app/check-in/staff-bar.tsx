import Link from "next/link";

import { SignOutButton } from "@/components/app/admin/sign-out-button";
import { CheckInNav } from "@/components/app/check-in/check-in-nav";
import { isAdmin, type AccessUser } from "@/lib/roles";

type StaffUser = AccessUser & {
  name: string;
  username?: string | null;
  displayUsername?: string | null;
};

/**
 * Who is signed in on the check-in pages, with a way out (back to the dashboard
 * for an admin, and sign out), and the door's three pages.
 */
export function StaffBar({ user }: { user: StaffUser }) {
  const name = user.displayUsername ?? user.username ?? user.name;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        {isAdmin(user) ? (
          <Link
            href="/admin"
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            ← Dashboard
          </Link>
        ) : (
          <Link
            href="/check-in"
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            Signed in as{" "}
            <span className="font-medium text-foreground">{name}</span>
          </Link>
        )}
        <SignOutButton name={name} showName={isAdmin(user)} />
      </div>
      <CheckInNav />
    </>
  );
}
