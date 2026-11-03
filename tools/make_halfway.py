"""Build data/dailies.json for v0.3 "Halfway": 7 rounds a day, each a big word and a small word
about 3 sizes apart (1 size = 1.5x). Players name the thing closest to the middle.
Middles must have plenty of everyday words nearby; a day's 7 rounds spread across scales;
an end word doesn't come back within GAP_DAYS days.
Usage: python3 tools/make_halfway.py 2026-11-03 365
"""
import json, os, random, sys, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
W = json.load(open(os.path.join(HERE, '..', 'data', 'words.json')))
start = datetime.date.fromisoformat(sys.argv[1] if len(sys.argv) > 1 else '2026-11-03')
days = int(sys.argv[2]) if len(sys.argv) > 2 else 365
GAP_DAYS = int(os.environ.get('GAP_DAYS', 14))
plain = [r for r in W['words'] if len(r) == 3 or (len(r) > 3 and not r[4] and not r[5])]
EX = {r[0]: r[1] for r in plain}; POP = {r[0]: r[2] for r in plain}
avoid = set(open(os.path.join(HERE, 'pair_avoid.txt')).read().split())
CATS = json.load(open(os.path.join(HERE, '..', 'data', 'categories.json')))
concrete = set()
for c in CATS: concrete |= set(c['words'])   # things you'd find at a place, not the places
ends = sorted(w for w in EX if w not in avoid and 12 <= EX[w] <= 40 and
              ((w in concrete and POP[w] >= 3.4) or (POP[w] >= 4.6 and '_' not in w)))
everyday = [w for w in EX if POP[w] >= 3.3]
def middle_ok(b, s):
    mid = (EX[b] + EX[s]) / 2
    near = [w for w in everyday if abs(EX[w] - mid) <= 0.5 and w not in (b, s)]
    return len(near) >= 6
pairs = [(b, s) for b in ends for s in ends if 2.8 <= EX[b] - EX[s] <= 3.2 and middle_ok(b, s)]
random.seed(11)
random.shuffle(pairs)
lo = min(EX[b] + EX[s] for b, s in pairs) / 2; hi = max(EX[b] + EX[s] for b, s in pairs) / 2
bucket = lambda p: min(6, int(((EX[p[0]] + EX[p[1]]) / 2 - lo) / ((hi - lo) / 7 + 1e-9)))
last_used, pair_day, out = {}, {}, []
PAIR_GAP = int(os.environ.get('PAIR_GAP', 90))   # the same pair comes back at most every 90 days
fresh = lambda p, day: day - pair_day.get(p, -9999) >= PAIR_GAP
for day in range(days):
    rounds, today = [], set()
    for k in random.sample(range(7), 7):          # one round from each scale band, in a random order
        for gap in (GAP_DAYS, GAP_DAYS // 2, 3, 0):
            c = [p for p in pairs if bucket(p) == k and fresh(p, day) and not (set(p) & today)
                 and all(day - last_used.get(w, -999) >= gap for w in p)]
            if c: break
        if not c:
            c = [p for p in pairs if not (set(p) & today)]
        p = random.choice(c)
        rounds.append({'big': p[0], 'small': p[1]}); pair_day[p] = day; today |= set(p)
        for w in p: last_used[w] = day
    out.append({'n': day + 1, 'date': (start + datetime.timedelta(days=day)).isoformat(), 'rounds': rounds})
json.dump(out, open(os.path.join(HERE, '..', 'data', 'dailies.json'), 'w'), separators=(',', ':'))
print(len(pairs), 'possible pairs;', len(out), 'days written')
for d in out[:3]: print(d['n'], ', '.join(f"{r['big']}→{r['small']}" for r in d['rounds']))
