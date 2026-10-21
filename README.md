# TheInvite

A lightweight event invitation app. Guests request an invitation from the host who invited them; admins approve requests, which assigns a table and emails the guest a personalised two-page PDF access card.

- **Next.js 16** (App Router, Cache Components) · **React 19** · **Tailwind CSS v4**
- **PostgreSQL** via **Prisma 7**. Local Postgres runs in Docker; production is any hosted Postgres set through `DATABASE_URL`.
- **Better Auth** sign-in: username and password, with users, sessions and password hashes in Postgres (the `username` and `admin` plugins and the Prisma adapter). Two roles: **admins**, made by the seed from `ADMIN_USERNAME` / `ADMIN_PASSWORD`, and **check-in** accounts for door staff, made by admins in the app. There is no sign-up
- **Resend** for access-card emails
- **pdf-lib** overlays guest details onto the card template

## Setup

Requires Node 20.19+ and Docker.

```bash
npm install                   # also generates the Prisma client
cp .env.example .env.local    # then fill in the values
docker compose up -d          # local Postgres on localhost:5433
npm run db:migrate            # apply migrations (prisma migrate dev)
npm run db:seed               # create the hosts and tables, and the admin from ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev
```

All environment variables are server-only. See [.env.example](.env.example) for what each one is.

### Database

- `DATABASE_URL` is the only database setting. The Prisma CLI reads it from `.env.local` just like Next.js does ([prisma.config.ts](prisma.config.ts)).
- Local data persists in the `pgdata` Docker volume across restarts. `docker compose down -v` deletes it.
- **Schema changes:** edit [prisma/schema.prisma](prisma/schema.prisma), then run `npm run db:migrate -- --name <change>` and commit the new folder in `prisma/migrations/`.
- **Admins** are rows in the `users` table with the `admin` role. The first is made by the seed ([lib/admin-account.ts](lib/admin-account.ts)), which won't turn an existing check-in account into one; after that, any admin can add more under **Staff accounts** with a username and password, and disable, re-enable or reset the password of any other admin. The **default admin**, the one `ADMIN_USERNAME` names, is the exception: no one can change it from the app, so there is always an admin who can't be locked out (keep `ADMIN_USERNAME` set on the server). Re-running the seed changes its password or re-enables it. To add one, or to change a password, run `npm run db:seed` with the new `ADMIN_USERNAME` / `ADMIN_PASSWORD`; changing a password signs that admin out everywhere. Sessions are stored in the database so signing out or deleting a user ends them at once.
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

## Staff accounts

Admins manage accounts at **Staff accounts** in the admin header ([app/admin/(protected)/accounts](app/admin/(protected)/accounts/page.tsx)). **Add admin** creates another admin with a username and password; Better Auth only lets a caller with permission to set roles do that, which a check-in account never has. Every account, admin or check-in, can be disabled, re-enabled or given a new password ([lib/staff-accounts.ts](lib/staff-accounts.ts)), except the default admin from `ADMIN_USERNAME` and the admin's own account; the server refuses both, whatever the page shows. A disabled admin is signed out everywhere and has no admin rights until re-enabled. The rest of this section is about check-in accounts.

### Check-in accounts

Door staff get their own accounts, with the `check_in` role, so they can check guests in without any admin rights. Admins manage them under **Check-in users** on the same page: create one with a username and password, see which are active, disable or re-enable one, and reset a password.

