# TheInvite

A lightweight event invitation app. Guests request an invitation from the host who invited them; admins approve requests, which assigns a table and emails the guest a personalised two-page PDF access card.

- **Next.js 16** (App Router, Cache Components) · **React 19** · **Tailwind CSS v4**
- **PostgreSQL** via **Prisma 7**. Local Postgres runs in Docker; production is any hosted Postgres set through `DATABASE_URL`.
- **Auth.js** passwordless email sign-in for admins
- **Resend** for magic-link and access-card emails
- **pdf-lib** overlays guest details onto the card template

## Setup

Requires Node 20.19+ and Docker.

```bash
npm install                   # also generates the Prisma client
cp .env.example .env.local    # then fill in the values
docker compose up -d          # local Postgres on localhost:5433
npm run db:migrate            # apply migrations (prisma migrate dev)
npm run db:seed               # create the hosts and their tables
npm run dev
```

All environment variables are server-only. See [.env.example](.env.example) for what each one is.

### Database

- `DATABASE_URL` is the only database setting. The Prisma CLI reads it from `.env.local` just like Next.js does ([prisma.config.ts](prisma.config.ts)).
- Local data persists in the `pgdata` Docker volume across restarts. `docker compose down -v` deletes it.
- **Schema changes:** edit [prisma/schema.prisma](prisma/schema.prisma), then run `npm run db:migrate -- --name <change>` and commit the new folder in `prisma/migrations/`.
- **Hosts and tables** come from [prisma/seed.ts](prisma/seed.ts); there's no UI for them. Edit the list and re-run `npm run db:seed`: it updates in place and never deletes, because guests reference hosts and tables. Don't change a host's `id` once guests exist.
- **Production:** run `npm run db:deploy` (`prisma migrate deploy`) against the hosted database before or during deploy, and `npm run db:seed` once. If your provider gives you a pooled connection string (e.g. Supabase's transaction pooler), run migrations with its direct or session connection string.
- Some constraints live only in the migration SQL because Prisma's schema language can't express them: normalised emails, approved guests must have a table, and capacities must be positive.

### Resend

Verify your sending domain in Resend, then set `RESEND_API_KEY` and `EMAIL_FROM`.

## Where things live

| Path | Purpose |
| --- | --- |
| [config/event.ts](config/event.ts) | Event name and access-card overlay settings |
| [prisma/schema.prisma](prisma/schema.prisma) | Database schema (hosts, tables, guests); migrations in [prisma/migrations/](prisma/migrations/) |
| [prisma/seed.ts](prisma/seed.ts) | The hosts and their tables (dummy values for now) |
| [lib/data/hosts.ts](lib/data/hosts.ts) | Server-only host reads (`getHosts`, `getHost`) with their tables |
| [lib/data/guests.ts](lib/data/guests.ts) | Server-only guest data access: requests, approve/reject/cancel, tables, card status, dashboard counts |
| [lib/data/errors.ts](lib/data/errors.ts) | `GuestError` with a `code` for expected failures (host full, table full, …) |
| [lib/prisma.ts](lib/prisma.ts) | Prisma client |
| [lib/guest.ts](lib/guest.ts) | `Guest` type, status enums and `normalizeEmail` (safe in client components) |
| [lib/seating.ts](lib/seating.ts) | Capacity and table-occupancy calculations |
| [app/globals.css](app/globals.css) | Theme tokens (brand palette, radius, shadows, fonts) used by every component |
| [components/ui/](components/ui/) | shadcn/ui components (Radix base); add more with `npx shadcn@latest add <name>` |
| [components/layout/](components/layout/) | `Container`, `PublicShell`, `AdminShell`, `PageHeader` |
| [template/New.pdf](template/New.pdf) | The single access-card template (page 1 unchanged, page 2 gets the overlay) |

## Business rules

- One access card admits one person; couples need two cards.
- An email address can be used for more than one request (e.g. a couple sharing an address). Each request is still one card for one person.
- Only approved guests count towards capacity. Approval assigns the next table with a free seat.
- Changing a guest's table does not resend their card. Admins resend it explicitly.
