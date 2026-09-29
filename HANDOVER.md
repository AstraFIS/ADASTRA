# ADASTRA — handover notes

Short orientation for whoever picks this up. `README.md` has the full detail
(every endpoint, every model field, every script); this page is the map.

## What it is

An admin panel for **Direct Meds ED media performance**. Facebook is the only
connected platform; Google and Microsoft are placeholders on the overview page.

| Part | Stack | Where |
|---|---|---|
| `backend/` | Express 5 + TypeScript 7, Mongoose 9, zod, JWT auth | Vercel serverless (`api/index.ts` wraps the Express app) — https://adastra-backend-black.vercel.app |
| `frontend/` | React 19 + Vite 8 + Tailwind 4, react-router 7 | Vercel static SPA — https://adastra-frontend.vercel.app |
| Database | MongoDB Atlas, database `adastra` | connection string in `backend/src/config/settings.ts` |

Repo: `github.com/Vuqar111/ADASTRA` (npm workspaces: root `package.json` runs both).

## Things to know on day one

- **Config is checked in.** `backend/src/config/settings.ts` holds the Mongo URI
  and the JWT secret by the owner's decision. Keep the repo private. Any value
  can be overridden by an environment variable of the same name; nothing is
  required in Vercel.
- **Sign-in.** Everything except `/login` needs a JWT (`Authorization: Bearer`).
  There is one account, `test@email.com` / `test123` (admin) — change it. Admins
  manage users at `/users`; if the users collection is ever empty, `/login`
  offers a one-time "create the first admin" form.
- **Ranges are anchored on the data, not the clock.** "This Month" means the
  month of the latest `report_date` in the collection (currently 2026-09-25).
- **Health check:** `GET /api/health` → `{"status":"ok","db":"connected"}`. If
  the function can't start it answers with JSON that names the problem.

## Run it locally

```bash
npm install
npm run dev             # backend :4000 + frontend :5173 (Vite proxies /api)
npm run typecheck       # both workspaces — run before pushing
npm run build           # both workspaces
```

Local dev uses `backend/.env` only for `PORT` / `CLIENT_ORIGIN` overrides; the
DB is the real Atlas database, so be careful with write scripts.

## How data flows

1. **Source of truth:** collection `facebook_ad_reports`, model
   `backend/src/models/facebookAdReport.model.ts`. One document per
   day × ad × campaign × ad set × age × gender, snake_case fields matching the
   source sheet. Base numbers come from the sheet; the model **recomputes every
   derived column on save** (provider fee, total spend, CTR, CPC, gross/net
   profit, ROAS, CAC). `upsertRow()` is the only sane way to write rows.
2. **Read endpoints** (all under `/api/platforms/facebook/`, all accept
   `range` or `from`/`to`, plus `ad` and `offer`): `statistics`, `charts`,
   `daily-trend`, `funnel`, `options`, `ads/:adName/statistics`. Services live
   in `backend/src/services/fb*.service.ts`; shared range/filter helpers in
   `fbStatistics.service.ts`.
3. **Pages:** `/platforms/facebook` (dashboard, fully DB-driven),
   `/platforms/facebook/ads/:adName` (DB-driven except the "marketing read" and
   "creative taxonomy" cards), `/` (overview — still demo data), `/users`.
4. **Demo data:** `backend/src/services/facebook.service.ts` is an in-memory
   seed that still powers the overview page and the two seed-based cards on the
   ad page. `npm run seed:facebook -w backend` loads the same rows into the DB
   for local testing — **don't run it against production.**

## The current pain point: imports

Rows have been loaded into Mongo directly (Compass / mongoimport) twice, and
both times types broke: ad names stored as numbers, `provider_fee_pct` as `638`
instead of `6.38`, money columns as text like `"1.732.808"`. The read endpoints
defend against this (a percentage above 100 is read as ×100, and fees / totals
are computed from `spend_usd` in the pipeline rather than summed from the
stored derived columns), so the dashboards are right — but the stored derived
columns are still wrong until the normaliser runs.

- After **any** direct import run the normaliser. Dry run first, then apply:
  ```bash
  npm run normalize:facebook -w backend              # reports what it would change
  npm run normalize:facebook -w backend -- --apply   # fixes types, recomputes derived columns, swaps the unique index
  ```
  As of 2026-09-29 the apply step has **not** been run on production.
- The real fix is an **import endpoint** that goes through
  `FacebookAdReport.upsertRow()` (casts, normalises, recomputes). That is the top
  of the TODO list below.

## Open work, in rough priority

1. Import endpoint (CSV/XLSX upload or JSON) using `upsertRow`; then retire the
   normaliser as a one-off tool.
2. Run the normaliser on production (see above).
3. Ad page: move the marketing read (`buildRead()` rules already exist in
   `facebook.service.ts`) and creative taxonomy onto real data.
4. Overview page `/` onto real data (`platforms.service.ts` is static).
5. "Recommendations" and "Creatives" buttons are disabled placeholders.
6. `image_url` / `video_url` exist on the model; nothing displays them yet.
7. Decide the CTR/CPC definition: KPI tiles use link clicks ÷ impressions and
   spend ÷ link clicks; the funnel table uses `clicks_all` (Facebook's
   "(all)" metrics). Both are one-line changes in the services.
8. The login rate limiter is in-memory, i.e. per serverless instance.

## Where to look

| Need | File |
|---|---|
| Auth middleware / `req.user` | `backend/src/middleware/auth.ts` |
| Login / setup / users API | `backend/src/controllers/auth.controller.ts`, `user.controller.ts` |
| Report model + derived formulas | `backend/src/models/facebookAdReport.model.ts` |
| Date ranges | `backend/src/utils/dateRange.ts`, `resolveReportBounds()` in `fbStatistics.service.ts` |
| Vercel entry | `backend/api/index.ts`, `backend/vercel.json` |
| Frontend API client / token | `frontend/src/lib/api.ts`, `frontend/src/auth/` |
| Charts | `frontend/src/components/BarChart.tsx`, `LineChart.tsx` |
| Theme tokens | `frontend/src/index.css` (`@theme`) |

## Testing

There is no automated test suite. Changes so far were verified with ad-hoc
scripts (HTTP checks against a throwaway `adastra_test` database — set
`MONGODB_DB_NAME=adastra_test` — and headless Chrome screenshots). At minimum
run `npm run typecheck` and `npm run build` before pushing; adding real tests is
worthwhile.
