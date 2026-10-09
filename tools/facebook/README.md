# Facebook data → MongoDB (blended, like Bing)

The Facebook page reads these collections and blends them live on every request:

| Collection | Source | One document = |
|---|---|---|
| `facebook_ad_reports_2` | Facebook Ads export (new) | day × campaign × ad set × ad × gender × age: spend, impressions, clicks, landing page views, provider |
| `facebook_ad_reports` | older data — kept in MongoDB as a backup, **not read** by the dashboard | as stored |
| `facebook_conversions` | Partner export | day × ad × event: count, revenue, device, geo |
| `facebook_providers` | Provider fee sheet | provider + fee % |

`reportAggregate()` in `backend/src/services/fbStatistics.service.ts` takes the
`facebook_ad_reports_2` rows, sets each row's fee % from `facebook_providers` (rows without a
provider count as spend with no fee), and adds the partner events from `facebook_conversions` as
extra rows (funnel + revenue, no spend). Every Facebook endpoint aggregates those rows, so spend
comes from Facebook and the funnel and revenue from the partner, joined on **day + ad name**.
The older `facebook_ad_reports` collection is not used.

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

## Providers

Change a fee % directly in `facebook_providers` (or edit the sheet and
re-import): every dashboard number follows immediately — no need to re-import the reports.

## Notes

- Partner events whose ad name is not in the Facebook export on that day still count toward
  revenue and the funnel, under their own ad name, with no spend.
