# Bing data → MongoDB

The Bing dashboard reads **two collections** and joins them on every request
(day × campaign × ad group):

| Collection | Source | One document = |
|---|---|---|
| `bing_ad_reports` | Bing Ads "Ad" report (CSV) | day × campaign × ad group × ad: impressions, clicks, spend |
| `bing_conversions` | Partner conversion export (XLSX) | one funnel event: offer, revenue, device, region, campaign, ad group |

## Updating the data

1. Convert the two raw exports into clean JSON (Python 3 with pandas + openpyxl):

   ```bash
   python3 tools/bing/build_bing.py <bing_ads.csv> <partner.xlsx> tools/bing/data
   ```

   This maps the partner's event names to funnel stages ("Start Quiz", "Satrt quiz", "start_intake" → quiz start, …),
   back-fills device/region/campaign from other events of the same click, and parses ad group names
   ("PM | CON | ed pills for men" → phrase / CON / keyword). It stops if it meets an event name it doesn't know:
   add it to the `STAGE` map at the top and re-run.

2. Load the JSON into Mongo (uses the backend's database settings):

   ```bash
   npm run import:bing -w backend -- ../tools/bing/data            # dry run: shows what would change
   npm run import:bing -w backend -- ../tools/bing/data --apply
   ```

   Every existing document inside each file's date span is replaced, so re-importing an updated export
   never creates duplicates; other days are kept.

`tools/bing/data` already holds the Oct 1–8, 2026 exports, ready to import.

**Dates** are written as text `"DD/MM/YYYY"` — `"event_date": "01/10/2026"` is 1 October 2026 (day first).
You can also import the files straight into MongoDB Compass (Add Data → Import JSON): the backend reads the day
field whether it is stored as this text or as a real Date. The import script stores real Dates.

## How the dashboard joins the two

- **Spend → offer:** an ad that lands directly on a partner offer (SKAG ED TEST → Quad ED) counts fully for that offer.
  An ad on the multi-offer landing page (MenCare Vault) has its spend split across the offers its visitors clicked,
  by landing-page-view share — shown as **est.** Ad-group days where nobody clicked an offer stay on
  "Landing page — no offer click". Per ad group (the "By Ad Group" view) spend is always exact.
- **Partner events without campaign / ad group** (tracking started Oct 5) count toward revenue and the funnel, with no spend.
- **Device / region** exist only in the partner export, so those charts show visitors, purchases and revenue, not spend.
  Export the Bing report with the *Device type* and *State* columns to make spend by device/region possible.
- A day only one export covers (e.g. Oct 8: Bing spend, no partner data yet) shows as **Pending**, not as a loss.
