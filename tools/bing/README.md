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

## Search term report (`bing_keyword_reports`)

The Bing Ads keyword / search term export (columns `Day, Keyword, Goal, Campaign, Ad group, Match type, Bid, Clicks,
Impr., CTR, Avg. CPC, Spend, Top impr. rate, Abs. top impr. rate, Media Buyer`, plus optionally `Search term`) feeds the
**Search Terms** report on the Bing page (views: Search Terms · Keywords · Ad Groups · Campaigns). The conversion name is
shown when the export has one and left blank otherwise; the **Search Terms** view fills in as soon as an export carries
search terms (one row per
search term under each keyword). **Goal is the conversion name** — the page shows it as *Conversion Name*, and the
builder also accepts a column headed `Conversion name`.

```bash
python3 tools/bing/build_keywords.py <keywords.xlsx|.csv> tools/bing/data   # → bing_keyword_reports.json
npm run import:bing -w backend -- ../tools/bing/data --apply
```

The import replaces only the **media buyers present in the file** inside its date span, so TH and TH2 can load their
exports separately. (Ad reports likewise replace only the campaigns in the file.) Files missing from the folder are skipped.
Rates are fractions in the export and stored as 0–100; Media Buyer `TH02` is stored as `TH2`. Loading the sheet straight
through Compass also works — the dashboard reads both forms.

Keyword rows show partner LP views / purchases / revenue when a partner event has the same campaign · ad group · keyword.
Keyword spend is **not** added to the KPI tiles (those come from the ad report, which covers the same clicks).

### Conversion goals

The keyword export's **Goal** column is the conversion goal (Purchase, Add to cart, Quiz Started, Submit lead form; `-` = none).
Bing segments the report by goal: the `-` row of a keyword-day carries impressions / clicks / spend, and one extra row per goal
carries that goal's `Conv.` / `All conv.`. The builder keeps each as its own document; the dashboard adds them back per keyword
and shows **Conversion Name** with All conv. per goal. The report's **Conversion goal** filter narrows every view to keywords
that converted on that goal (in the Keywords / Ad Groups / Campaigns views the Conv. columns then count that goal only).

## Search term report (`bing_search_terms`)

Bing's **Search terms** export (columns `Date, Search term, Added / Excluded, Match type, Campaign, Campaign Type, Ad group,
Keyword text, Spend, Clicks, Impr., CTR, Avg. CPC, Avg. CPM, Top impr. rate, Abs. top impr. rate, Conv., All conv., Media Buyer`)
is its own collection and feeds the **Search Terms** view of the report.

```bash
python3 tools/bing/build_search_terms.py <search_terms.csv|.xlsx> tools/bing/data   # → bing_search_terms.json
npm run import:bing -w backend -- ../tools/bing/data --apply
```

- "Exact (close variant)" is stored as match type `exact` + `close_variant: true` (shown as a *close variant* tag).
- Rates like `100%` are stored as 0–100; Media Buyer `TH02` → `TH2`; the import replaces only the buyers in the file.
- A row with an **empty Media Buyer** takes its campaign's buyer (suffix → admin pick → keyword report), so it isn't lost under Unassigned.
- `Excluded` search terms (added as negatives) are tagged *excluded*.
- **Connected on campaign · ad group · keyword** (nothing is copied, it is joined on every request):
  - keyword report → the keyword's **bid** and **Conversion Name** (its Goal column);
  - partner events → LP views, purchases, revenue (once per keyword, on its top-spend search term);
  - in the **Keywords** view each keyword opens to show its search terms from this report.
- Bing's own `Conv.` is shown as a *Conv.* column in the Search Terms view.

## Media buyers (TH, TH2 …)

Each Bing row belongs to a media buyer:

- **ad reports / partner events** — the campaign-name suffix: `…_th` → TH, `…_th2` (or `_th02`) → TH2;
- **keyword and search term reports** — the `Media Buyer` column;
- a campaign **without** a suffix can be assigned by an admin in the **Campaign buyers** section on the Bing page
  (saved in `bing_campaign_buyers`);
- otherwise, a campaign without a suffix that appears in the keyword report takes that report's buyer, so its spend and
  partner events follow the keywords.

Order: suffix → admin's pick → keyword report. Keyword rows themselves always follow their own Media Buyer column.

Anything else is **Unassigned** (only admins see it). Admins get *All / TH / TH2 / Unassigned* buttons at the top of the page; each user is given
buyers on `/users` (Bing → TH / TH2) and sees only their data, on the Bing page and on the overview. To add a buyer, add
its code to `BING_MEDIA_BUYERS` in `backend/src/utils/bingBuyer.ts` and `frontend/src/types/auth.ts`.

## How the dashboard joins the two

- **Spend → offer:** an ad that lands directly on a partner offer (SKAG ED TEST → Quad ED) counts fully for that offer.
  An ad on the multi-offer landing page (MenCare Vault) has its spend split across the offers its visitors clicked,
  by landing-page-view share — shown as **est.** Ad-group days where nobody clicked an offer stay on
  "Landing page — no offer click". Per ad group (the "By Ad Group" view) spend is always exact.
- **Partner events without campaign / ad group** (tracking started Oct 5) count toward revenue and the funnel, with no spend.
- **Device / region** exist only in the partner export, so those charts show visitors, purchases and revenue, not spend.
  Export the Bing report with the *Device type* and *State* columns to make spend by device/region possible.
- A day only one export covers (e.g. Oct 8: Bing spend, no partner data yet) shows as **Pending**, not as a loss.
