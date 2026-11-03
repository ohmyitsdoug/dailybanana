"""Make the SNUG daily schedule from tools/categories.txt and data/words.json.

Each day: a category and its start word. Players name smaller and smaller things, 1-4 sizes at a time.
A hidden bottom sits 12-20 sizes below the start; reaching it earns a bonus and ends the round.
The bottom word shown afterwards is the smallest typical thing from the category in that range when there is one.

Categories are shuffled and used in full before any repeats, so with N categories nothing repeats for N days.
(Aim for 365 categories so a whole year is unique.)

Usage: python3 make_dailies.py [START_DATE] [DAYS]     e.g. python3 make_dailies.py 2026-11-01 365
"""
import json, random, sys, datetime, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
START = datetime.date.fromisoformat(sys.argv[1] if len(sys.argv) > 1 else '2026-11-01')
DAYS = int(sys.argv[2]) if len(sys.argv) > 2 else 365
DEPTH = (12, 20)

rows = json.load(open(os.path.join(DATA, 'words.json')))['words']
tier = {r[0]: r[1] for r in rows}
pop = {r[0]: r[2] for r in rows}
many_meanings = {r[0] for r in rows if len(r) > 5 and r[5]}   # WING, DECK: bad as a reveal word
plain_by_tier = collections.defaultdict(list)
for r in rows:
    if len(r) < 5 or not r[4]: plain_by_tier[r[1]].append(r[0])

cats = []
for line in open(os.path.join(HERE, 'categories.txt')):
    if line.startswith('#') or '|' not in line: continue
    name, start, words = [x.strip() for x in line.split('|')]
    start = start.replace(' ', '_')
    words = [w.strip().replace(' ', '_') for w in words.split(',') if w.strip()]
    missing = [w for w in [start] + words if w not in tier]
    if missing: print(f'{name}: not in word list, skipped: {", ".join(missing)}')
    words = [w for w in words if w in tier]
    st = tier[start]
    inrange = [w for w in words if st - DEPTH[1] <= tier[w] <= st - DEPTH[0] and w not in many_meanings]
    if inrange:
        bottom = min(inrange, key=lambda w: (tier[w], -pop[w]))
        floor = tier[bottom]
    else:
        floor = st - 13
        bottom = max(plain_by_tier.get(floor, ['?']), key=lambda w: pop.get(w, 0))
    cats.append({'cat': name, 'start': start, 'floor': floor, 'bottom': bottom, 'words': words})

json.dump([{k: c[k] for k in ('cat', 'start', 'words')} for c in cats],
          open(os.path.join(DATA, 'categories.json'), 'w'), separators=(',', ':'))
rng = random.Random(7)
order = []
while len(order) < DAYS:
    batch = cats[:]; rng.shuffle(batch)
    if order and batch[0]['cat'] == order[-1]['cat']: batch.append(batch.pop(0))
    order += batch
out = [{'n': i + 1, 'date': (START + datetime.timedelta(days=i)).isoformat(), 'cat': c['cat'], 'start': c['start'],
        'floor': c['floor'], 'bottom': c['bottom']} for i, c in enumerate(order[:DAYS])]
json.dump(out, open(os.path.join(DATA, 'dailies.json'), 'w'), indent=0)
print(f'{len(cats)} categories -> {len(out)} dailies from {out[0]["date"]} to {out[-1]["date"]}')
for o in out[:6]: print(o['n'], o['date'], o['cat'], o['start'], '... bottom', o['bottom'], tier[o['start']] - o['floor'], 'sizes down')
