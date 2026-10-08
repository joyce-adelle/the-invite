# TheInvite

A lightweight event invitation app. Guests request an invitation from the host who invited them; admins approve requests, which assigns a table and emails the guest a personalised two-page PDF access card.

- **Next.js 16** (App Router, Cache Components) · **React 19** · **Tailwind CSS v4**
- **Google Sheets** is the data store. There is no database.
- **Auth.js** passwordless email sign-in for admins
- **Resend** for magic-link and access-card emails
- **pdf-lib** overlays guest details onto the card template

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

All environment variables are server-only. See [.env.example](.env.example) for what each one is.

### Google Sheet

1. Create a Google Cloud service account and download its JSON key. Copy `client_email` into `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` into `GOOGLE_PRIVATE_KEY`.
2. Enable the Google Sheets API for that project.
3. Create a spreadsheet, share it with the service-account email as **Editor**, and put its ID in `GOOGLE_SHEET_ID`.
4. Add a tab named `Guests` with this header row:

   ```text
   id | name | email | invitedBy | status | table | cardStatus | createdAt | approvedAt | cardSentAt
   ```

### Resend

Verify your sending domain in Resend, then set `RESEND_API_KEY` and `EMAIL_FROM`.

## Where things live

| Path | Purpose |
| --- | --- |
| [config/event.ts](config/event.ts) | Hosts, capacities, tables and access-card overlay settings (dummy values for now) |
| [lib/guest.ts](lib/guest.ts) | Guest record type and sheet column order |
| [lib/env.ts](lib/env.ts) | Validated server-only environment access and the admin allow-list |
| [app/globals.css](app/globals.css) | Theme tokens (brand palette, radius, shadows, fonts) used by every component |
| [components/ui/](components/ui/) | shadcn/ui components (Radix base); add more with `npx shadcn@latest add <name>` |
| [components/layout/](components/layout/) | `Container`, `PublicShell`, `AdminShell`, `PageHeader` |
| [template/New.pdf](template/New.pdf) | The single access-card template (page 1 unchanged, page 2 gets the overlay) |

## Business rules

- One access card admits one person; couples need two cards.
- Each email address can request one invitation in total, under any host.
- Only approved guests count towards capacity. Approval assigns the next table with a free seat.
- Changing a guest's table does not resend their card. Admins resend it explicitly.
