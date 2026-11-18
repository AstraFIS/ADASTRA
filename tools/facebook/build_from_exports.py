"""
Meta Ads CSV export(s) + partner conversions CSV -> the three JSON files that
`npm run import:facebook` loads (same shape as build_facebook.py writes):

  facebook_ad_reports.json   one row per day x campaign x ad set x ad x gender x age
  facebook_conversions.json  one row per day x ad x event x placement x device x region
  facebook_providers.json    only when --fee is given (provider + fee %)

Inputs
  Meta export (one or more CSV files, e.g. one per day), as downloaded from Ads Manager:
      first line is a title ("DirectMax GLP1"), second line the header, third line the "All" total
      columns used: Day, Campaign name, Ad set name, Ad name, Gender, Age, Impressions, Currency,
                    Amount spent (USD), Clicks (all), Link clicks, Landing page views
  Partner conversions export (ConversionsExport_*.csv):
      date ("13/11/2026 08:09"), offer_name, event_name, event_count_1, revenue, sub2 (placement),
      sub4 ("<facebook ad id>_<ad name>"), region, device_type, Category (ED / GLP), Login_user

  …or the merged Excel workbook made from them (GLP1_DAMS_merged_*.xlsx): its "Meta raw" and
  "Partner raw" sheets hold the same rows, so --excel replaces both kinds of CSV.

Usage
  python3 tools/facebook/build_from_exports.py --out tools/facebook/demo/data \
      --provider "DAMS Aleph" --excel backend/demo-data/GLP1_DAMS_merged_13-17Nov.xlsx

  python3 tools/facebook/build_from_exports.py --out tools/facebook/demo/data \
      --provider "DAMS Aleph" [--fee 6] \
      --partner tools/facebook/demo/ConversionsExport.csv \
      tools/facebook/demo/meta_*.csv

Matching with the Meta rows is done by the backend on day + exact ad name (DM2 and dm2 stay
different ads). The partner's ad name is the part of sub4 after the ad id.
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd

STAGE = {
    'presell visit': 'presell_visit',
    'first page view': 'first_page_view',
    'questionnaire started': 'questionnaire_start',
    'questionnaire start': 'questionnaire_start',
    'lead / partial': 'questionnaire_completed',
    'lead': 'questionnaire_completed',
    'questionnaire completed': 'questionnaire_completed',
    'addtocart': 'add_to_cart',
    'add to cart': 'add_to_cart',
    'purchase': 'purchase',
}
NO_AD = '(no ad name)'
# partner sub2 values -> readable placement names
PLACEMENT = {'an': 'Audience Network', '{{placement}}': '(not filled)', '': '(none)'}
MACRO = '{{'


def day(v) -> str:
    """Any date -> "DD/MM/YYYY" text; the backend reads it as a date (day first)."""
    return pd.Timestamp(v).strftime('%d/%m/%Y')


def text(v) -> str | None:
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    s = str(v).strip()
    return None if s in ('', '<NA>', 'nan', 'NaN', 'None') else s


def clean_ad(v) -> str | None:
    s = text(v)
    if s is None or MACRO in s:  # "{{ad.name}}": the tracking macro was not filled in
        return None
    s = s.replace('+', ' ').replace('%26', '&').strip()
    return s or None


def num(series: pd.Series) -> pd.Series:
    """Numbers that may arrive as text ("59,00") -> float, blanks / junk -> 0."""
    return pd.to_numeric(series.astype(str).str.replace(',', '.', regex=False).str.strip(), errors='coerce').fillna(0)


def read_meta(path: Path) -> pd.DataFrame:
    """Ads Manager CSV: skip the title line; drop the "All" total row."""
    head = path.read_text(encoding='utf-8-sig').splitlines()[:2]
    skip = 0 if head and head[0].startswith('Day,') else 1
    df = pd.read_csv(path, skiprows=skip, encoding='utf-8-sig')
    if 'Day' not in df:
        sys.exit(f'{path.name}: no "Day" column - is this a Meta Ads export?')
    return df[df['Day'].notna() & (df['Day'].astype(str).str.strip() != '')]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('meta', nargs='*', type=Path, help='Meta Ads export CSV file(s)')
    ap.add_argument('--partner', type=Path, help='partner ConversionsExport CSV')
    ap.add_argument('--excel', type=Path, help='merged workbook with "Meta raw" and "Partner raw" sheets (instead of the CSVs)')
    ap.add_argument('--out', type=Path, required=True, help='folder for the JSON files')
    ap.add_argument('--provider', default=None, help='provider (ad account) of these Meta rows, e.g. "DAMS Aleph"')
    ap.add_argument('--fee', type=float, default=None, help='provider fee %% (6 = 6%%); writes facebook_providers.json')
    a = ap.parse_args()
    if not a.excel and (not a.meta or not a.partner):
        ap.error('give --excel <workbook>, or Meta CSV file(s) plus --partner <csv>')
    a.out.mkdir(parents=True, exist_ok=True)
    if a.excel:
        book = pd.read_excel(a.excel, sheet_name=['Meta raw', 'Partner raw'])
        meta_frames = [book['Meta raw']]
        p = book['Partner raw'].drop(columns=['day (from date)', 'fb_ad_id', 'Ad name'], errors='ignore')
        sources = [a.excel.name]
    else:
        meta_frames = [read_meta(f) for f in a.meta]
        p = pd.read_csv(a.partner, encoding='utf-8-sig')
        sources = [f.name for f in a.meta] + [a.partner.name]

    # ---------------- partner ----------------
    p['stage'] = p['event_name'].astype(str).str.strip().str.lower().map(STAGE)
    unknown = sorted(p.loc[p['stage'].isna(), 'event_name'].astype(str).unique())
    if unknown:
        sys.exit(f'Unknown partner event names {unknown}: add them to STAGE at the top of this script')
    p['when'] = pd.to_datetime(p['date'].astype(str).str.strip(), format='mixed', dayfirst=True)
    p['day'] = p['when'].dt.normalize()
    sub4 = p['sub4'].astype('string').str.strip()
    p['ad'] = [clean_ad(x) or NO_AD for x in sub4.str.split('_', n=1).str[1]]
    p['ad_id'] = sub4.str.extract(r'^(\d+)_', expand=False)
    p['placement'] = [PLACEMENT.get(str(x).strip(), str(x).strip()) if text(x) else '(none)' for x in p.get('sub2', '')]
    p['device'] = p.get('device_type', pd.Series(index=p.index, dtype='object')).map(text)
    p['region'] = p.get('region', pd.Series(index=p.index, dtype='object')).map(text)
    p['category'] = p.get('Category', pd.Series(index=p.index, dtype='object')).map(text)
    p['login'] = p.get('Login_user', pd.Series(index=p.index, dtype='object')).map(text)
    p['count'] = num(p['event_count_1']) if 'event_count_1' in p else 1
    p['rev'] = num(p['revenue']) if 'revenue' in p else 0
    p['sub4s'] = sub4.fillna('')
    p['ad_id_s'] = p['ad_id'].fillna('')
    for c in ['device', 'region', 'category', 'login']:
        p[c] = p[c].fillna('')

    key = ['day', 'offer_name', 'event_name', 'stage', 'ad', 'ad_id_s', 'sub4s', 'placement', 'device', 'region', 'category', 'login']
    g = p.groupby(key, dropna=False).agg(count=('count', 'sum'), rev=('rev', 'sum')).reset_index()
    conversions = [{
        'event_date': day(r['day']),
        'offer_name': str(r['offer_name']).strip(),
        'event_raw': str(r['event_name']).strip(),
        'event_stage': r['stage'],
        'sub_id': r['sub4s'] or None,
        'fb_ad_id': r['ad_id_s'] or None,
        'ad_name': r['ad'],
        'event_count': int(r['count']),
        'revenue_usd': round(float(r['rev']), 2),
        'device': r['device'] or None,
        'region': r['region'] or None,
        'placement': r['placement'],
        'category': r['category'] or None,
        'login_user': r['login'] or None,
    } for _, r in g.iterrows()]

    # each ad's offer and category, taken from the partner (the Meta export has neither)
    mode = lambda s: s.value_counts().index[0] if s.notna().any() and len(s.dropna()) else None  # noqa: E731
    offers = p.groupby('ad')['offer_name'].agg(mode).to_dict()
    cats = p[p['category'] != ''].groupby('ad')['category'].agg(mode).to_dict()
    only_offer = p['offer_name'].dropna().unique()
    only_cat = [c for c in p['category'].unique() if c]
    fallback_offer = str(only_offer[0]) if len(only_offer) == 1 else '(unknown offer)'
    fallback_cat = only_cat[0] if len(only_cat) == 1 else None

    # ---------------- Meta export ----------------
    fb = pd.concat(meta_frames, ignore_index=True)
    fb = fb[fb['Day'].notna() & (fb['Day'].astype(str).str.strip() != '')]
    currencies = sorted(fb['Currency'].dropna().astype(str).unique()) if 'Currency' in fb else []
    fb['date'] = pd.to_datetime(fb['Day'])
    fb['ad'] = fb['Ad name'].map(clean_ad).fillna(NO_AD)
    fb['campaign'] = fb['Campaign name'].astype('string').str.strip().fillna('(no campaign)')
    fb['ad_set'] = fb['Ad set name'].astype('string').str.strip().fillna('(no ad set)')
    fb['gender'] = fb['Gender'].astype('string').str.strip().str.lower().fillna('unknown')
    # Ads Manager writes the top age band as "65" in CSV exports
    fb['age'] = fb['Age'].astype('string').str.strip().replace({'65': '65+', 'Unknown': 'unknown'}).fillna('unknown')
    for src, dst in [('Amount spent (USD)', 'spend'), ('Impressions', 'impressions'), ('Reach', 'reach'),
                     ('Clicks (all)', 'clicks_all'), ('Link clicks', 'link_clicks'), ('Landing page views', 'lpv')]:
        fb[dst] = num(fb[src]) if src in fb else 0.0
    rkey = ['date', 'campaign', 'ad_set', 'ad', 'gender', 'age']
    r = fb.groupby(rkey, dropna=False).agg(
        spend=('spend', 'sum'), impressions=('impressions', 'sum'), reach=('reach', 'sum'),
        clicks_all=('clicks_all', 'sum'), link_clicks=('link_clicks', 'sum'), lpv=('lpv', 'sum'),
    ).reset_index()
    reports = []
    for _, x in r.iterrows():
        doc = {
            'report_date': day(x['date']),
            'campaign_name': x['campaign'],
            'ad_set_name': x['ad_set'],
            'ad_name': x['ad'],
            'offer_name': offers.get(x['ad'], fallback_offer),
            'gender': x['gender'],
            'age': x['age'],
            'provider_name': a.provider,
            'provider_fee_pct': a.fee or 0,
            'spend_usd': round(float(x['spend']), 4),
            'impressions': int(x['impressions']),
            'reach': int(x['reach']),
            'clicks_all': int(x['clicks_all']),
            'link_clicks': int(x['link_clicks']),
            'landing_page_views': int(x['lpv']),
            'presell_visits': 0, 'first_page_views': 0, 'questionnaire_starts': 0, 'questionnaire_completed': 0,
            'add_to_carts': 0, 'purchase_events': 0, 'conversions': 0, 'revenue_usd': 0,
        }
        cat = cats.get(x['ad'], fallback_cat)
        if cat:
            doc['category'] = cat
        reports.append(doc)

    files = [('facebook_ad_reports', reports), ('facebook_conversions', conversions)]
    if a.fee is not None and a.provider:
        files.append(('facebook_providers', [{'provider_name': a.provider, 'fee_pct': a.fee, 'is_default': False}]))
    for name, docs in files:
        (a.out / f'{name}.json').write_text(json.dumps(docs, ensure_ascii=False, indent=1))

    # ---------------- checks ----------------
    meta_keys = {(d['report_date'], d['ad_name']) for d in reports}
    partner_keys = {(d['event_date'], d['ad_name']) for d in conversions}
    chk = {
        'source_files': sources,
        'meta_days': sorted({d['report_date'] for d in reports}),
        'meta_rows': len(reports),
        'meta_spend': round(sum(d['spend_usd'] for d in reports), 2),
        'meta_currency': currencies,
        'partner_rows_in_file': len(p),
        'partner_docs': len(conversions),
        'partner_days': sorted({d['event_date'] for d in conversions}),
        'partner_events': int(p['count'].sum()),
        'partner_revenue': round(float(p['rev'].sum()), 2),
        'day_ad_matched': len(meta_keys & partner_keys),
        'day_ad_meta_only': len(meta_keys - partner_keys),
        'day_ad_partner_only': len(partner_keys - meta_keys),
        'partner_events_unfilled_macro': int(p.loc[p['ad'] == NO_AD, 'count'].sum()),
        'provider': a.provider,
        'fee_pct': a.fee,
    }
    warn = []
    if currencies and currencies != ['USD']:
        warn.append(f'Meta Currency column says {currencies}, but spend is read as USD.')
    if not a.provider:
        warn.append('No --provider given: these Meta rows have no provider, so no fee is added.')
    if partner_keys - meta_keys:
        warn.append(f'{len(partner_keys - meta_keys)} day+ad pairs have partner events but no Meta row (missing Meta day or different name).')
    chk['warnings'] = warn
    (a.out / 'checks.json').write_text(json.dumps(chk, indent=1))
    print(json.dumps(chk, indent=1))


if __name__ == '__main__':
    main()
