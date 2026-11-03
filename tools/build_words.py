"""Rebuild data/words.json and review/snug-words-review.csv.

Inputs (tools/sizes/):
  sizes_*.txt   size_cm: word word two_word        (later files win; sizes_z.txt is for fixes)
  senses.txt    word: other sizes                   (wing of a bird AND wing of a hospital)
  specific.tsv  specific word -> parent word        (from WordNet; DEMITASSE takes COFFEE CUP's size)
  specific_extra.tsv  the same, added by hand       (MINI_FRIDGE -> FRIDGE; give it its own size in sizes_z.txt)
  aliases.txt   other name = word                 (MED KIT = FIRST AID KIT)
  skip.txt / proper.txt                             (placeholders and proper nouns to leave out)

Commonness comes from an English word-frequency list (set FREQ to e.g. FrequencyWords en_full.txt);
without it every word gets 2.

words.json rows:  [word, size, commonness]   size = exact tier (24.13); round it for the tier                       plain word
                  [word, tier, commonness, specificity, parent, [extra tiers]]  plain word that is a kind of
                                                                 another word and/or has other meanings
                  [word, tier, commonness, specificity, parent]  specific word
"""
import json, math, csv, collections, os
from parse_sizes import S, T, ALT, BASE
# exact size on the tier scale (24.13): the tier is its rounded value; the decimals order words inside one tier
EX = {w: round(max(1, math.log(s / BASE) / math.log(1.5) + 1), 2) for w, s in S.items()}
for w in EX:
    if round(EX[w]) != T[w]: EX[w] = T[w] + (0.49 if EX[w] > T[w] else -0.49)

HERE = os.path.dirname(os.path.abspath(__file__))
freq = {}
FREQ = os.environ.get('FREQ', '')
if FREQ and os.path.exists(FREQ):
    for line in open(FREQ):
        w, c = line.split(); freq[w] = int(c)

def commonness(w):
    if not freq: return 2
    parts = w.split('_')
    f = freq.get(w, 1) if len(parts) == 1 else max(1, min(freq.get(p, 1) for p in parts) // 20)
    return round(math.log10(f + 1), 2)

links = {}   # word -> (parent, depth); plain words can be specific too (ARMCHAIR is a kind of CHAIR)
for fn in ('specific.tsv', 'specific_extra.tsv'):
    path = os.path.join(HERE, 'sizes', fn)
    if not os.path.exists(path): continue
    for line in open(path):
        if line.startswith('#') or not line.strip(): continue
        w, parent, depth = line.rstrip('\n').split('\t')
        if parent in T: links[w] = (parent, int(depth))
rows = []
for w in sorted(S, key=lambda w: (-S[w], w)):
    r = [w, EX[w], commonness(w)]
    if w in links or ALT.get(w): r += [links.get(w, ('', 0))[1], links.get(w, ('', 0))[0], ALT.get(w, [])]
    rows.append(r)
spec = []
for w, (parent, depth) in links.items():
    if w not in T:
        spec.append([w, EX[parent], commonness(w), depth, parent])
rows += sorted(spec, key=lambda r: (-r[1], r[0]))

# other everyday names (MED KIT -> FIRST AID KIT)
known = {r[0] for r in rows}
aliases = {}
for line in open(os.path.join(HERE, 'sizes', 'aliases.txt')):
    if line.startswith('#') or '=' not in line: continue
    a, w = [x.strip().lower() for x in line.split('=', 1)]
    a = a.replace("'", '').replace('-', ' ').replace(' ', '_')
    if w in known and a != w and a not in known: aliases[a] = w

json.dump({'base_cm': BASE, 'step': 1.5, 'tiers': max(T.values()), 'words': rows, 'aliases': aliases},
          open(os.path.join(HERE, '..', 'data', 'words.json'), 'w'), separators=(',', ':'))

bytier = collections.defaultdict(list)
for w in S: bytier[T[w]].append(w)
ref = {t: max(ws, key=commonness) for t, ws in bytier.items()}
with open(os.path.join(HERE, '..', 'review', 'snug-words-review.csv'), 'w', newline='') as fh:
    c = csv.writer(fh)
    c.writerow(['word', 'tier', 'size_cm', 'same_size_as', 'kind_of', 'commonness_0to8', 'keep(y/n)', 'new_size_cm', 'notes'])
    for r in rows:
        w, t = r[0], round(r[1])
        parent = r[4] if len(r) > 4 else ''
        c.writerow([w.replace('_', ' '), t, S.get(w, S.get(parent, '')), ref[t].replace('_', ' '), parent.replace('_', ' '), r[2], '', '', ''])
print(len(S), 'plain words +', len(spec), 'specific words +', len(aliases), 'other names')
