# Facebook data → MongoDB (blended, like Bing)

The Facebook page reads these collections and blends them live on every request:

| Collection | Source | One document = |
|---|---|---|
| `facebook_ad_reports` | Facebook Ads export | day × campaign × ad set × ad × gender × age: spend, impressions, clicks, landing page views, provider |
| `partner_data` | Partner export | day × ad × event: count, revenue, device, geo |
| `facebook_providers` | Provider fee sheet | provider + fee % |

`reportAggregate()` in `backend/src/services/fbStatistics.service.ts` takes the
`facebook_ad_reports` rows, sets each row's fee % from `facebook_providers` (rows without a
provider count as spend with no fee), and adds the partner events from `partner_data` as
extra rows (funnel + revenue, no spend). Every Facebook endpoint aggregates those rows, so spend
comes from Facebook and the funnel and revenue from the partner, joined on **day + ad name**.

## Updating the data

1. Convert the workbook (sheets: partner events, Facebook export, provider fees):

   ```bash
   python3 tools/facebook/build_facebook.py <workbook.xlsx> tools/facebook/data
   ```

   - Partner event names → funnel stages: First Page View, Questionnaire Started (Q.S.),
     Lead / Partial (Q.C.), AddToCart, Purchase (also counted as a conversion for CAC), Presell Visit.
     An unknown event name stops the script: add it to `STAGE` at the top.
   - Ad names are cleaned (`New+Sales+Ad` → `New Sales Ad`); a missing ad name is taken from `sub4`.
   - Facebook rows that share day/campaign/ad set/ad/gender/age (separate ads with one name) are summed.
   - The Facebook export has no offer column: each ad gets its offer from the partner file.
   - Fee % "0.0753" in the sheet is stored as 7.53.

2. Load it (dry run first, then `--apply`):

   ```bash
   npm run import:facebook -w backend -- ../tools/facebook/data
   npm run import:facebook -w backend -- ../tools/facebook/data --apply
   ```

   Report and partner files replace every document inside their own date span; providers are
   upserted by name. Or paste the three JSON files into MongoDB Atlas / Compass — dates are
   `"DD/MM/YYYY"` text, which the backend reads correctly.

## From raw exports (Meta CSV + partner ConversionsExport CSV)

When you have the Ads Manager CSV export(s) and the partner's `ConversionsExport_*.csv`
instead of the workbook:

```bash
python3 tools/facebook/build_from_exports.py --out tools/facebook/data --provider "DAMS Aleph" \
  --partner ConversionsExport.csv meta_day1.csv meta_day2.csv …
npm run import:facebook -w backend -- ../tools/facebook/data            # dry run, then --apply
```

It also stores the partner's **placement** (sub2; `an` → Audience Network), **category**
(ED / GLP) and **login** on each partner row. The dashboard shows them as the Placement chart,
the Ads by Placement table and the Category filter. A worked example is in `tools/facebook/demo/`.

## One collection for the dashboard (speed)

Every Facebook endpoint reads **`merged_data`**: one pre-merged, indexed collection with
the rows the live join produces (Meta rows + partner events as report rows, dates as Dates,
category set). Nothing has to be joined per request.

- Rows keep only the **provider name**. The fee % is matched from `facebook_providers` on every
  read (a tiny table, turned into one expression), so editing a fee shows up immediately and
  needs no rebuild.
- It is rebuilt automatically when the rows change (imported or deleted, an Ad groups save)
  and at least every 15 minutes, so in-place edits show up too.
- `npm run build:report-rows -w backend` rebuilds it immediately.
- You keep uploading to `facebook_ad_reports` / `partner_data` as before; never edit
  `merged_data` by hand (it is replaced on every rebuild).
- If it cannot be built, the endpoints fall back to the live join, so nothing breaks.

In Excel mode the same merged rows are built in memory from the workbook once per save.

## Providers

Change a fee % directly in `facebook_providers` (or edit the sheet and
re-import): every dashboard number follows immediately — no need to re-import the reports.

## Notes

- Partner events whose ad name is not in the Facebook export on that day still count toward
  revenue and the funnel, under their own ad name, with no spend.