- **Same accounts, same sign-in.** They are ordinary Better Auth users (the `users` and `accounts` tables), told apart by `users.role` (`admin` or `check_in`, the only values the database accepts). Roles come from Better Auth's `admin` plugin ([lib/auth.ts](lib/auth.ts)): admins keep its full admin permissions, check-in accounts get none, so Better Auth itself refuses a check-in account that tries to create, change, disable or reset any account, its own included. Usernames are unique across every account and not case sensitive; passwords need at least 8 characters and are hashed by Better Auth. No email is needed: Better Auth requires one on every account, so a placeholder nobody sees is stored.
- **Managed through Better Auth's API.** The admin page's server actions ([lib/actions/staff-accounts.ts](lib/actions/staff-accounts.ts)) check for an admin first, then call Better Auth's admin API with that admin's own headers ([lib/staff-accounts.ts](lib/staff-accounts.ts)), so the role is checked twice.  None of Better Auth's admin endpoints are reachable over HTTP ([app/api/auth](app/api/auth/[...all]/route.ts) only allows sign-in and sign-out).
- **Disabling** is the plugin's "ban": the account can't sign in (it's told it has been disabled), and every session it has is deleted at once, so a phone left signed in can't check anyone else in. A disabled account is also refused by every access check (`lib/roles.ts`), should a session ever survive. Check-ins it already made are kept. **Resetting a password** also signs the account out everywhere.
- **What a check-in account sees.** After sign-in it lands on `/check-in`, a page that only says how to scan a QR code, with its username and Sign out. A scanned QR link shows the guest's name, table, host, invitation status and check-in status, never their email, and a Confirm button. Every admin page, action and download sends it back to `/check-in` or refuses it (`requireAdmin()` in [lib/admin-session.ts](lib/admin-session.ts) checks the role, not just the session).
- **Rate limit:** Better Auth's default for production allows 3 sign-in attempts per 10 seconds from an address.

## Check-in

Every approved guest's card carries a QR code in the bottom-right corner of page 2, and the same code is shown inside the approval email (and attached PDF alongside it). It opens `<BETTER_AUTH_URL>/check-in/<token>` in the phone's own browser.

- **The token** (`Guest.checkInToken`) is 18 random bytes from the server's secure generator (24 URL-safe characters), unique in the database and unrelated to the guest's name, email or id. It is made when the guest is approved and then kept for good: resending a card, moving a table or approving someone again never changes it. A guest who was approved before QR codes existed has none until their card is next sent, when one is made once. The token is never part of the guest lists sent to the browser, and isn't logged.
- **Same code everywhere:** the PDF and the email build their QR picture from one address (`checkInUrl` in [lib/check-in/check-in.ts](lib/check-in/check-in.ts)), and the card is regenerated from current details every time, so a new table shows while the code stays the same. Where the code sits on the card is `accessCard.qr` in [config/event.ts](config/event.ts).
- **The page** ([app/check-in/[token]](app/check-in/[token]/page.tsx)) is for signed-in admins and check-in accounts only. Anyone else sees a generic "restricted" page that reveals nothing, whether or not the code is real, with a link to sign in that brings them back afterwards. An admin sees the guest's name, table, invitation status and check-in status, and presses **Confirm check-in**; opening the page never checks anyone in.
- **Check-in is decided by the server, once.** `checkInGuest` ([lib/data/check-in.ts](lib/data/check-in.ts)) is a single conditional update that only matches an approved guest whose check-in fields are both still empty, and fills both in the same statement, so two admins confirming at once can't both succeed: the second is told the guest already checked in, with the first admin's details, which are never overwritten. The database also refuses a check-in with only one of the two fields. Pending, rejected and cancelled invitations are refused, with the reason; a cancelled guest's old QR code no longer works.
- **Who checked in:** `checkedInBy` is a foreign key to the user id from the verified session, admin or check-in account alike, shown by username. An account that has checked guests in can't be deleted (disable it instead), so the record never dangles.
- **Dashboard:** attendance cards (approved, checked in, not yet, percentage) are counted from the database on each load, and the Approved tab has a check-in filter and column.

## Tests

`npm test` runs Node's built-in test runner. The database tests write to `DATABASE_URL`, so they skip themselves unless it points at a local database, and they delete what they create. Tests never send real email: they pass in a stand-in mail client, and [tests/no-email.ts](tests/no-email.ts) blanks the API key so a test that forgets would fail rather than send. Test files run one after another, since they share the local database. [tests/card-delivery.test.ts](tests/card-delivery.test.ts) runs the whole story (first send, failed send, resend, resend after a table change) through the real flows and the real card generator, reading the attached PDFs back. QR codes are read back with a decoder (`jsqr`) from the card's picture and from the email's, to prove they hold the same address.

## Business rules

- One access card admits one person; couples need two cards.
- An email address can be used for more than one request (e.g. a couple sharing an address). Each request is still one card for one person.
- Only approved guests count towards capacity. Pending, rejected and cancelled guests never use a place or a seat.
- A pending, rejected or cancelled guest can be approved. Approval re-reads the guest, checks the host still has a place, and seats them at the host's first table with a free seat, all under a per-host lock so simultaneous approvals can't overfill a table or approve one guest twice. If there is no room the error says what to do (cancel another invitation to free a place or seat), and the admin can then approve again. Only pending requests can be rejected.
- The access card is marked **sent** only after the email succeeds; until then it is "not sent", and a failed send is "failed" so it can be resent. The email is sent with Resend (`sendAccessCard` in [lib/access-card.ts](lib/access-card.ts)); with email not configured it fails instead of pretending to send.
- Admins can move an approved guest to another of their host's tables, never past its capacity. A move automatically sends the guest a new card.
- Cancelling an approved invitation keeps the record (table, approval and card details, plus a cancellation time) and frees the seat and the host's place at once. Nothing is deleted, and the guest can be approved again later.
