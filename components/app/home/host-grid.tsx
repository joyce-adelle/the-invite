import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { getPublicHosts } from "@/lib/data/hosts";

export default async function HostGrid() {
  const hosts = await getPublicHosts();

  if (hosts.length === 0) {
    return (
      <p className="mt-8 text-center text-muted-foreground">
        Invitations are not open just yet. Please check back soon.
      </p>
    );
  }

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2">
      {hosts.map((host) => (
        <li key={host.id}>
          <Link
            href={`/invite/${host.id}`}
            className="group flex h-full items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-5 shadow-xs transition-all outline-none hover:-translate-y-0.5 hover:border-gold hover:shadow-md focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <span className="font-display text-xl leading-snug font-medium text-primary">
              {host.name}
            </span>
            <ArrowRight
              aria-hidden
              className="size-4 shrink-0 text-gold transition-transform group-hover:translate-x-1"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
