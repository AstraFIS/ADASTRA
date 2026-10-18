"""
Bing Ads keyword / search term report (XLSX or CSV) → bing_keyword_reports.json for `npm run import:bing`.

Usage: python3 -I tools/bing/build_keywords.py <keywords.xlsx|.csv> <out_dir>

Expected columns (as in the Bing export, extra columns are ignored):
  Day, Keyword, Goal, Campaign, Ad group, Match type, Bid, Clicks, Impr., CTR, Avg. CPC, Spend,
  Top impr. rate, Abs. top impr. rate, Media Buyer
  optional: Search term (one row per search term under each keyword)

- Day becomes "DD/MM/YYYY" text (day first), like the other Bing files.
- CTR / top impr. rate / abs. top impr. rate are fractions in the export (0.5 = 50 %) → stored as 0–100.
  Values written as "50%" or "50.0 %" are read as percentages.
- Media Buyer "TH02" → "TH2", "TH01" → "TH" (leading zeros dropped, 1 = the base code).
- Goal = the conversion goal name ("Conversion name" header also accepted); "-" or empty → null.
  Bing segments the report by goal: the "-" row of a keyword-day carries impressions / clicks / spend,
  and one extra row per goal carries that goal's Conv. / All conv. (spend "-"). Each row is kept as its
  own document so conversions stay per goal; the dashboard adds them back together per keyword.
- Conv. / All conv. → conversions / all_conversions.
- Rows that repeat the same day × campaign × ad group × keyword × match type × search term are summed.
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

COLUMNS = {
    'Day': 'report_date',
    'Keyword': 'keyword',
    'Search term': 'search_term',
    'Goal': 'goal',
    'Campaign': 'campaign_name',
    'Ad group': 'ad_group_name',
    'Match type': 'match_type',
    'Bid': 'bid_usd',
    'Clicks': 'clicks',
    'Impr.': 'impressions',
    'CTR': 'ctr_pct',
    'Avg. CPC': 'cpc_usd',
    'Spend': 'spend_usd',
    'Top impr. rate': 'top_impr_rate_pct',
    'Abs. top impr. rate': 'abs_top_impr_rate_pct',
    'Media Buyer': 'media_buyer',
}
REQUIRED = ['Day', 'Keyword', 'Campaign', 'Ad group', 'Clicks', 'Impr.', 'Spend']

df = pd.read_excel(SRC) if SRC.suffix.lower() in ('.xlsx', '.xls') else pd.read_csv(SRC, encoding='utf-8-sig')
df.columns = [str(c).strip() for c in df.columns]
# Bing names the column "Search term" or "Search terms" depending on the report
df = df.rename(columns={c: 'Search term' for c in df.columns if c.lower() in ('search term', 'search terms', 'search query')})
# "Goal" is Bing's conversion name; accept either header
df = df.rename(columns={c: 'Goal' for c in df.columns if c.lower() in ('goal', 'goals', 'conversion name', 'conversion', 'conversion goal')})
missing = [c for c in REQUIRED if c not in df.columns]
if missing:
    sys.exit(f'Missing column(s): {", ".join(missing)}. Found: {", ".join(df.columns)}')
# drop Bing's footer lines ("Total", "©2026 Microsoft …") and empty rows
df = df[df['Keyword'].notna() & df['Campaign'].notna()]


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
    """Fraction (0.5) or "50%" → 50.0."""
    if isinstance(v, str) and '%' in v:
        return num(v)
    n = num(v)
    return None if n is None else round(n * 100, 4)


def day(v):
    if isinstance(v, (datetime, date, pd.Timestamp)):
        d = pd.Timestamp(v)
    else:
        s = str(v).strip()
        # day first, like every other Bing file ("01/10/2026" = 1 Oct)
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


docs = {}
for _, r in df.iterrows():
    d = {
        'report_date': day(r['Day']),
        'keyword': text(r['Keyword']),
        'search_term': text(r.get('Search term')),
        'goal': (lambda g: None if g in (None, '-', '--') else g)(text(r.get('Goal'))),
        'campaign_name': text(r['Campaign']),
        'ad_group_name': text(r['Ad group']),
        'match_type': (text(r.get('Match type')) or '').lower() or None,
        'bid_usd': num(r.get('Bid')),
        'impressions': int(num(r['Impr.']) or 0),
        'clicks': int(num(r['Clicks']) or 0),
        'spend_usd': round(num(r['Spend']) or 0, 2),
        'ctr_pct': rate(r.get('CTR')),
        'cpc_usd': num(r.get('Avg. CPC')),
        'top_impr_rate_pct': rate(r.get('Top impr. rate')),
        'abs_top_impr_rate_pct': rate(r.get('Abs. top impr. rate')),
        'conversions': num(r.get('Conv.')) or 0,
        'all_conversions': num(r.get('All conv.')) or 0,
        'media_buyer': buyer(r.get('Media Buyer')),
    }
    key = (d['report_date'], d['campaign_name'], d['ad_group_name'], d['keyword'], d['match_type'], d['search_term'], d['goal'])
    if key in docs:
        prev = docs[key]
        for f in ('impressions', 'clicks', 'conversions', 'all_conversions'):
            prev[f] += d[f]
        prev['spend_usd'] = round(prev['spend_usd'] + d['spend_usd'], 2)
        prev['ctr_pct'] = round(prev['clicks'] / prev['impressions'] * 100, 4) if prev['impressions'] else None
        prev['cpc_usd'] = round(prev['spend_usd'] / prev['clicks'], 2) if prev['clicks'] else None
    else:
        docs[key] = d

rows = list(docs.values())
(OUT / 'bing_keyword_reports.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1))

days = sorted({datetime.strptime(d['report_date'], '%d/%m/%Y').date() for d in rows})
buyers = {}
for d in rows:
    buyers[d['media_buyer'] or '(none)'] = buyers.get(d['media_buyer'] or '(none)', 0) + 1
print(json.dumps({
    'file': str(OUT / 'bing_keyword_reports.json'),
    'rows': len(rows),
    'source_rows': int(len(df)),
    'days': f'{days[0]} … {days[-1]}' if days else None,
    'keywords': len({d['keyword'] for d in rows}),
    'search_terms': len({d['search_term'] for d in rows if d['search_term']}),
    'goal_rows': sum(1 for d in rows if d['goal']),
    'all_conversions_by_goal': {g: sum(d['all_conversions'] for d in rows if d['goal'] == g) for g in sorted({d['goal'] for d in rows if d['goal']})},
    'spend_usd': round(sum(d['spend_usd'] for d in rows), 2),
    'clicks': sum(d['clicks'] for d in rows),
    'impressions': sum(d['impressions'] for d in rows),
    'conversions': sum(d['conversions'] for d in rows),
    'all_conversions': sum(d['all_conversions'] for d in rows),
    'media_buyers': buyers,
}, indent=1))
