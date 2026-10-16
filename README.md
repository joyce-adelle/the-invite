# TheInvite

A lightweight event invitation app. Guests request an invitation from the host who invited them; admins approve requests, which assigns a table and emails the guest a personalised two-page PDF access card.

- **Next.js 16** (App Router, Cache Components) · **React 19** · **Tailwind CSS v4**
- **PostgreSQL** via **Prisma 7**. Local Postgres runs in Docker; production is any hosted Postgres set through `DATABASE_URL`.
- **Better Auth** admin sign-in: stateless cookie sessions, an email allow-list (`ADMIN_EMAILS`) and one shared password stored as a hash (`ADMIN_PASSWORD_HASH`, create it with `npm run auth:hash-password`)
- **Resend** for access-card emails
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

Access cards are emailed with [Resend](https://resend.com), as a PDF attachment. Verify your sending domain at <https://resend.com/domains>, then set:

- `RESEND_API_KEY`: your API key.
- `EMAIL_FROM`: the sender, e.g. `"TheInvite <invites@your-domain.com>"`, on the verified domain.

Without these settings nothing is sent: a card email fails, the card is marked **failed** and an admin can resend it once email is configured.

A card email goes out when a guest is approved, when their table changes, and when an admin resends it. It is **one email with the same wording every time**: a warm note to the guest by name, the event, who invited them, their table, a reminder to keep the attached access card for the event, and the two-page PDF card. The card is generated at the moment of sending from the guest's current details, so after a table change both the automatic email and a resend carry the new table. Nothing is ever sent for pending, rejected or cancelled guests.

If the email can't be sent, the guest stays approved and their card is marked **failed** (the last successful send time is kept, never overwritten). The admin sees the reason in a message, and **Resend access card** tries again. Only a signed-in admin can resend.

Transient problems (rate limiting, Resend outages, network errors) are retried up to three times with the same idempotency key, so a retry can't deliver the email twice. Other errors, such as an unverified domain or an invalid address, fail straight away. The code is in [lib/email.ts](lib/email.ts) and `sendAccessCard` in [lib/access-card.ts](lib/access-card.ts).

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
| [lib/invitations.ts](lib/invitations.ts) | Approval, table-move and resend flows: a seating decision followed by sending the card |
| [lib/seating.ts](lib/seating.ts) | Capacity and table-occupancy calculations |
| [lib/data/support.ts](lib/data/support.ts) | Server-only data access for help requests: create, list, counts, resolve |
| [lib/actions/support.ts](lib/actions/support.ts) | The public "Need help?" server action (validates, saves, never reveals guest info) |
| [lib/validation/support.ts](lib/validation/support.ts) | Zod rules and length limits for the help form, shared by the form and the server |
| [components/app/invitation/support-form.tsx](components/app/invitation/support-form.tsx) | The help form shown on the invitation pages |
| [app/admin/(protected)/support/](app/admin/(protected)/support/page.tsx) | Admin "Help requests" page; the header bell ([support-notifications.tsx](components/app/admin/support-notifications.tsx)) shows the latest open ones |
| [tests/](tests/) | `npm test`: validation, server action and data-layer tests |
| [app/globals.css](app/globals.css) | Theme tokens (brand palette, radius, shadows, fonts) used by every component |
| [components/ui/](components/ui/) | shadcn/ui components (Radix base); add more with `npx shadcn@latest add <name>` |
| [components/layout/](components/layout/) | `Container`, `PublicShell`, `AdminShell`, `PageHeader` |
| [template/access-card-template.pdf](template/access-card-template.pdf) | The single access-card template (page 1 unchanged, page 2 gets the overlay) |
| [template/fonts/](template/fonts/) | The card font (Noto Sans Bold, Latin subset) and its licence; see its README |
| [lib/access-card.ts](lib/access-card.ts) | Server-only card generation (`createAccessCardPdf`) and the card email (`sendAccessCard`) |
| [lib/email.ts](lib/email.ts) | Server-only Resend wrapper: reads the key and sender from the environment, retries transient failures |

## Help requests

Guests who can't register, or haven't received their card, can send a message from the invitation pages (below the form, and on the "already registered" and "no places left" screens). It needs no registration and is never linked to a guest record, so nothing about the form's response reveals whether a name or email is registered.

Requests are saved in PostgreSQL (`invitation_support_requests`). There is no email: admins see them in the app, via the bell in the admin header (open count plus the latest few) and the **Help requests** page, where they can be filtered open/resolved and marked resolved. The header count refreshes when the page does or when a request is resolved, not live.

## Access cards

Cards are generated on demand from **one** template, [template/access-card-template.pdf](template/access-card-template.pdf), for every host and table. Each card is built in memory with `pdf-lib`: page 1 is kept exactly as it is, and the host's name, the guest's name and `TABLE n` are drawn onto page 2. The source files are never modified, and nothing generated is stored. The same function ([lib/access-card.ts](lib/access-card.ts)) serves the admin **download** button and the email sent on approval, on a table change and on resend, so they always match.

- **Layout and wording** live in `accessCard` in [config/event.ts](config/event.ts).
- **Two names:** the **guest's own** name comes first, at the top, with a "Guest Name" label. The template has no place for it, so the generator adds it, and every other field sits one slot lower. The "Guest Type" slot shows the **host's** name (read from the database, so a renamed host is picked up on the next card). Every label keeps its distance to its answer from the example card, and the gap between one answer and the next label is the same all the way down (a little tighter than the example, to fit the extra field). The positions are in `accessCard` in [config/event.ts](config/event.ts).
- **Fixed labels:** the blank template's page 2 is only the artwork, so the labels from the example ("Guest Type", "Table No.", the location, "Colour of the day", "THIS CARD ADMITS ONE") are drawn by the generator from `staticText`. Set it to `[]` if they are added to the template artwork instead.
- **Font:** Noto Sans Bold stands in for the design's Canva Sans Bold (not openly licensed). It covers Yorùbá letters and tone marks. See [template/fonts/README.md](template/fonts/README.md) to change it.
- **Names (both fields):** shown in capitals. A long name shrinks to fit, then goes onto two lines, and only if it still doesn't fit is the end shortened with "…". Characters the font lacks print as "?".
- **Deployment:** the template and font are read from disk, so `next.config.ts` lists them in `outputFileTracingIncludes`. Keep that list in step if you move them.

## Tests

`npm test` runs Node's built-in test runner. The database tests write to `DATABASE_URL`, so they skip themselves unless it points at a local database, and they delete what they create. Tests never send real email: they pass in a stand-in mail client, and [tests/no-email.ts](tests/no-email.ts) blanks the API key so a test that forgets would fail rather than send. Test files run one after another, since they share the local database. [tests/card-delivery.test.ts](tests/card-delivery.test.ts) runs the whole story (first send, failed send, resend, resend after a table change) through the real flows and the real card generator, reading the attached PDFs back.

## Business rules

- One access card admits one person; couples need two cards.
- An email address can be used for more than one request (e.g. a couple sharing an address). Each request is still one card for one person.
- Only approved guests count towards capacity. Pending, rejected and cancelled guests never use a place or a seat.
- A pending, rejected or cancelled guest can be approved. Approval re-reads the guest, checks the host still has a place, and seats them at the host's first table with a free seat, all under a per-host lock so simultaneous approvals can't overfill a table or approve one guest twice. If there is no room the error says what to do (cancel another invitation to free a place or seat), and the admin can then approve again. Only pending requests can be rejected.
- The access card is marked **sent** only after the email succeeds; until then it is "not sent", and a failed send is "failed" so it can be resent. The email is sent with Resend (`sendAccessCard` in [lib/access-card.ts](lib/access-card.ts)); with email not configured it fails instead of pretending to send.
- Admins can move an approved guest to another of their host's tables, never past its capacity. A move automatically sends the guest a new card.
- Cancelling an approved invitation keeps the record (table, approval and card details, plus a cancellation time) and frees the seat and the host's place at once. Nothing is deleted, and the guest can be approved again later.
