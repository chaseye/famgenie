/* Privacy guard: fails the build if children's data could leak to an ad network, a tracker, a partner or the AI.
 *   node scripts/privacy-guard.mjs        → prints each check, exits 1 on any failure
 * Runs in CI on every push and pull request (via npm test) and weekly (.github/workflows/privacy-guard.yml).
 * Add a check here whenever a new way to leak data becomes possible. Never weaken one to get a green build. */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p];
});

/* Ad networks, trackers and analytics that must never load in the app or on a child's page. */
export const TRACKERS = [
  'googletagmanager.com', 'google-analytics.com', 'googlesyndication.com', 'doubleclick.net', 'adservice.google',
  'connect.facebook.net', 'facebook.com/tr', 'analytics.tiktok.com', 'snap.licdn.com', 'static.ads-twitter.com',
  'hotjar.com', 'segment.com', 'cdn.segment', 'mixpanel.com', 'amplitude.com', 'fullstory.com', 'clarity.ms',
  'adsbygoogle', 'fbq(', 'gtag(', 'tr?id=',
];

/* Hosts of affiliate networks and partners: allowed only in the /go redirect, never on kid pages or in texts to kids. */
export const AFFILIATE_HOSTS = ['amazon.com', 'amzn.to', 'awin1.com', 'awin.com', 'flexoffers.com', 'cj.com', 'anrdoezrs.net', 'dpbolvw.net',
  'jdoqocy.com', 'tkqlhce.com', 'kqzyfj.com', 'impact.com', 'sjv.io', 'greenlight.com', 'kiwico.com', 'varsitytutors.com',
  'outschool.com', 'care.com', 'gabb.com', 'getlasso.co'];

/* Code that builds what a child sees or receives. */
export const KID_FILES = ['lib/pages.js', 'lib/kid.js', 'functions/c/[token].js', 'functions/k/[token].js', 'functions/hooks/sms.js'];

export function findTrackers(text) {
  const t = text.toLowerCase();
  return TRACKERS.filter((h) => t.includes(h));
}
export function findAffiliateHosts(text) {
  const t = text.toLowerCase();
  return AFFILIATE_HOSTS.filter((h) => new RegExp(`[/.@"'\\s]${h.replace(/[.()/]/g, '\\$&')}`).test(t));
}
/* External <script src> or stylesheet hosts other than the app itself. */
export function externalScripts(html) {
  return [...html.matchAll(/<script[^>]+src=["'](https?:)?\/\/([^/"']+)/gi)].map((m) => m[2]);
}

export function runChecks() {
  const results = [];
  const check = (name, problems) => results.push({name, ok: problems.length === 0, problems});

  const publicFiles = walk('public').filter((f) => /\.(html|js|css)$/.test(f));
  check('No ad networks or trackers in the app (public/)', publicFiles.flatMap((f) => findTrackers(read(f)).map((h) => `${f}: ${h}`)));
  check('No third-party scripts in the app (public/*.html)', publicFiles.filter((f) => f.endsWith('.html')).flatMap((f) => externalScripts(read(f)).map((h) => `${f}: script from ${h}`)));
  check('No trackers or partner links in anything a child sees or receives', KID_FILES.flatMap((f) => [...findTrackers(read(f)), ...findAffiliateHosts(read(f))].map((h) => `${f}: ${h}`)));

  const server = read('lib/server.js');
  const csp = server.match(/'Content-Security-Policy':\s*"([^"]+)"/)?.[1] || '';
  check('Kid pages keep a locked-down Content-Security-Policy', [
    !csp.includes("default-src 'self'") && "CSP lost default-src 'self'",
    !csp.includes("frame-ancestors 'none'") && "CSP lost frame-ancestors 'none'",
    /https?:\/\//.test(csp) && 'CSP allows an outside host',
    !server.includes("'Referrer-Policy': 'no-referrer'") && 'kid pages lost Referrer-Policy: no-referrer',
  ].filter(Boolean));

  const family = read('lib/family.js');
  check('Kid link tokens are stored hashed, never in plain text', [
    !/kid_tokens \(token_hash/.test(family) && 'kid_tokens no longer stores token_hash',
    /INSERT INTO kid_tokens \(token[,\s]/.test(family) && 'a raw token is inserted into kid_tokens',
  ].filter(Boolean));

  const cron = read('lib/cron.js');
  check('Old locations are deleted on a schedule, not only when a parent opens the app', [
    !/pruneOld\(/.test(cron) && 'lib/cron.js does not call pruneOld',
    !/\+env\.RETENTION_DAYS \|\| 30/.test(server) && 'RETENTION_DAYS default is no longer 30',
  ].filter(Boolean));

  const registry = JSON.parse(read('marketing/affiliates.json'));
  check('Affiliate placements are parent-facing and labeled', registry.programs.filter((p) => p.status !== 'excluded')
    .filter((p) => /\/c\/|\/k\/|kid page|child's page|text to (a )?child/i.test(p.placement)).map((p) => `${p.id}: ${p.placement}`));
  return results;
}

/* The AI must never see phone numbers or locations, whatever it is handed. */
export async function aiFactsLeak() {
  const {factsFor} = await import('../lib/ai.js');
  const phone = '+15555550142', lat = 41.881832, lon = -87.623177;
  const facts = factsFor({
    family: {timezone: 'America/Chicago', parent: {name: 'Dana Lee', phone}, kids: [{id: 'k1', name: 'Mia', phone, grade: '5'}], places: [{id: 'p1', name: 'School', lat, lon}]},
    items: [{text: 'Mia checked in at School'}], events: [], mail: [],
    messages: [{dir: 'in', phone, who: 'Coach', body: 'Practice moved', at: Date.now()}], now: Date.now(),
  });
  const out = JSON.stringify(facts);
  return [out.includes('5555550142') && 'a phone number reached the AI facts', (out.includes('41.88') || out.includes('87.62')) && 'coordinates reached the AI facts'].filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = runChecks();
  results.push({name: 'The AI never sees phone numbers or locations', problems: await aiFactsLeak()});
  let failed = 0;
  for (const r of results) {
    const ok = r.problems.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.name}${ok ? '' : '\n     ' + r.problems.join('\n     ')}`);
  }
  if (failed) { console.log(`\nprivacy guard: ${failed} check(s) failed`); process.exit(1); }
  console.log('\nprivacy guard: all checks passed');
}
