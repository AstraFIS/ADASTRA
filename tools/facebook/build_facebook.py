"""Facebook raw exports -> the three MongoDB collections the Facebook page reads.

  facebook_ad_reports_2.json Facebook Ads export (the older facebook_ad_reports collection is left untouched): one row per day x campaign x ad set x ad x gender x age
                             (spend, delivery; funnel counts are 0 here - they come from the partner)
  facebook_conversions.json  Partner export: one row per day x ad x event (counts + revenue, device, geo)
  facebook_providers.json    Provider fee table: provider + fee %

The backend joins them live on day + ad name (like Bing), so re-importing one file never
needs the others to be rebuilt.

Usage:
  python3 tools/facebook/build_facebook.py <workbook.xlsx> <out_dir>

Facebook rows without a provider keep their spend with no provider fee.

The workbook needs three sheets (names can differ, they are detected by their columns):
  partner   : Date, offer_name, event_name, sub4, Ad Name, Amount, revenue, Device, Geo
  facebook  : Day, Campaign name, Ad set name, Ad name, Gender, Age, Reach, Impressions, ...
              Amount spent (USD), Clicks (all), Link clicks, Landing page views, Provider
  providers : Provider, Spend Fee %   (0.0753 = 7.53 %)
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


def day(v) -> str:
    """Any date -> "DD/MM/YYYY" text (1 Oct 2026 -> "01/10/2026"); the backend reads it as a date."""
    return pd.Timestamp(v).strftime('%d/%m/%Y')


def clean_ad(v) -> str | None:
    if v is None or (not isinstance(v, str) and pd.isna(v)):  # None, NaN and pandas <NA>
        return None
    s = str(v).replace('+', ' ').replace('%26', '&').strip()
    return None if s in ('', '<NA>', 'nan', 'NaN', 'None') else s


def num(series: pd.Series) -> pd.Series:
    """Numbers that may arrive as text ("59,00") -> float, blanks -> 0."""
    return pd.to_numeric(series.astype(str).str.replace(',', '.', regex=False).str.strip(), errors='coerce').fillna(0)


def find_sheet(book: dict[str, pd.DataFrame], required: set[str], label: str, exclude: set[str] = frozenset()) -> pd.DataFrame:
    for name, df in book.items():
        cols = {str(c).strip() for c in df.columns}
        if required <= cols and not (exclude & cols):
            df.columns = [str(c).strip() for c in df.columns]
            print(f'  {label:<9} sheet: "{name}" ({len(df)} rows)')
            return df
    sys.exit(f'No sheet with the {label} columns {sorted(required)}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('workbook')
    ap.add_argument('out_dir')
    a = ap.parse_args()
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    book = pd.read_excel(a.workbook, sheet_name=None)
    partner = find_sheet(book, {'Date', 'event_name', 'Amount', 'revenue'}, 'partner')
    fb = find_sheet(book, {'Day', 'Ad name', 'Amount spent (USD)'}, 'facebook')
    prov = find_sheet(book, {'Provider'}, 'providers', exclude={'Day', 'Ad name', 'Date'})

    # ---------------- providers ----------------
    fee_col = next((c for c in prov.columns if 'fee' in c.lower() or '%' in c), None) or next(c for c in prov.columns if c != 'Provider')
    prov = prov.dropna(subset=['Provider'])
    providers = []
    for _, r in prov.iterrows():
        pct = float(r[fee_col])
        pct = pct * 100 if pct < 1 else pct  # 0.0753 -> 7.53 ; 7.53 stays
        providers.append({
            'provider_name': str(r['Provider']).strip(),
            'fee_pct': round(pct, 4),
            'is_default': False,
        })
    fee_of = {p['provider_name']: p['fee_pct'] for p in providers}

    # ---------------- partner events ----------------
    partner = partner.copy()
    partner['stage'] = partner['event_name'].astype(str).str.strip().str.lower().map(STAGE)
    unknown = sorted(partner.loc[partner['stage'].isna(), 'event_name'].astype(str).unique())
    if unknown:
        sys.exit(f'Unknown partner event names {unknown}: add them to STAGE at the top of this script')
    sub4 = partner['sub4'].astype('string')
    from_sub4 = sub4.str.split('_', n=1).str[1]
    partner['ad'] = [clean_ad(x) or clean_ad(y) or NO_AD for x, y in zip(partner['Ad Name'], from_sub4)]
    partner['ad_id'] = sub4.str.extract(r'^(\d+)', expand=False)
    conversions = []
    for _, r in partner.iterrows():
        conversions.append({
            'event_date': day(r['Date']),
            'offer_name': str(r['offer_name']).strip(),
            'event_raw': str(r['event_name']).strip(),
            'event_stage': r['stage'],
            'sub_id': None if pd.isna(r['sub4']) else str(r['sub4']).strip(),
            'fb_ad_id': None if pd.isna(r['ad_id']) else str(r['ad_id']),
            'ad_name': r['ad'],
            'event_count': int(r['Amount']),
            'revenue_usd': round(float(r['revenue'] or 0), 2),
            'device': None if pd.isna(r.get('Device')) else str(r['Device']).strip(),
            'region': None if pd.isna(r.get('Geo')) else str(r['Geo']).strip(),
        })

    # offer for each ad, taken from the partner (the Facebook export has no offer column)
    offers = partner.groupby('ad')['offer_name'].agg(lambda s: s.value_counts().index[0]).to_dict()
    only_offer = partner['offer_name'].dropna().unique()
    fallback_offer = str(only_offer[0]) if len(only_offer) == 1 else '(unknown offer)'

    # ---------------- facebook export ----------------
    fb = fb.copy()
    fb['date'] = pd.to_datetime(fb['Day'])
    fb['ad'] = fb['Ad name'].map(clean_ad).fillna(NO_AD)
    fb['campaign'] = fb['Campaign name'].astype('string').str.strip().fillna('(no campaign)')
    fb['ad_set'] = fb['Ad set name'].astype('string').str.strip().fillna('(no ad set)')
    fb['gender'] = fb['Gender'].astype('string').str.strip().str.lower().fillna('unknown')
    fb['age'] = fb['Age'].astype('string').str.strip().replace({'Unknown': 'unknown'}).fillna('unknown')
    fb['provider'] = fb['Provider'].astype('string').str.strip()
    for src, dst in [('Amount spent (USD)', 'spend'), ('Impressions', 'impressions'), ('Reach', 'reach'),
                     ('Clicks (all)', 'clicks_all'), ('Link clicks', 'link_clicks'), ('Landing page views', 'lpv')]:
        fb[dst] = num(fb[src]) if src in fb else 0.0
    key = ['date', 'campaign', 'ad_set', 'ad', 'gender', 'age']
    # same name inside one ad set (separate ads) -> one row per key, numbers summed
    g = fb.groupby(key, dropna=False).agg(
        spend=('spend', 'sum'), impressions=('impressions', 'sum'), reach=('reach', 'sum'),
        clicks_all=('clicks_all', 'sum'), link_clicks=('link_clicks', 'sum'), lpv=('lpv', 'sum'),
        provider=('provider', lambda s: s.dropna().iloc[0] if s.notna().any() else None),
    ).reset_index()

    reports = []
    for _, r in g.iterrows():
        provider = r['provider'] if isinstance(r['provider'], str) else None
        reports.append({
            'report_date': day(r['date']),
            'campaign_name': r['campaign'],
            'ad_set_name': r['ad_set'],
            'ad_name': r['ad'],
            'offer_name': offers.get(r['ad'], fallback_offer),
            'gender': r['gender'],
            'age': r['age'],
            'provider_name': provider,
            # the fee % lives in facebook_providers; stored here too so the row is complete on its own
            'provider_fee_pct': fee_of.get(provider, 0) if provider else 0,
            'spend_usd': round(float(r['spend']), 4),
            'impressions': int(r['impressions']),
            'reach': int(r['reach']),
            'clicks_all': int(r['clicks_all']),
            'link_clicks': int(r['link_clicks']),
            'landing_page_views': int(r['lpv']),
            # funnel + revenue come from facebook_conversions (joined live by the backend)
            'presell_visits': 0, 'first_page_views': 0, 'questionnaire_starts': 0, 'questionnaire_completed': 0,
            'add_to_carts': 0, 'purchase_events': 0, 'conversions': 0, 'revenue_usd': 0,
        })

    for name, docs in [('facebook_ad_reports_2', reports), ('facebook_conversions', conversions), ('facebook_providers', providers)]:
        (out / f'{name}.json').write_text(json.dumps(docs, ensure_ascii=False, indent=1))

    # ---------------- checks ----------------
    fb_keys = {(d['report_date'], d['ad_name']) for d in reports}
    matched = [c for c in conversions if (c['event_date'], c['ad_name']) in fb_keys]
    missing_provider_spend = sum(d['spend_usd'] for d in reports if not d['provider_name'])
    chk = {
        'facebook_rows_in': len(fb), 'facebook_ad_reports': len(reports),
        'spend_in': round(float(fb['spend'].sum()), 2), 'spend_out': round(sum(d['spend_usd'] for d in reports), 2),
        'link_clicks_out': sum(d['link_clicks'] for d in reports), 'impressions_out': sum(d['impressions'] for d in reports),
        'facebook_conversions': len(conversions),
        'events': sum(c['event_count'] for c in conversions), 'revenue': round(sum(c['revenue_usd'] for c in conversions), 2),
        'revenue_matched_to_fb_day_and_ad': round(sum(c['revenue_usd'] for c in matched), 2),
        'providers': len(providers),
        'spend_without_provider (counted, no fee)': round(missing_provider_spend, 2),
        'facebook_dates': [day(fb['date'].min()), day(fb['date'].max())],
        'partner_dates': [day(partner['Date'].min()), day(partner['Date'].max())],
    }
    (out / 'checks.json').write_text(json.dumps(chk, indent=1))
    print(json.dumps(chk, indent=1))


if __name__ == '__main__':
    main()
