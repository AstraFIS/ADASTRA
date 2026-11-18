# Excel mode – the dashboard without MongoDB

When you run the app on your own computer, the backend does **not connect to MongoDB**.
The Facebook reports are filled straight from the Excel workbook

`backend/demo-data/GLP1_DAMS_merged_13-17Nov.xlsx`

| Sheet | Used for |
|---|---|
| **Meta raw** | Spend, impressions, clicks, landing page views by day × campaign × ad set × ad × age × gender |
| **Partner raw** | Funnel events and revenue by day × ad (from sub4), placement (sub2), device, region, Category |
| **Summary**, cell **C6** | Provider fee % for DAMS Aleph (yellow input cell) |

Edit the workbook (e.g. type 6% in Summary!C6, or paste new rows into the raw sheets with the
same column headers), save it, and refresh the page – the backend re-reads the file when it changes.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 and sign in with **any** email and password. Go to **Facebook** → This Month.
`http://localhost:4000/api/health` answers `"db": "not used (Excel mode)"`.

Only the Facebook pages have data in this mode; Bing, Finance, Users and Ad groups need the
database and show an error.

## Options (backend/.env, optional)

| Variable | Effect |
|---|---|
| `DATA_SOURCE=mongo` | use the MongoDB database again (normal mode) |
| `DATA_SOURCE=excel` | force Excel mode |
| `EXCEL_DATA=C:\path\other.xlsx` | read another workbook with the same sheets |
| `EXCEL_PROVIDER=…` | provider name for the Meta rows (default `DAMS Aleph`) |

The live site on Vercel always uses MongoDB.

The original exports the workbook was made from are kept here too
(`meta_glp1_dams_aleph_*.csv`, `partner_conversions_*.csv`).
