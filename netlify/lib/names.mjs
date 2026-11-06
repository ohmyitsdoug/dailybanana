// Display-name rules for Daily Banana accounts and challenge boards.
//   2-16 characters: letters (any language), numbers, spaces, _ - . ' and up to 2 emoji
//   no links or @handles, no reserved names (Smidgen, Daily Banana, admin, guest...), no swearing or slurs
// Messages never say which rule a name broke, so the filter can't be probed.
// The admin account may use reserved words (but never swearing).

const SORRY = 'That name isn’t available. Try another one!';

// letters that people swap in to sneak words past a filter
const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e', '£': 'l' };
const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
// "f.u_c k" -> "fuck"; "sh1t" -> "shit"; "fuuuck" -> "fuck"
const squash = (s) => [...fold(s)].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
const words = (s) => fold(s).split(/[^a-z0-9@$!|+]+/).filter(Boolean).map((w) => [...w].map((c) => LEET[c] ?? c).join('').replace(/(.)\1+/g, '$1'));

// blocked even inside other words (slurs and the strongest swears)
const SEVERE = ['nigger', 'nigga', 'niga', 'faggot', 'fagot', 'retard', 'kike', 'chink', 'spic', 'wetback', 'tranny', 'beaner', 'gook', 'coon', 'raghead', 'towelhead',
  'fuck', 'motherfuck', 'cunt', 'shit', 'bitch', 'whore', 'slut', 'nazi', 'hitler', 'rape', 'rapist', 'pedo', 'pedophile', 'molest', 'pussy', 'penis', 'vagina', 'porn', 'jizz', 'dildo', 'bastard', 'twat', 'wank', 'bollock', 'kkk'];
// blocked only as whole words, so names like Cassidy, Scunthorpe or Dickens still work
const MILD = ['ass', 'arse', 'asshole', 'damn', 'hell', 'crap', 'piss', 'tit', 'tits', 'boob', 'boobs', 'fag', 'sex', 'sexy', 'nude', 'naked', 'butt', 'poop', 'turd', 'hoe', 'wtf', 'stfu', 'gtfo', 'kys', 'dumbass', 'jackass',
  'dick', 'dicks', 'cock', 'cocks', 'cum', 'anal', 'anus', 'balls', 'nut', 'nuts', 'horny', 'milf', 'thot'];
// short words that "fold" into severe words by accident (dick -> Dickens, cock -> Hitchcock, cum -> cucumber, anal -> analyst...)
const SAFE_INSIDE = ['scunthorpe', 'shitake', 'shiitake', 'raccoon', 'cocoon', 'tycoon', 'spice', 'spicy', 'spicer', 'grape', 'drape', 'scrape', 'therapist', 'snigger', 'swank', 'torpedo', 'pedometer', 'cockapoo'];
// reserved for the game itself
const RESERVED_IN = ['smidgen', 'dailybanana', 'bananabot'];   // blocked anywhere in the name
const RESERVED_WORD = ['admin', 'administrator', 'moderator', 'mod', 'mods', 'staff', 'official', 'support', 'system', 'guest', 'team'];   // blocked as words (Badminton is fine)

const EMOJI = /\p{Extended_Pictographic}/gu;

/** -> { ok:true, name } or { ok:false, error } */
export function checkName(raw, { admin = false } = {}) {
  let name = String(raw || '').replace(/[<>"&]/g, '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
  if ([...name].length > 16) return { ok: false, error: 'Names can be up to 16 characters.' };
  if ([...name.replace(EMOJI, '')].filter((c) => /\S/.test(c)).length < 2) return { ok: false, error: 'Names need at least 2 letters or numbers.' };
  if ((name.match(EMOJI) || []).length > 2) return { ok: false, error: 'Names can have up to 2 emoji.' };
  // letters, marks, numbers, spaces, _ - . ' and emoji (with their joiners and skin tones)
  if (!/^[\p{L}\p{M}\p{N} _\-.'’\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍]+$/u.test(name)) return { ok: false, error: 'Names can use letters, numbers, spaces, emoji and _ - . \'' };
  // no links or handles
  if (/(https?|www\.|\.(com|net|org|io|gg|co|ly|me|tv|xyz)\b|@)/i.test(name)) return { ok: false, error: SORRY };
  const flat = squash(name), ws = words(name);
  if (!admin) {
    if (RESERVED_IN.some((r) => flat.includes(r)) || ws.some((w) => RESERVED_WORD.includes(w))) return { ok: false, error: SORRY };
    if (/^guest\W*\d*$/i.test(name.replace(/\s/g, ''))) return { ok: false, error: SORRY };
  }
  let clean = flat;
  for (const s of SAFE_INSIDE) clean = clean.split(s).join('');
  if (SEVERE.some((w) => clean.includes(w))) return { ok: false, error: SORRY };
  if (ws.some((w) => MILD.includes(w))) return { ok: false, error: SORRY };
  return { ok: true, name };
}
export const validName = (n, o) => checkName(n, o).ok;
// a signed-in player's name to fall back to: their original sign-in name if it passes, else 'Player'
export function fallbackName(u) {
  for (const n of [u.orig, u.discord && u.discord.username]) { const r = checkName(n); if (r.ok) return r.name; }
  return 'Player';
}
// names on challenge boards: guests keep their Guest_1234, everything else must pass the rules
export const boardName = (raw) => { const s = String(raw || '').trim(); if (/^Guest_\d{4}$/.test(s)) return s; const r = checkName(s); return r.ok ? r.name : 'Someone'; };
