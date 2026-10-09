"""Merge Bing Ads report (CSV) + partner conversions (XLSX) into Mongo-ready collections.

Usage: python -I build_bing.py <ads.csv> <partner.xlsx> <out_dir>
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import pandas as pd

ADS_CSV, PARTNER_XLSX, OUT = sys.argv[1], sys.argv[2], Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)

UNATTRIBUTED = '(unattributed)'
QUAD = 'Quad ED - Medvi Male Enhancement US Direct Link - 2'
MENCARE = 'MenCare Vault (multi-offer LP)'

# ---------- funnel stage mapping for messy partner event names ----------
STAGE = {
    'base': 'first_page_view',
    'start quiz': 'questionnaire_start', 'quiz start': 'questionnaire_start',
    'satrt quiz': 'questionnaire_start', 'start_intake': 'questionnaire_start',
    'quiz completion': 'questionnaire_completed', 'quiz completed': 'questionnaire_completed',
    'quiz complete': 'questionnaire_completed', 'complete_intake': 'questionnaire_completed',
    'lead': 'lead',
    'add to card': 'add_to_cart', 'add to cart': 'add_to_cart', 'begin_checkout': 'add_to_cart',
    'purchase': 'purchase',
}
STAGE_FIELD = {
    'first_page_view': 'first_page_views',
    'questionnaire_start': 'questionnaire_starts',
    'questionnaire_completed': 'questionnaire_completed',
    'lead': 'leads',
    'add_to_cart': 'add_to_carts',
    'purchase': 'purchase_events',
}
FUNNEL_FIELDS = list(STAGE_FIELD.values())
MATCH = {'PM': 'phrase', 'EM': 'exact', 'BM': 'broad'}


def r2(x):
    return None if x is None or pd.isna(x) else round(float(x), 2)


def pct(s):
    """'33.33%' -> 33.33"""
    if pd.isna(s):
        return None
    return float(str(s).replace('%', '').replace(',', '').strip() or 0)


def parse_ad_group(name):
    """'PM | OTC | ed pills over the counter' -> (phrase, OTC, 'ed pills over the counter')"""
    parts = [p.strip() for p in str(name).split('|')]
    if len(parts) == 3:
        return MATCH.get(parts[0], parts[0]), parts[1], parts[2]
    return None, None, str(name)


def mdate(d):
    """Day as text "DD/MM/YYYY" (e.g. "01/10/2026" = 1 Oct 2026); the backend reads it as a date."""
    return pd.Timestamp(d).strftime('%d/%m/%Y')


def dump(name, docs):
    (OUT / f'{name}.json').write_text(json.dumps(docs, ensure_ascii=False, indent=1))


# =====================================================================
# 1. Bing Ads report
# =====================================================================
ads = pd.read_csv(ADS_CSV, encoding='utf-8-sig')
ads['report_date'] = pd.to_datetime(ads['Day'], format='%d/%m/%Y')
creative_cols = ['Final Url', 'Display Url', 'Ad type', 'Path 1', 'Path 2'] + \
    [c for c in ads.columns if c.startswith(('Headline', 'Description'))]
ads['ad_key'] = ads[creative_cols].fillna('').astype(str).agg('\x1f'.join, axis=1) \
    .map(lambda s: hashlib.md5(s.encode()).hexdigest()[:12])
ads['offer_name'] = ads['Display Url'].map(lambda u: QUAD if 'medvi' in str(u) else MENCARE)

# creative catalog (one doc per distinct ad)
bing_ads = []
for key, g in ads.groupby('ad_key', sort=False):
    row = g.iloc[0]
    heads = [row[c] for c in ads.columns if c.startswith('Headline') and pd.notna(row[c])]
    descs = [row[c] for c in ads.columns if c.startswith('Description') and pd.notna(row[c])]
    bing_ads.append({
        'ad_key': key,
        'ad_type': row['Ad type'],
        'campaign_name': row['Campaign'],
        'display_url': row['Display Url'],
        'final_url': row['Final Url'],
        'path_1': None if pd.isna(row['Path 1']) else row['Path 1'],
        'path_2': None if pd.isna(row['Path 2']) else row['Path 2'],
        'headlines': heads,
        'descriptions': descs,
        'ad_groups': sorted(g['Ad group'].unique().tolist()),
    })

ad_reports = []
for _, r in ads.iterrows():
    mt, theme, kw = parse_ad_group(r['Ad group'])
    imp, clk, sp = int(r['Impr.']), int(r['Clicks']), float(r['Spend'])
    ad_reports.append({
        'report_date': mdate(r['report_date']),
        'campaign_name': r['Campaign'],
        'ad_group_name': r['Ad group'],
        'match_type': mt, 'theme': theme, 'keyword': kw,
        'ad_key': r['ad_key'],
        'offer_name': r['offer_name'],
        'landing_domain': r['Display Url'],
        'impressions': imp, 'clicks': clk, 'spend_usd': r2(sp),
        'ctr_pct': r2(clk / imp * 100) if imp else None,
        'cpc_usd': r2(sp / clk) if clk else None,
        'top_impr_rate_pct': pct(r['Top impr. rate']),
        'abs_top_impr_rate_pct': pct(r['Abs. top impr. rate']),
    })

# =====================================================================
# 2. Partner conversions (event level)
# =====================================================================
p = pd.read_excel(PARTNER_XLSX)
p.columns = [c.strip() for c in p.columns]
for c in ['sub ID', 'Event', 'Offer', 'Region', 'Device', 'Campaign', 'Ad Group']:
    p[c] = p[c].astype('string').str.strip().replace('', pd.NA)
p['event_stage'] = p['Event'].str.lower().map(STAGE)
unknown = p[p['event_stage'].isna()]['Event'].unique().tolist()
if unknown:
    sys.exit(f'Unmapped partner events: {unknown}')

# back-fill region/device/campaign/ad group from other rows of the same click (sub ID)
for c in ['Region', 'Device', 'Campaign', 'Ad Group']:
    known = p.dropna(subset=['sub ID', c]).groupby('sub ID')[c].agg(lambda s: s.unique()[0] if s.nunique() == 1 else pd.NA)
    p[c] = p[c].fillna(p['sub ID'].map(known))
# rows with no sub ID: one anonymous visitor per date × offer × region × device
anon = p['sub ID'].isna()
p.loc[anon, 'sub ID'] = 'anon-' + p.loc[anon, ['Date', 'Offer', 'Region', 'Device']].astype(str).agg('|'.join, axis=1) \
    .map(lambda s: hashlib.md5(s.encode()).hexdigest()[:20])
p['attributed'] = p['Campaign'].notna() & p['Ad Group'].notna()

conversions = []
for _, r in p.iterrows():
    mt, theme, kw = parse_ad_group(r['Ad Group']) if pd.notna(r['Ad Group']) else (None, None, None)
    conversions.append({
        'event_date': mdate(r['Date']),
        'sub_id': r['sub ID'],
        'event_raw': r['Event'],
        'event_stage': r['event_stage'],
        'offer_name': r['Offer'],
        'event_count': int(r['Amount Event']),
        'revenue_usd': r2(r['Revenue']),
        'region': None if pd.isna(r['Region']) else r['Region'],
        'device': None if pd.isna(r['Device']) else r['Device'],
        'campaign_name': None if pd.isna(r['Campaign']) else r['Campaign'],
        'ad_group_name': None if pd.isna(r['Ad Group']) else r['Ad Group'],
        'match_type': mt, 'theme': theme, 'keyword': kw,
        'attributed': bool(r['attributed']),
    })

# =====================================================================
# 3. Merged daily report: day × campaign × ad group
# =====================================================================
p['campaign_key'] = p['Campaign'].fillna(UNATTRIBUTED)
p['ad_group_key'] = p['Ad Group'].fillna(UNATTRIBUTED)
p['field'] = p['event_stage'].map(STAGE_FIELD)


def funnel(df):
    out = {f: 0 for f in FUNNEL_FIELDS}
    for f, n in df.groupby('field')['Amount Event'].sum().items():
        out[f] = int(n)
    out['revenue_usd'] = r2(df['Revenue'].sum())
    out['unique_visitors'] = int(df['sub ID'].nunique())
    return out


def breakdown(df, col, label):
    rows = []
    for k, g in df.groupby(df[col].fillna('Unknown')):
        rows.append({label: k, **funnel(g)})
    return sorted(rows, key=lambda d: (-d['revenue_usd'], -d['first_page_views']))


ad_day = ads.groupby(['report_date', 'Campaign', 'Ad group'], as_index=False).agg(
    impressions=('Impr.', 'sum'), clicks=('Clicks', 'sum'), spend_usd=('Spend', 'sum'),
    ads_count=('ad_key', 'nunique'), offer_name=('offer_name', 'first'),
    landing_domain=('Display Url', 'first'),
)
# impression-weighted top impression rates
ads['_top'] = ads['Top impr. rate'].map(pct) * ads['Impr.']
ads['_abs'] = ads['Abs. top impr. rate'].map(pct) * ads['Impr.']
w = ads.groupby(['report_date', 'Campaign', 'Ad group'], as_index=False)[['_top', '_abs']].sum()
ad_day = ad_day.merge(w, on=['report_date', 'Campaign', 'Ad group'])

part_keys = p.groupby(['Date', 'campaign_key', 'ad_group_key'])
keys = set(map(tuple, ad_day[['report_date', 'Campaign', 'Ad group']].itertuples(index=False))) | set(part_keys.groups.keys())
ad_idx = ad_day.set_index(['report_date', 'Campaign', 'Ad group'])

daily = []
for (d, camp, grp) in sorted(keys, key=lambda k: (k[0], k[1], k[2])):
    has_ads = (d, camp, grp) in ad_idx.index
    a = ad_idx.loc[(d, camp, grp)] if has_ads else None
    ev = part_keys.get_group((d, camp, grp)) if (d, camp, grp) in part_keys.groups else p.iloc[0:0]
    f = funnel(ev)
    imp = int(a['impressions']) if has_ads else 0
    clk = int(a['clicks']) if has_ads else 0
    sp = float(a['spend_usd']) if has_ads else 0.0
    rev = f['revenue_usd'] or 0.0
    mt, theme, kw = parse_ad_group(grp) if grp != UNATTRIBUTED else (None, None, None)
    if has_ads:
        offer = a['offer_name']
    else:
        offers = ev['Offer'].dropna().unique().tolist()
        offer = offers[0] if len(offers) == 1 else 'Multiple offers'
    daily.append({
        'report_date': mdate(d),
        'campaign_name': camp,
        'ad_group_name': grp,
        'match_type': mt, 'theme': theme, 'keyword': kw,
        'offer_name': offer,
        'landing_domain': a['landing_domain'] if has_ads else None,
        'attributed': camp != UNATTRIBUTED,
        'has_ad_data': bool(has_ads),
        'has_partner_data': len(ev) > 0,
        'ads_count': int(a['ads_count']) if has_ads else 0,
        # delivery (Bing Ads)
        'impressions': imp, 'clicks': clk, 'spend_usd': r2(sp),
        'ctr_pct': r2(clk / imp * 100) if imp else None,
        'cpc_usd': r2(sp / clk) if clk else None,
        'top_impr_rate_pct': r2(a['_top'] / imp) if has_ads and imp else None,
        'abs_top_impr_rate_pct': r2(a['_abs'] / imp) if has_ads and imp else None,
        # funnel (partner)
        **f,
        # outcome
        'gross_profit_usd': r2(rev - sp),
        'roas_pct': r2((rev - sp) / sp * 100) if sp else None,
        'cac_usd': r2(sp / f['purchase_events']) if f['purchase_events'] and sp else None,
        'click_to_lp_pct': r2(f['first_page_views'] / clk * 100) if clk else None,
        # breakdowns (partner side only — the Bing export has no device/region segments)
        'by_offer': breakdown(ev, 'Offer', 'offer_name') if len(ev) else [],
        'by_device': breakdown(ev, 'Device', 'device') if len(ev) else [],
        'by_region': breakdown(ev, 'Region', 'region') if len(ev) else [],
    })

dump('bing_ad_reports', ad_reports)
dump('bing_ads', bing_ads)
dump('bing_conversions', conversions)
dump('bing_daily_report', daily)

# ---------------- checks ----------------
chk = {
    'ad_rows': len(ad_reports), 'distinct_ads': len(bing_ads),
    'conversion_rows': len(conversions), 'daily_rows': len(daily),
    'spend_csv': r2(ads['Spend'].sum()), 'spend_daily': r2(sum(d['spend_usd'] for d in daily)),
    'clicks_csv': int(ads['Clicks'].sum()), 'clicks_daily': sum(d['clicks'] for d in daily),
    'impr_csv': int(ads['Impr.'].sum()), 'impr_daily': sum(d['impressions'] for d in daily),
    'revenue_xlsx': r2(p['Revenue'].sum()), 'revenue_daily': r2(sum(d['revenue_usd'] for d in daily)),
    'events_xlsx': int(p['Amount Event'].sum()),
    'events_daily': sum(sum(d[f] for f in FUNNEL_FIELDS) for d in daily),
    'attributed_events': int(p['attributed'].sum()),
    'attributed_revenue': r2(p.loc[p['attributed'], 'Revenue'].sum()),
    'region_known': int(p['Region'].notna().sum()), 'device_known': int(p['Device'].notna().sum()),
    'partner_dates': [str(p['Date'].min().date()), str(p['Date'].max().date())],
    'ads_dates': [str(ads['report_date'].min().date()), str(ads['report_date'].max().date())],
    'first_attributed_date': str(p.loc[p['attributed'], 'Date'].min().date()),
}
(OUT / 'checks.json').write_text(json.dumps(chk, indent=1))
print(json.dumps(chk, indent=1))
