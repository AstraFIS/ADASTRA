"""
Bing Ads "Search terms" report (CSV or XLSX) → bing_search_terms.json for `npm run import:bing`.

Usage: python3 -I tools/bing/build_search_terms.py <search_terms.csv|.xlsx> <out_dir>

Expected columns (as in the Bing export, extra columns are ignored):
  Date, Search term, Added / Excluded, Match type, Campaign, Campaign Type, Ad group, Keyword text,
  Spend, Clicks, Impr., CTR, Avg. CPC, Avg. CPM, Top impr. rate, Abs. top impr. rate, Conv., All conv., Media Buyer

- Date becomes "DD/MM/YYYY" text (day first), like the other Bing files. "2026-09-26" and real dates are read too.
- "Exact (close variant)" → match_type "exact" + close_variant true.
- Rates come as "100%" (or fractions 0–1) → stored as 0–100.
- Media Buyer "TH02" → "TH2", "TH01" → "TH".
- Rows that repeat the same day × campaign × ad group × keyword × search term × match type are summed.

The dashboard connects these rows to bing_keyword_reports (bid, Conversion Name) and bing_conversions
(partner LP views / purchases / revenue) on campaign · ad group · keyword.
"""
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

import pandas as pd

if len(sys.argv) != 3:
    sys.exit(__doc__)
SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

REQUIRED = ['Date', 'Search term', 'Campaign', 'Ad group', 'Keyword text', 'Spend', 'Clicks', 'Impr.']

df = pd.read_excel(SRC) if SRC.suffix.lower() in ('.xlsx', '.xls') else pd.read_csv(SRC, encoding='utf-8-sig')
df.columns = [str(c).strip() for c in df.columns]
# Bing's own header variants
ALIASES = {'Day': 'Date', 'Keyword': 'Keyword text', 'Search terms': 'Search term', 'Search query': 'Search term',
           'Impressions': 'Impr.', 'Conversions': 'Conv.', 'All conversions': 'All conv.'}
df = df.rename(columns={c: ALIASES[c] for c in df.columns if c in ALIASES})
missing = [c for c in REQUIRED if c not in df.columns]
if missing:
    sys.exit(f'Missing column(s): {", ".join(missing)}. Found: {", ".join(df.columns)}')
# drop footer lines ("Total", "©2026 Microsoft …") and empty rows
df = df[df['Search term'].notna() & df['Campaign'].notna() & df['Keyword text'].notna()]


def text(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


def num(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(',', '').replace('$', '')
    if s in ('', '-', '--'):
        return None
    return float(s.rstrip('%').strip())


def rate(v):
    """"100%" → 100.0, 0.5 → 50.0, 50 → 50.0"""
    if isinstance(v, str) and '%' in v:
        return num(v)
    n = num(v)
    if n is None:
        return None
    return round(n * 100, 4) if n <= 1 else n


def day(v):
    if isinstance(v, (datetime, date, pd.Timestamp)):
        d = pd.Timestamp(v)
    else:
        s = str(v).strip()
        d = pd.to_datetime(s, dayfirst=not re.match(r'^\d{4}-', s))
    return d.strftime('%d/%m/%Y')


def buyer(v):
    s = text(v)
    if not s:
        return None
    m = re.match(r'^([A-Za-z]+)\s*0*(\d*)$', s)
    if not m:
        return s
    n = m.group(2)
    return m.group(1).upper() + (n if n and n != '1' else '')


def match(v):
    s = (text(v) or '').lower()
    return (s.split('(')[0].strip() or None), ('close variant' in s)


docs = {}
for _, r in df.iterrows():
    mt, close = match(r.get('Match type'))
    d = {
        'report_date': day(r['Date']),
        'search_term': text(r['Search term']),
        'added_excluded': text(r.get('Added / Excluded')),
        'match_type': mt,
        'close_variant': close,
        'campaign_name': text(r['Campaign']),
        'campaign_type': text(r.get('Campaign Type')),
        'ad_group_name': text(r['Ad group']),
        'keyword': text(r['Keyword text']),
        'impressions': int(num(r['Impr.']) or 0),
        'clicks': int(num(r['Clicks']) or 0),
        'spend_usd': round(num(r['Spend']) or 0, 2),
        'ctr_pct': rate(r.get('CTR')),
        'cpc_usd': num(r.get('Avg. CPC')),
        'cpm_usd': num(r.get('Avg. CPM')),
        'top_impr_rate_pct': rate(r.get('Top impr. rate')),
        'abs_top_impr_rate_pct': rate(r.get('Abs. top impr. rate')),
        'conversions': num(r.get('Conv.')) or 0,
        'all_conversions': num(r.get('All conv.')) or 0,
        'media_buyer': buyer(r.get('Media Buyer')),
    }
    key = (d['report_date'], d['campaign_name'], d['ad_group_name'], d['keyword'], d['search_term'], d['match_type'], d['close_variant'])
    if key in docs:
        p = docs[key]
        for f in ('impressions', 'clicks', 'conversions', 'all_conversions'):
            p[f] += d[f]
        p['spend_usd'] = round(p['spend_usd'] + d['spend_usd'], 2)
        p['ctr_pct'] = round(p['clicks'] / p['impressions'] * 100, 4) if p['impressions'] else None
        p['cpc_usd'] = round(p['spend_usd'] / p['clicks'], 2) if p['clicks'] else None
        p['cpm_usd'] = round(p['spend_usd'] / p['impressions'] * 1000, 2) if p['impressions'] else None
    else:
        docs[key] = d

rows = list(docs.values())
(OUT / 'bing_search_terms.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1))

days = sorted({datetime.strptime(d['report_date'], '%d/%m/%Y').date() for d in rows})
buyers = {}
for d in rows:
    buyers[d['media_buyer'] or '(none)'] = buyers.get(d['media_buyer'] or '(none)', 0) + 1
print(json.dumps({
    'file': str(OUT / 'bing_search_terms.json'),
    'rows': len(rows),
    'source_rows': int(len(df)),
    'days': f'{days[0]} … {days[-1]}' if days else None,
    'search_terms': len({d['search_term'] for d in rows}),
    'keywords': len({(d['campaign_name'], d['ad_group_name'], d['keyword']) for d in rows}),
    'spend_usd': round(sum(d['spend_usd'] for d in rows), 2),
    'clicks': sum(d['clicks'] for d in rows),
    'impressions': sum(d['impressions'] for d in rows),
    'conversions': sum(d['conversions'] for d in rows),
    'media_buyers': buyers,
}, indent=1))
