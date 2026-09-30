# ADASTRA — handover notes

Short orientation for whoever picks this up. `README.md` has the full detail
(every endpoint, every model field, every script); this page is the map.

## What it is

An admin panel for **Direct Meds ED media performance**. Facebook and Microsoft
(Bing) are the connected platforms; Google is a placeholder on the overview page.
The Bing page (`/platforms/microsoft`, "Bing" in the top bar, linked from the
overview) so far shows the partner conversion export only — see "How data flows".

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
- **Access lists.** Each user has `access: { facebook: ['Meta1'|'Meta2'], google, microsoft }`,
  edited on `/users`. Collection `ad_access` (`ad_name` → `user_access_type`) says which
  Facebook ads are in Meta1 / Meta2; a user sees only the ads listed under their groups
  (ads missing from `ad_access` are hidden from every non-admin). Admins always see everything. Enforced in the API
  (`requirePlatform`, `facebookAdScope` → `reportBaseMatch`), mirrored in the nav and routes.
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
   `/platforms/facebook/ads/:adName` (DB-driven, including the "Creative &
   Recommendation" card's text; its creative reads `frontend/creatives.json`
   and the creative taxonomy card reads `frontend/data.json`), `/` (overview — still demo data), `/users`.
4. **Demo data:** `backend/src/services/facebook.service.ts` is an in-memory
   seed that still powers the overview page (and the ad page's header as a
   fallback when the statistics call fails). `npm run seed:facebook -w backend` loads the same rows into the DB
   for local testing — **don't run it against production.**
5. **Bing:** `GET /api/platforms/microsoft/dashboard` →
   `backend/src/services/bing.service.ts`. The partner conversion export
   (clicks and funnel stages per day × offer) is an in-memory list,
   `PARTNER_ROWS`. `AD_ROWS` (Bing Ads spend / impressions / clicks per
   day × offer) is empty, so the KPI tiles read zero and Amount Spent / CTR /
   CPC / CAC / ROAS show "Pending". Add rows there (or move both to a
   collection) and the page fills in without frontend changes.

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
3. Ad page: the recommendation rules (`fbRecommendation.service.ts`) are a
   first pass on real data — statuses, thresholds and test-plan wording are
   worth reviewing with the media buyers. The creative taxonomy reads
   `frontend/data.json` (edit that file to add / change classifications; it
   is bundled into the frontend at build time).
4. Overview page `/` onto real data (`platforms.service.ts` is static).
5. The "Creatives" button on the Facebook dashboard is a disabled placeholder.
6. The ad page's creative (image / video / landing link) comes from
   `frontend/creatives.json`, matched on the exact ad name and bundled at build
   time. `image_url` / `video_url` on the model are still not displayed.
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
