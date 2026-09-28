# ADASTRA Admin Panel

Monorepo with two npm workspaces:

| Folder      | Stack                                   | Dev URL                |
| ----------- | --------------------------------------- | ---------------------- |
| `backend/`  | Express 5 + TypeScript + Mongoose       | http://localhost:4000  |
| `frontend/` | React 19 + Vite + TypeScript + Tailwind | http://localhost:5173  |

## Setup

```bash
npm install                 # installs both workspaces
```

Backend configuration lives in `backend/src/config/settings.ts` and is
checked in, so no environment variables are needed to run or deploy. Because
it contains live credentials (MongoDB URI, JWT secret), keep the repository
private.

Environment variables are optional overrides (a local `backend/.env` is read by
the dev server and the seed script; hosting platforms can set them too):

| Variable          | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `MONGODB_URI`     | MongoDB connection string (Atlas `mongodb+srv://`) |
| `MONGODB_DB_NAME` | Database name, defaults to `adastra`               |
| `JWT_SECRET`      | Signing secret, 32+ chars (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN`  | Token lifetime, defaults to `7d`                   |
| `PORT`            | Backend port, defaults to `4000`                   |
| `CLIENT_ORIGIN`   | Comma-separated allowed browser origins, defaults to the Vite dev URL |
| `TRUST_PROXY`     | `true` behind a reverse proxy; Vercel is detected automatically |
| `ADMIN_*`         | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` for the seed script only |

Create the first admin account. The easiest way is the app itself: while no
users exist, `/login` shows a one-time "Create the first admin account" form
(backed by `POST /api/auth/setup`, which refuses once any user exists). The seed
script does the same from the terminal:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' npm run seed:admin -w backend
```

The backend refuses to start without `MONGODB_URI`. `GET /api/health` returns
`503` with `"db": "disconnected"` if the database connection drops.

## Run

```bash
npm run dev                 # backend + frontend together
npm run dev:backend         # backend only
npm run dev:frontend        # frontend only
```

The Vite dev server proxies `/api/*` to the backend, so the frontend can call
`/api/...` without CORS config in development. Production builds call the
deployed backend (`PRODUCTION_API_URL` in `frontend/src/config.ts`) unless
`VITE_API_URL` is set at build time. `frontend/vercel.json` rewrites deep
links to `index.html` for SPA routing on Vercel.

## Deploying the backend to Vercel

`backend/` deploys as a single serverless function: `backend/vercel.json`
rewrites every path to `backend/api/index.ts`, which opens (and caches) the
Mongo connection and hands the request to the Express app. `src/index.ts` is
only used for local / long-running hosting. The build command there runs
`tsc` as a type-check gate. Vercel's framework-less mode insists on a non-empty
static output directory even for an API-only project, so `backend/public/`
holds a `robots.txt` (disallow all) and nothing else; the rewrite sends every
other path to the function.

Vercel project settings:

- **Root Directory**: `backend`
- **Environment variables**: none required — values come from
  `src/config/settings.ts`. Set any of `MONGODB_URI`, `MONGODB_DB_NAME`,
  `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_ORIGIN`, `NODE_ENV` only to override.
  CORS allows the origins in `SETTINGS.CLIENT_ORIGINS` plus every
  `https://*.vercel.app` origin, so a Vercel-hosted frontend works without
  further config.
- **MongoDB Atlas → Network Access** must allow connections from anywhere
  (`0.0.0.0/0`); Vercel functions do not have fixed IPs.

Check it with `GET /api/health` → `{"status":"ok","db":"connected",...}`.
If the function cannot start it answers with JSON instead of Vercel's generic
error page: `500 {"error":"Server is not configured","problems":[...]}` lists
the missing variables, and `503 {"error":"Database unavailable","reason":...}`
means the connection string or the Atlas allow-list is wrong.

## Data models

- `backend/src/models/user.model.ts` — accounts (see Auth).
- `backend/src/models/facebookAudienceReport.model.ts` — `FacebookAudienceReport`,
  collection `facebook_audience_reports`: one row per day × ad × breakdown
  (`age` | `gender`) × bucket (`18-24` … `65+`, `unknown`; `male`, `female`,
  `unknown`) with `impressions`, `clicks_all`, `link_clicks`, `spend_usd`.
  Buckets are normalised on save; `upsertRow` keys on (date, ad, breakdown,
  bucket). Feeds the audience charts.
- `backend/src/models/facebookAdReport.model.ts` — `FacebookAdReport`, one
  document per reporting row (a Facebook ad on one day within one campaign /
  ad set), collection `facebook_ad_reports`. Field names are snake_case to
  match the source sheet: `report_date`, `ad_name`, `offer_name`,
  `campaign_name`, `ad_set_name`, `provider_name` (null when none),
  `spend_usd`, `provider_fee_pct`, `provider_fee_usd`, `total_spend_usd`,
  `impressions`, `clicks_all`, `link_clicks`, `landing_page_views`, `ctr_all`,
  `cpc_usd`, `presell_visits`, `first_page_views`, `questionnaire_starts`,
  `leads_partial`, `add_to_carts`, `purchase_events`, `conversions`,
  `revenue_usd`, `gross_profit_usd`, `net_profit_usd`, `roas_pct`, `cac_usd`.
  Derived on every save: fee = spend × pct ÷ 100, total = spend + fee,
  ctr_all = clicks_all ÷ impressions × 100, cpc_usd = spend ÷ clicks_all,
  gross profit = revenue − spend, net profit = revenue − total spend,
  roas_pct = net profit ÷ total spend × 100, cac_usd = total spend ÷
  conversions (null when a denominator is 0; the fee is forced to 0 without a
  provider). Unique per (report_date, ad_name, campaign_name, ad_set_name), so
  `FacebookAdReport.upsertRow(input)` makes re-imports idempotent;
  `toPublicFacebookAdReport(doc)` is the API shape.

### Loading Facebook data

The KPI tiles on the Facebook page read from the `facebook_ad_reports`
collection, which starts empty (the tiles then show zero with a hint). To load
the demo rows that the rest of the dashboard uses:

```bash
npm run seed:facebook -w backend      # upserts 24 report rows + 240 audience rows; safe to re-run
```

Real data goes in through `FacebookAdReport.upsertRow(...)` and
`FacebookAudienceReport.upsertRow(...)` (an import endpoint is the next step).
Only the provider fee cards on that page still come from the in-memory seed.

## API

| Method | Path                      | Returns                                              |
| ------ | ------------------------- | ---------------------------------------------------- |
| GET    | `/api/health`             | `status`, `db` connection state, uptime              |
| GET    | `/api/auth/status`        | `{ needsSetup }` — true while no user exists          |
| POST   | `/api/auth/setup`         | First-run only: `{ name, email, password }` → `201 { token, user }` as admin; `409` afterwards |
| POST   | `/api/auth/login`         | `{ email, password }` → `{ token, user }` (rate limited: 10 / 15 min) |
| GET    | `/api/auth/me`            | Current user. Requires `Authorization: Bearer <token>` |
| GET    | `/api/users`              | List all users. Admin only |
| POST   | `/api/users`              | `{ name, email, password, role? }` → `201 { user }`. Admin only |
| GET    | `/api/users/:id`          | One user. Admin only |
| PATCH  | `/api/users/:id`          | Any of `name`, `email`, `password`, `role`, `isActive`. Admin only. Refuses to remove your own admin access, to deactivate yourself, or to demote/deactivate the last active admin |
| DELETE | `/api/users/:id`          | `204`. Admin only. Refuses your own account and the last active admin |
| GET    | `/api/platforms/*`        | **All platform endpoints below require a Bearer token** (401 otherwise) |
| GET    | `/api/platforms/overview` | Client/portfolio, totals, and per-platform summaries |
| GET    | `/api/platforms/facebook/statistics` | KPIs computed from the `facebook_ad_reports` collection: `total_revenue`, `total_amount_spend` (incl. provider fees), `net_profit`, `landing_page_views`, `link_clicks`, `cpc` (spend before fees ÷ link clicks), `ctr` (link clicks ÷ impressions, %). Query: `range` (anchored on the latest reported day), or explicit `from`/`to` (YYYY-MM-DD), plus `ad`, `offer`. Also returns `meta` (rows, ads, impressions, spend before fees, provider fees) |
| GET    | `/api/platforms/facebook/charts` | Chart data from the report collections with the same query params as statistics: `revenue_vs_spend_by_ad` (per ad: `revenue_usd`, `total_spend_usd`, `spend_usd`, `link_clicks`, sorted by total spend), `audience_by_age` and `audience_by_gender` (`bucket`, `label`, `link_clicks`, `impressions`; every bucket present, zeros included) |
| GET    | `/api/platforms/facebook/daily-trend` | Per-day totals from the report collection with the same query params: `daily[]` of `date`, `revenue_usd`, `spend_usd`, `provider_fee_usd`, `total_spend_usd`, `gross_profit_usd` (revenue − spend), `net_profit_usd` (revenue − total spend), `link_clicks`, `conversions`, `cac_usd`; only days that have rows |
| GET    | `/api/platforms/facebook/funnel` | "Funnel Performance by Ad Name & Offer": one row per `ad_name` × `offer_name` with `providers`, `first_date`/`last_date`/`days`, `active` (reported within the last 7 days of the result), `spend_usd`, `provider_fee_usd`, `total_spend_usd`, `impressions`, `clicks_all`, `link_clicks`, `ctr_all`, `cpc_usd`, the stage counts `first_page_views` → `questionnaire_starts` → `leads_partial` → `add_to_carts` → `purchase_events`, `conversions`, `revenue_usd`, `net_profit_usd`, `cac_usd`, `roas_pct`; same query params as statistics |
| GET    | `/api/platforms/facebook/dashboard` | Facebook KPIs + provider fees. Query: `range` (`this_month`, `last_month`, `last_7_days`, `last_30_days`, `all_time`), `ad`, `offer` |
| GET    | `/api/platforms/facebook/ads/:adName` | One ad for the `range`: metrics, account-average comparisons (CTR, CPC, CAC), a rule-based marketing read (`scale` / `monitor` / `review` / `low_sample` / `no_data`), its creative taxonomy (two field groups with per-field confidence), its own audience buckets (link clicks by age / gender) and a daily series covering every reporting day in the range (zeros when the ad did not run; each day carries `funnel` counts, `cac` — null without purchases — and `roas` — null without spend). 404 for unknown ads |

Errors are JSON: `{ error }`, plus `details: [{ path, message }]` on `400`
validation failures. Roles are `admin` and `user`. Passwords are hashed with
bcrypt and never returned by the API.

Platform data currently lives in `backend/src/services/platforms.service.ts`
as static values until the Facebook / Google / Microsoft integrations exist.

The Facebook dashboard aggregates per-ad daily rows in
`backend/src/services/facebook.service.ts` (seed data for now). Date ranges are
anchored to the dataset's `dataThrough` date, so "This Month" means the month of
the latest data point. Derived metrics: total spent = raw spend + provider fees
(fee = provider's spend × fee rate); net profit = revenue − total spent;
ROAS = net profit ÷ total spent; CPC = raw spend ÷ link clicks;
CTR = link clicks ÷ impressions. The response also carries `byAd` (per-ad
revenue and grossed-up spend, sorted by spend) and `audience` (link clicks split
by age bucket and by gender; in the seed these come from per-ad share profiles)
and `daily` (one point per day that has rows: revenue, spend before/after fees,
gross profit = revenue − spend before fees, net profit = revenue − spend with fees).
Each `byAd` entry also carries `active`, `impressions`, `ctr`, `cpc`, `cac`
(= spend ÷ purchases), `roas` and a `funnel` object (firstPageView → qs → lead →
addToCart → purchase) for the funnel table; step-over-step percentages are
computed client-side.

## Frontend pages

Every route except `/login` sits behind `RequireAuth`
(`src/auth/RequireAuth.tsx`): without a valid token the app redirects to
`/login`, and signing in always lands on the home page. The token lives
in `localStorage` (`adastra.token`), is attached to every API call by
`src/lib/api.ts`, is re-validated against `/api/auth/me` on page load, and any
`401` from the API signs the user out. `useAuth()` from `src/auth/AuthContext.tsx`
exposes `user`, `status`, `login`, `setup` and `logout`.

| Route              | Page                                                       |
| ------------------ | ---------------------------------------------------------- |
| `/`                | All Platforms Overview: tabs, KPI tiles, chart, platform cards |
| `/platforms/facebook` | Ad Performance Dashboard: filters (URL-synced), 7 KPI tiles **fed by `/api/platforms/facebook/statistics`**, provider fee cards, revenue-vs-spend by ad chart and audience by age / gender **fed by `/api/platforms/facebook/charts`**, daily revenue vs. gross profit trend **fed by `/api/platforms/facebook/daily-trend`**, funnel table **fed by `/api/platforms/facebook/funnel`** (all from the report collections), daily revenue vs. gross profit trend, sortable funnel table by ad & offer |
| `/platforms/facebook/ads/:adName` | Ad detail: KPI tiles with account-average comparisons, "Marketing read" card (status badge, bullets, recommended next step), a row of four mini charts (funnel stages as independent shares of link clicks with the weakest stage called out, revenue vs. spend, audience by age / gender for this ad), Creative Taxonomy card, Cost of Acquisition daily trend (filled dot = CAC, hollow red ring = spend but no purchases, gap = no spend), Daily Performance table (per-day funnel with step-over-step %, CAC, ROAS; idle days omitted), the ad's revenue vs. gross profit trend. Linked from the funnel table |
| `/platforms/:slug` | Placeholder for platforms not yet connected                |
| `/login`           | Sign in, or first-run admin setup when no users exist      |
| `/users`           | Admin only (`RequireRole`): list, add, edit, activate/deactivate, delete users. Nav link shows only for admins |

`src/components/BarChart.tsx` is the shared SVG bar chart (single or grouped
series, value labels, hover/focus tooltip, screen-reader table). It sizes to its
wrapper, so give it a fixed `height` or a `flex-1`/`min-h` wrapper. Category
labels wrap onto up to three lines in narrow groups and the bottom margin grows
to fit.
`src/components/LineChart.tsx` is the matching multi-series line chart with a
crosshair tooltip (hover, or focus + arrow keys), point labels that hide when
points get dense, and a dashed zero line when values go negative. A `null`
value breaks the line; `hollowAt` indexes draw a ring on the zero line.
`src/components/CreativeTaxonomyCard.tsx` renders the taxonomy in two columns
and flags fields under 70% confidence. `src/components/DailyPerformanceTable.tsx`
is the per-day funnel table on the ad page.

Funnel stage naming: the source sheet's "Q.S." is the quiz-start stage and
"Lead / Partial" is the quiz-end stage; the funnel table keeps the sheet's
labels while the daily table uses Page Visit / Quiz Start / Quiz End / Add to
Cart / Purchased for the same fields.
`src/components/FunnelTable.tsx` is the sortable funnel table over the
`/funnel` rows (click a header; hovering a header shows the source field and
formula; "Hide inactive ads" toggle; ads under 10 clicks show "low sample";
clicking an ad name opens its detail page). CTR (all) and CPC (all) in this
table use `clicks_all`, as in the model; the KPI tiles use link clicks.

The marketing read is deterministic and lives in `buildRead()` in
`backend/src/services/facebook.service.ts`: net ROAS ≥ 25% → Scale,
between −25% and 25% → Monitor, below −25% → Review; under 10 clicks → Low
sample; no spend or clicks → No data. Comparisons use the account-wide blended
CTR / CPC / CAC for the same period; within ±2% reads as "in line".

`src/layouts/AdminLayout.tsx` is a top bar only (brand, Overview / Facebook
links, current user, sign out) — there is no sidebar; pages use the full width.

Theme tokens (surfaces, ink, `revenue` / `spend` / `loss` accents) are defined
in `frontend/src/index.css` under `@theme` and used as Tailwind utilities
(`bg-surface`, `text-ink-2`, `border-l-revenue`, ...).

## Build

```bash
npm run build               # backend → backend/dist, frontend → frontend/dist
npm run typecheck           # tsc on both workspaces
```
