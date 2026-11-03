"""Build data/fits.json and data/dailies.json for v0.4 "Snug".
tools/fits.txt lists real spaces ("in a suitcase", "through a door") with the longest thing that fits, in cm.
Each daily has 7 of them: a mix of small, medium and big spaces, in a random order. Every prompt is used once
before any repeats, so with 120 prompts a prompt comes back about every 17 days. Add lines to fits.txt to stretch that.
Usage: python3 tools/make_snug.py 2026-11-03 365
"""
import json, math, os, random, sys, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
start = datetime.date.fromisoformat(sys.argv[1] if len(sys.argv) > 1 else '2026-11-03')
days = int(sys.argv[2]) if len(sys.argv) > 2 else 365
fits = []
for line in open(os.path.join(HERE, 'fits.txt')):
    line = line.strip()
    if not line or line.startswith('#'): continue
    parts = [x.strip() for x in line.split('|')]
    phrase, head, cm = parts[:3]
    examples = [e.strip() for e in parts[3].split(',')] if len(parts) > 3 else []
    cm = float(cm)
    fits.append({'id': len(fits), 'phrase': phrase, 'head': head, 'cm': cm, 'ex': examples,
                 'size': round(math.log(cm / 0.001) / math.log(1.5) + 1, 2)})
# Open-top spaces (baskets, carts, beds, anything "on") take things that stick up or out a bit:
# a person stands in a hot air balloon basket. They accept up to OPEN_OVER sizes (about 35%) bigger.
OPEN = set("""door garage_door elevator basket laundry_basket shopping_cart wagon wheelbarrow crib sandbox stroller hot_tub bathtub
canoe swimming_pool gift_bag bucket trash_can doghouse""".split())
W = json.load(open(os.path.join(HERE, '..', 'data', 'words.json')))
EX = {r[0]: r[1] for r in W['words']}; AL = W.get('aliases', {})
TIGHT = math.log(1.05) / math.log(1.5); FLOOR = 2.5; OPEN_OVER = 0.75
def look(x):
    x = x.lower().replace(' ', '_')
    for c in (x, AL.get(x), x[:-1] if x.endswith('s') else None):
        if c and c in EX: return c
def pts(f, size):
    over = OPEN_OVER if f['open'] else TIGHT
    d = f['size'] - size
    if d < -over: return 0
    return 100 if d <= TIGHT else max(10, round(100 - (d - TIGHT) / (FLOOR - TIGHT) * 90))
weak = []
for f in fits:
    f['open'] = f['phrase'].startswith('on ') or f['head'] in OPEN or 'basket' in f['phrase']
    known = [(e, look(e)) for e in f['ex']]
    scored = sorted(((pts(f, EX[w]), e) for e, w in known if w), reverse=True)
    f['ex'] = [e for p, e in scored if p >= 60]          # what players see after the round
    if len(f['ex']) < 2: weak.append(f"{f['phrase']} ({f['cm']} cm): " + ', '.join(f"{e} {p}" for p, e in scored))
if weak: print(len(weak), 'spaces with fewer than 2 good examples:', *weak, sep='\n  ')
json.dump(fits, open(os.path.join(HERE, '..', 'data', 'fits.json'), 'w'), separators=(',', ':'))
random.seed(5)
by_size = sorted(fits, key=lambda f: f['size'])
third = len(by_size) // 3
small, mid, big = by_size[:third], by_size[third:2 * third], by_size[2 * third:]
out, queue = [], {'s': [], 'm': [], 'b': []}
def take(kind, pool, today):
    if not queue[kind]: queue[kind] = random.sample(pool, len(pool))
    for i, f in enumerate(queue[kind]):
        if f['id'] not in today: return queue[kind].pop(i)
    return queue[kind].pop(0)
for d in range(days):
    today, picks = set(), []
    for kind, pool in [('s', small), ('s', small), ('m', mid), ('m', mid), ('m', mid), ('b', big), ('b', big)]:
        f = take(kind, pool, today); today.add(f['id']); picks.append(f['id'])
    random.shuffle(picks)
    out.append({'n': d + 1, 'date': (start + datetime.timedelta(days=d)).isoformat(), 'rounds': picks})
json.dump(out, open(os.path.join(HERE, '..', 'data', 'dailies.json'), 'w'), separators=(',', ':'))
print(len(fits), 'prompts,', len(out), 'days')
for d in out[:2]: print(d['n'], ' / '.join(fits[i]['phrase'] for i in d['rounds']))
