"""Build data/dailies.json for v0.2 ("fill the gap").
Each daily is a well-known big word and a well-known small word about 8 sizes apart (1 size = 1.5x),
picked so every size in between has plenty of everyday words. No word is a start or end twice in a year.
Usage: python3 tools/make_pairs.py 2026-11-03 365
"""
import json, os, random, sys, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
W = json.load(open(os.path.join(HERE, '..', 'data', 'words.json')))
start = datetime.date.fromisoformat(sys.argv[1] if len(sys.argv) > 1 else '2026-11-03')
days = int(sys.argv[2]) if len(sys.argv) > 2 else 365
plain = [r for r in W['words'] if len(r) == 3 or (len(r) > 3 and not r[4] and not r[5])]   # not a "kind of", one meaning
EX = {r[0]: r[1] for r in plain}
POP = {r[0]: r[2] for r in plain}
avoid = set(open(os.path.join(HERE, 'pair_avoid.txt')).read().split()) if os.path.exists(os.path.join(HERE, 'pair_avoid.txt')) else set()
# ends must be everyday, easy-to-picture words
# ends: concrete things from the place lists (easy to picture), plus very common single words
CATS = json.load(open(os.path.join(HERE, '..', 'data', 'categories.json')))
concrete = set()
for c in CATS: concrete |= set(c['words']) | {c['start']}
ends = sorted(w for w in EX if w not in avoid and 12 <= EX[w] <= 52 and
              ((w in concrete and POP[w] >= 3.4) or (POP[w] >= 4.6 and '_' not in w)))
GAP_DAYS = int(os.environ.get('GAP_DAYS', 40))   # a word can't come back as a start or end within this many days
everyday = [w for w in EX if POP[w] >= 3.3]
MIN_PER_BAND = int(os.environ.get('MIN_PER_BAND', 5))

def bands_ok(big, small):
    d = EX[big] - EX[small]
    counts = [0] * 7
    for w in everyday:
        x = EX[w]
        if EX[small] + 0.3 < x < EX[big] - 0.3:
            k = min(6, max(0, int((EX[big] - x) / d * 8 - 0.5)))
            counts[k] += 1
    return min(counts) >= MIN_PER_BAND, counts

pairs = []
for b in ends:
    for s in ends:
        d = EX[b] - EX[s]
        if 7.6 <= d <= 8.6:
            ok, counts = bands_ok(b, s)
            if ok: pairs.append((b, s, min(counts)))
random.seed(7)
random.shuffle(pairs)
order, last_used, used_pairs = [], {}, set()
for day in range(days):
    prev = order[-1] if order else None
    def ok(p, gap):
        b, s, _ = p
        if (b, s) in used_pairs: return False
        if any(day - last_used.get(w, -999) < gap for w in (b, s)): return False
        return not prev or abs(EX[b] - EX[prev[0]]) > 3
    pick = None
    for gap in (GAP_DAYS, GAP_DAYS // 2, 7):
        cands = [p for p in pairs if ok(p, gap)]
        if cands:
            cands.sort(key=lambda p: -(p[2] + random.random() * 8))   # roomier pairs first, with some randomness
            pick = cands[0]; break
    if not pick: break
    order.append(pick); used_pairs.add(pick[:2])
    for w in pick[:2]: last_used[w] = day
order = [(b, s) for b, s, _ in order]
out = order
dailies = [{'n': i + 1, 'date': (start + datetime.timedelta(days=i)).isoformat(), 'start': b, 'end': s,
            'start_size': EX[b], 'end_size': EX[s]} for i, (b, s) in enumerate(order[:days])]
json.dump(dailies, open(os.path.join(HERE, '..', 'data', 'dailies.json'), 'w'), indent=0)
print(len(pairs), 'possible pairs,', len(out), 'without repeats,', len(dailies), 'dailies written')
for d in dailies[:12]: print(d['n'], d['start'], '→', d['end'], round(d['start_size'] - d['end_size'], 2))
