// Builds about.html and faq.html in the public pages' style. Run: node tools/make_pages.mjs
// Edit the text below, then run it again.
import { writeFileSync } from 'node:fs';
import { page, SITE_URL } from '../netlify/lib/page.mjs';

const FAQ = [
  ['What is Daily Banana?', 'Daily Banana (dailybanana.io) is a free daily guessing game about size. Each round asks how many of one everyday thing would line up to match another, like "How many bananas long is a school bus?" You type a number, and the closer you are, the more points you get. Its tagline is "Banana for scale."'],
  ['How do you play?', 'There are 6 rounds, and each one gives you 25 seconds. Read the question, picture the two things side by side, and type your best guess. After each round you see the answer, the real sizes of both things, and how close you were.'],
  ['How is it scored?', 'Each round is worth up to 100 points, and your points are your accuracy as a percent: the smaller of your guess and the answer, divided by the bigger. Guessing half the answer or twice the answer both score 50. Being 5 times off scores 20, and 10 times off scores 10. A full game is worth 600 points.'],
  ['Where do the sizes come from?', 'Every size is an approximation: a typical average for that thing, drawn from publicly available data and rounded. Real things vary, so the game asks you to picture a typical one: a regular banana, a standard school bus, an adult shoe.'],
  ['When does a new daily come out?', 'A new daily arrives at midnight in your own time zone, like Wordle. Everyone gets the same six questions for the same daily number.'],
  ['Can I see past answers?', `Yes. Every daily is posted in the archive at ${SITE_URL}/archive once it has finished everywhere in the world, with the answers, the real sizes, the average score and where players typically guessed.`],
  ['What is quick play?', 'Quick play gives you six new random questions whenever you want, separate from the daily. It never repeats daily questions or the questions you have seen recently.'],
  ['How do challenges work?', 'Up to an hour after a quick game, you can turn it into a challenge link. Anyone with the link plays the same six questions once, for 24 hours, and sees a shared scoreboard. You can have one open challenge at a time and join as many as you like.'],
  ['Are there badges?', 'Yes. Badges are earned in the daily, like scoring 95 or more on a round, playing 7 dailies in a row, or getting 90+ on the day\'s biggest number. A couple come from challenges and from signing in.'],
  ['Do I need an account?', 'No. You can play as a guest and everything is saved on your device. Signing in with Google or Discord keeps your scores, streak and badges on every device.'],
  ['Is Daily Banana free?', 'Yes. It is free to play, with no ads.'],
  ['Does the game use AI?', 'No AI runs in the game. The questions come from a fixed list of everyday items with typical sizes, and the daily schedule is set in advance, so everyone gets the same daily.'],
  ['Who makes Daily Banana?', 'Daily Banana is made by Smidgen Games LLC, an independent game studio that publishes tabletop games. Learn more at playsmidgen.com.'],
  ['How do I report a wrong size or get help?', 'Email contact@dailybanana.io. Sizes are averages, but if one looks far off, we want to know.'],
];

const faqBody = `<h1>Daily Banana FAQ</h1>
<p class="lead">Answers to common questions about Daily Banana, the daily size-guessing game.</p>
<div class="faq">${FAQ.map(([q, a]) => `<details open><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
<a class="cta" href="/">Play today's daily <span aria-hidden="true">→</span></a>`;
writeFileSync(new URL('../faq.html', import.meta.url), page({
  title: 'Daily Banana FAQ · how the daily size-guessing game works',
  description: 'How Daily Banana works: rules, scoring, where sizes come from, daily reset time, quick play, challenges, badges and accounts.',
  path: '/faq', body: faqBody,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
}));

const aboutBody = `<h1>About Daily Banana</h1>
<p class="lead">Ridiculous measurements for everyday items.</p>
<p>Daily Banana is a daily game about size and spatial thinking. Every question lines up one everyday thing against another: how many hot dogs long is a school bus, how many soda cans tall is a refrigerator, how many paper clips long is a green bean. There is no trick and nothing to look up. It's about picturing things you already know and making a good estimate.</p>
<h2>How it works</h2>
<p>Each daily has 6 rounds, 25 seconds each. Your points are your accuracy as a percent, so a close guess scores well even when it isn't exact. Every day mixes small counts and huge ones, practical comparisons and silly ones. A new daily arrives at midnight in your time zone, and past dailies, with their answers and how players did, are posted in the <a href="/archive">archive</a>.</p>
<h2>About the sizes</h2>
<p>All sizes are approximations: typical averages from publicly available data, rounded for play. Real bananas, buses and teaspoons vary. The game asks you to picture an average one.</p>
<h2>Who makes it</h2>
<p>Daily Banana is made by <a href="https://playsmidgen.com/?utm_source=dailybanana&utm_medium=game&utm_campaign=about">Smidgen Games LLC</a>, an independent game studio that publishes tabletop games. Questions or feedback: <a href="mailto:contact@dailybanana.io">contact@dailybanana.io</a>.</p>
<p>Follow along on Instagram: <a href="https://www.instagram.com/dailybanana.io/" rel="me">@dailybanana.io</a></p>
<p><a href="/faq">Read the FAQ</a></p>
<a class="cta" href="/">Play today's daily <span aria-hidden="true">→</span></a>`;
writeFileSync(new URL('../about.html', import.meta.url), page({
  title: 'About Daily Banana · ridiculous measurements for everyday items',
  description: 'Daily Banana is a free daily size-guessing game by Smidgen Games: how many bananas long is a school bus?',
  path: '/about', body: aboutBody,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Daily Banana', url: SITE_URL, applicationCategory: 'GameApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: 'A free daily size-guessing game: how many of one everyday thing would line up to match another.', publisher: { '@type': 'Organization', name: 'Smidgen Games LLC', url: 'https://playsmidgen.com' }, sameAs: ['https://www.instagram.com/dailybanana.io/'] }],
}));
console.log('wrote about.html and faq.html');
