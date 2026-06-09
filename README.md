# TimeTracker

A Monday.com app for tracking billable time against board items. It embeds into Monday.com as two surfaces: a **dashboard** (board view) and an **item sidebar**.

**Dashboard** — the main workspace. Contains a timer for tracking time against any item, a log of all time entries across all connected boards. Finalized entries sync duration and cost back to the configured Monday.com columns.

**Item sidebar** — opens alongside a specific Monday.com item. Shows all time entries logged against that item and lets you add manual entries directly to it.

**Admin panel** — configure roles and hourly rates, choose which boards to sync, map Monday.com columns (Time Spent, Total Cost), and set board-specific rate overrides per role.

Other:

- Webhook listener keeps the local DB in sync when Monday items are moved or deleted
- Cron job reconciles board data every 30 minutes as a fallback
- UI theme follows the user's Monday.com light/dark preference

## Tech stack

- **Next.js** (App Router) + **TypeScript**
- **Mantine UI** for components
- **Zustand** for client state, **React Query** for server state
- **Supabase** (PostgreSQL) as the primary database
- **Redis** for caching Monday.com API responses
- **Monday.com SDK** + GraphQL API for board/item data and webhook events

## Environment variables

```env
# App
PORT=8301
APP_ID=<monday_app_id>
NODE_ENV=development

# Monday.com
MONDAY_API_TOKEN=<api_token>
MONDAY_SIGNING_SECRET=<webhook_signing_secret>

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<publishable_key>
NEXT_SUPABASE_SECRET_KEY=<secret_key>

# Redis
REDIS_URL=redis://default:<password>@<host>:<port>

# Optional
NEXT_PUBLIC_APP_URL=https://<your_domain>
CRON_SECRET=<secret_for_cron_endpoints>
```

## Development

```bash
npm install
npm run dev
```

Database migrations live in [supabase/migrations/](supabase/migrations/).
