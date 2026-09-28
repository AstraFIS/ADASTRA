# ADASTRA Admin Panel

Monorepo with two npm workspaces:

| Folder      | Stack                                   | Dev URL                |
| ----------- | --------------------------------------- | ---------------------- |
| `backend/`  | Express 5 + TypeScript + Mongoose       | http://localhost:4000  |
| `frontend/` | React 19 + Vite + TypeScript + Tailwind | http://localhost:5173  |

## Setup

```bash
npm install                 # installs both workspaces
cp backend/.env.example backend/.env
```

Then fill in `backend/.env`:

| Variable          | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `MONGODB_URI`     | MongoDB connection string (Atlas `mongodb+srv://`) |
| `MONGODB_DB_NAME` | Database name, defaults to `adastra`               |
| `JWT_SECRET`      | Signing secret, 32+ chars (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN`  | Token lifetime, defaults to `7d`                   |
| `PORT`            | Backend port, defaults to `4000`                   |
| `CLIENT_ORIGIN`   | Allowed CORS origin, defaults to the Vite dev URL  |
| `ADMIN_*`         | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` for the seed script only |

Create the first admin account (user creation is admin-only, so this bootstraps it):

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
`/api/...` without CORS config in development.

## API

| Method | Path                      | Returns                                              |
| ------ | ------------------------- | ---------------------------------------------------- |
| GET    | `/api/health`             | `status`, `db` connection state, uptime              |
| POST   | `/api/auth/login`         | `{ email, password }` → `{ token, user }` (rate limited: 10 / 15 min) |
| GET    | `/api/auth/me`            | Current user. Requires `Authorization: Bearer <token>` |
| POST   | `/api/users`              | `{ name, email, password, role? }` → `201 { user }`. Admin only |
| GET    | `/api/platforms/overview` | Client/portfolio, totals, and per-platform summaries |
| GET    | `/api/platforms/facebook/dashboard` | Facebook KPIs + provider fees. Query: `range` (`this_month`, `last_month`, `last_7_days`, `last_30_days`, `all_time`), `ad`, `offer` |
| GET    | `/api/platforms/facebook/ads/:adName` | One ad for the `range`: metrics, account-average comparisons (CTR, CPC, CAC), a rule-based marketing read (`scale` / `monitor` / `review` / `low_sample` / `no_data`), its creative taxonomy (two field groups with per-field confidence) and a daily series covering every reporting day in the range (zeros when the ad did not run; `cac` is null on days without purchases). 404 for unknown ads |

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

| Route              | Page                                                       |
| ------------------ | ---------------------------------------------------------- |
| `/`                | All Platforms Overview: tabs, KPI tiles, chart, platform cards |
| `/platforms/facebook` | Ad Performance Dashboard: filters (URL-synced), 7 KPI tiles, provider fee cards, revenue-vs-spend by ad chart, audience by age / gender, daily revenue vs. gross profit trend, sortable funnel table by ad & offer |
| `/platforms/facebook/ads/:adName` | Ad detail: KPI tiles with account-average comparisons, "Marketing read" card (status badge, bullets, recommended next step), Creative Taxonomy card, Cost of Acquisition daily trend (filled dot = CAC, hollow red ring = spend but no purchases, gap = no spend), the ad's revenue vs. gross profit trend. Linked from the funnel table |
| `/platforms/:slug` | Placeholder for platforms not yet connected                |
| `/login`           | Sign-in placeholder                                        |

`src/components/BarChart.tsx` is the shared SVG bar chart (single or grouped
series, value labels, hover/focus tooltip, screen-reader table). It sizes to its
wrapper, so give it a fixed `height` or a `flex-1`/`min-h` wrapper.
`src/components/LineChart.tsx` is the matching multi-series line chart with a
crosshair tooltip (hover, or focus + arrow keys), point labels that hide when
points get dense, and a dashed zero line when values go negative. A `null`
value breaks the line; `hollowAt` indexes draw a ring on the zero line.
`src/components/CreativeTaxonomyCard.tsx` renders the taxonomy in two columns
and flags fields under 70% confidence.
`src/components/FunnelTable.tsx` is the sortable funnel table (click a header;
"Hide inactive ads" toggle; ads under 10 clicks show "low sample"; clicking an
ad name opens its detail page).

The marketing read is deterministic and lives in `buildRead()` in
`backend/src/services/facebook.service.ts`: net ROAS ≥ 25% → Scale,
between −25% and 25% → Monitor, below −25% → Review; under 10 clicks → Low
sample; no spend or clicks → No data. Comparisons use the account-wide blended
CTR / CPC / CAC for the same period; within ±2% reads as "in line".

Theme tokens (surfaces, ink, `revenue` / `spend` / `loss` accents) are defined
in `frontend/src/index.css` under `@theme` and used as Tailwind utilities
(`bg-surface`, `text-ink-2`, `border-l-revenue`, ...).

## Build

```bash
npm run build               # backend → backend/dist, frontend → frontend/dist
npm run typecheck           # tsc on both workspaces
```
