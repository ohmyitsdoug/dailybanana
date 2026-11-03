"""Build data/items.json and data/dailies.json for Daily Banana.
Items come from tools/scale_items.txt. Each daily has 6 rounds: "How many [unit] [long/tall/across] is [thing]?"
Each day has one answer from each size range, from small (3-20) to big (2,000-50,000), the unit is always something smaller and
familiar, and a thing being measured doesn't come back within 10 days.
Hyper-specific items (tools/specific.txt: landmarks, niche gear) show up in only 1-2 rounds a day.
Dailies up to FROZEN (already played) are kept exactly as they are in data/dailies.json.
Usage: python3 tools/make_scale.py 2026-11-03 365
"""
import json, os, random, sys, datetime, math
HERE = os.path.dirname(os.path.abspath(__file__))
start = datetime.date.fromisoformat(sys.argv[1] if len(sys.argv) > 1 else '2026-11-03')
days = int(sys.argv[2]) if len(sys.argv) > 2 else 365
items = []
for line in open(os.path.join(HERE, 'scale_items.txt')):
    line = line.strip()
    if not line or line.startswith('#'): continue
    p = [x.strip() for x in line.split('|')]
    items.append({'id': len(items), 'name': p[0], 'plural': p[1], 'art': p[2], 'dim': p[3], 'cm': float(p[4]), 'unit': len(p) > 5 and p[5] == 'u'})
SPECIFIC = {l.strip() for l in open(os.path.join(HERE, 'specific.txt')) if l.strip() and not l.startswith('#')}
missing = SPECIFIC - {i['name'] for i in items}
if missing: sys.exit(f'specific.txt names items that are not in scale_items.txt: {sorted(missing)}')
for i in items:
    if i['name'] in SPECIFIC: i['x'] = True   # hyper-specific
json.dump(items, open(os.path.join(HERE, '..', 'data', 'items.json'), 'w'), separators=(',', ':'))
units = [i for i in items if i['unit']]
BUCKETS = [(3, 20), (15, 80), (50, 300), (150, 1500), (500, 6000), (2000, 50000)]  # keep in sync with BUCKETS in index.html
pairs = {k: [] for k in range(len(BUCKETS))}
for a in units:
    for b in items:
        if a['id'] == b['id']: continue
        r = b['cm'] / a['cm']
        for k, (lo, hi) in enumerate(BUCKETS):
            if lo <= r <= hi: pairs[k].append((a['id'], b['id']))
FROZEN = 0   # dailies #000..FROZEN stay as they are
old = {}
try: old = {d['n']: d for d in json.load(open(os.path.join(HERE, '..', 'data', 'dailies.json')))}
except Exception: pass
spec = lambda p: bool(items[p[0]].get('x') or items[p[1]].get('x'))
random.seed(5)
last, out, used_pairs = {}, [], set()
for d in range(days):
    if d <= FROZEN and d in old:
        out.append(old[d])
        for r in old[d]['rounds']: used_pairs.add((r['a'], r['b'])); last[r['b']] = d
        continue
    today, rounds = set(), []
    want = set(random.sample(range(len(BUCKETS)), random.choice((1, 1, 2))))   # which rounds get the one or two specific items
    for k in range(len(BUCKETS)):
        for gap in (10, 5, 2, 0):
            c = [p for p in pairs[k] if p not in used_pairs and not ({p[0], p[1]} & today) and d - last.get(p[1], -99) >= gap]
            c2 = [p for p in c if spec(p) == (k in want)]
            if c2: c = c2; break
            if c and gap == 0: break
        p = random.choice(c)
        rounds.append({'a': p[0], 'b': p[1]}); used_pairs.add(p); today |= {p[0], p[1]}; last[p[1]] = d
    random.shuffle(rounds)   # one answer from each size range, in a random order
    out.append({'n': d, 'date': (start + datetime.timedelta(days=d)).isoformat(), 'rounds': rounds})
json.dump(out, open(os.path.join(HERE, '..', 'data', 'dailies.json'), 'w'), separators=(',', ':'))
print(len(items), 'items,', len(units), 'units,', {k: len(v) for k, v in pairs.items()}, 'pairs per bucket;', len(out), 'days')
def q(r):
    a, b = items[r['a']], items[r['b']]
    return f"How many {a['plural']} {b['dim']} is {(b['art'] + ' ') if b['art'] else ''}{b['name']}? ≈ {b['cm'] / a['cm']:.0f}"
from collections import Counter
print('specific rounds per day:', sorted(Counter(sum(spec((r['a'], r['b'])) for r in dd['rounds']) for dd in out).items()))
for dd in out[:2]:
    for r in dd['rounds']: print(' ', q(r))
