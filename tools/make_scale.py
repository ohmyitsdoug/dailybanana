"""Build data/items.json and data/dailies.json for Daily Banana.
Items come from tools/scale_items.txt. Each daily has 6 rounds: "How many [unit] [long/tall/across] is [thing]?"
Each day has two small (2-25), two medium (25-250) and two large (250-2,000) answers, the unit is always something smaller and
familiar, and a thing being measured doesn't come back within 10 days.
Hyper-specific items (tools/specific.txt: landmarks, niche gear) show up in only 1-2 rounds a day.
Counting units come only from tools/core.txt (well-known, standard sizes); about 2/3 of the other rounds measure a core item too.
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
# core items (tools/core.txt): well-known, standard-size things. Only they are counting units, and most rounds measure one.
CORE = {l.strip() for l in open(os.path.join(HERE, 'core.txt')) if l.strip() and not l.startswith('#')}
missing = CORE - {i['name'] for i in items}
if missing: sys.exit(f'core.txt names items that are not in scale_items.txt: {sorted(missing)}')
for i in items:
    i['unit'] = i['name'] in CORE
    if i['unit']: i['core'] = True
# renamed items keep their old names in 'was', so challenges and saved games made before the rename still find them
RENAMED = {'American football field': ['football field']}
for i in items:
    if i['name'] in RENAMED: i['was'] = RENAMED[i['name']]
try: OLD_NAMES = [i['name'] for i in json.load(open(os.path.join(HERE, '..', 'data', 'items.json')))]
except Exception: OLD_NAMES = []
json.dump(items, open(os.path.join(HERE, '..', 'data', 'items.json'), 'w'), separators=(',', ':'))
units = [i for i in items if i['unit']]
BUCKETS = [(2, 25), (2, 25), (25, 250), (25, 250), (250, 2000), (250, 2000)]  # 2 small, 2 medium, 2 large; keep in sync with BUCKETS in index.html
pairs = {k: [] for k in range(len(BUCKETS))}
for a in units:
    for b in items:
        if a['id'] == b['id'] or b['dim'] == 'deep': continue   # no "deep" questions (nobody can picture the bottom of the Mariana Trench)
        r = b['cm'] / a['cm']
        for k, (lo, hi) in enumerate(BUCKETS):
            if lo <= r <= hi: pairs[k].append((a['id'], b['id']))
FROZEN = 4   # dailies #000..FROZEN stay as they are (#004 is Nov 7; the wide/big-vs-big update starts with #005, Nov 8)
RENAMES = {'football field': 'American football field'}   # old name -> new, so frozen dailies keep pointing at the same item
old = {}
try: old = {d['n']: d for d in json.load(open(os.path.join(HERE, '..', 'data', 'dailies.json')))}
except Exception: pass
spec = lambda p: bool(items[p[0]].get('x') or items[p[1]].get('x'))
big = lambda p: items[p[0]]['cm'] >= 3000 and items[p[1]]['cm'] >= 3000   # both sides huge
# a big-vs-big round compares like with like: towers in towers, lengths in lengths
big_ok = lambda p: big(p) and (items[p[0]]['dim'] == 'tall') == (items[p[1]]['dim'] == 'tall')
from collections import Counter
random.seed(5)
last, out, used_pairs = {}, [], set()
for d in range(days):
    if d <= FROZEN and d in old:
        byname = {i['name']: i['id'] for i in items}
        nm = lambda i: byname[RENAMES.get(OLD_NAMES[i], OLD_NAMES[i])]
        old[d] = {**old[d], 'rounds': [{'a': nm(r['a']), 'b': nm(r['b'])} for r in old[d]['rounds']]}
        out.append(old[d])
        for r in old[d]['rounds']: used_pairs.add((r['a'], r['b'])); last[r['b']] = d
        continue
    today, rounds, dims = set(), [], Counter()
    want = set(random.sample(range(len(BUCKETS)), random.choice((1, 1, 2))))   # which rounds get the one or two specific items
    # about 3 days in 5, one small or medium round is big vs big: two huge, famous things ("How many Titanics long is the Golden Gate Bridge?")
    bigk = random.choice((0, 1, 2, 3)) if random.random() < 0.6 else None
    if bigk is not None: want.add(bigk)
    for k in range(len(BUCKETS)):
        core_b = random.random() < 2 / 3   # most everyday rounds measure a core item too
        for gap in (10, 5, 2, 0):
            c = [p for p in pairs[k] if p not in used_pairs and not ({p[0], p[1]} & today) and d - last.get(p[1], -99) >= gap]
            if k == bigk: c2 = [p for p in c if big_ok(p)]
            else: c2 = [p for p in c if not big(p) and spec(p) == (k in want) and (k in want or not core_b or items[p[1]].get('core'))]
            # mix of measuring words: at most 3 of any one (long, tall, wide, across) in a day
            c3 = [p for p in c2 if dims[items[p[1]]['dim']] < 3]
            if c3: c = c3; break
            if c2: c = c2; break
            if c and gap == 0: break
        p = random.choice(c)
        rounds.append({'a': p[0], 'b': p[1]}); used_pairs.add(p); today |= {p[0], p[1]}; last[p[1]] = d; dims[items[p[1]]['dim']] += 1
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
