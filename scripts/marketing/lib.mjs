/* Growth kit rules: channels, formats, UTM links and the claim checker. Pure functions, no network. */

/* Image formats in pixels. */
export const FORMATS = {
  square: [1080, 1080],      // Facebook / Instagram feed
  portrait: [1080, 1350],    // Instagram / Facebook feed, tallest allowed
  story: [1080, 1920],       // Stories, Reels and TikTok covers
  landscape: [1200, 627],    // LinkedIn, Reddit, link previews
  gallery: [1270, 760],      // Product Hunt gallery
};

/* What each channel needs. auto: FamGenie/RouteHound can post it after approval (free Meta API). */
export const CHANNELS = {
  facebook: {format: 'portrait', textMax: 2000, auto: true, hashtagsMax: 3},
  instagram: {format: 'portrait', textMax: 2200, auto: true, hashtagsMax: 8, needsImage: true},
  linkedin: {format: 'landscape', textMax: 3000, auto: false, hashtagsMax: 3},
  reddit: {format: 'landscape', textMax: 10000, titleMax: 300, auto: false, hashtagsMax: 0, disclose: true, needsWhere: true},
  tiktok: {format: 'story', textMax: 2200, auto: false, hashtagsMax: 6, needsScript: true},
  group: {format: 'square', textMax: 2000, auto: false, hashtagsMax: 0, disclose: true, needsWhere: true},
  producthunt: {format: 'gallery', textMax: 260, titleMax: 60, auto: false, hashtagsMax: 0},
};

export const LIMITS = {headline: 48, sub: 110, bullet: 44, cta: 22, badge: 26};

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/* Every link gets UTM tags, so you can see which channel brings people. */
export function utm(url, {channel, campaign, content}) {
  const u = new URL(url);
  u.searchParams.set('utm_source', channel);
  u.searchParams.set('utm_medium', CHANNELS[channel]?.auto ? 'social' : 'community');
  u.searchParams.set('utm_campaign', slug(campaign));
  if (content) u.searchParams.set('utm_content', slug(content));
  return u.toString();
}

/* Turn {link} placeholders into tagged links, so a post never goes out with a bare or wrong URL. */
export function fillLinks(text, brand, post, campaign) {
  return String(text || '').replace(/\{link(?::([^}]+))?\}/g, (_, path) =>
    utm(new URL(path || '/', brand.url).toString(), {channel: post.channel, campaign: `${campaign.week}-${campaign.theme}`, content: post.id}));
}

const count = (re, s) => (String(s).match(re) || []).length;

/* Check a campaign against the brand's facts and each platform's rules. Returns {errors, warnings}. */
export function lintCampaign(c, brand, {now = Date.now()} = {}) {
  const errors = [], warnings = [];
  const E = (where, msg) => errors.push(`${where}: ${msg}`);
  const W = (where, msg) => warnings.push(`${where}: ${msg}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.week || '')) E('campaign', 'week must be YYYY-MM-DD (the Monday)');
  if (!c.theme) E('campaign', 'needs a theme');
  const ads = new Map((c.ads || []).map((a) => [a.id, a]));
  const facts = (brand.facts || []).map((f) => f.toLowerCase());
  const forbidden = brand.forbidden || [];
  const competitors = brand.competitors || [];
  const screens = new Set((brand.screens?.shots || []).map((s) => s.name));

  /* Claims: numbers about users, ratings, rankings and testimonials must come from brand.facts. */
  const claims = (where, text) => {
    const t = String(text || '');
    const low = t.toLowerCase();
    for (const m of t.matchAll(/\b\d[\d,.]*\s*(k|m)?\+?\s*(users|families|parents|travelers|travellers|downloads|installs|reviews|customers|people|members|bookings|trips)\b/gi)) {
      if (!facts.some((f) => f.includes(m[0].toLowerCase()))) E(where, `"${m[0]}" is a usage number that isn't in brand.facts. Don't invent proof.`);
    }
    if (/\b\d(\.\d)?\s*(stars?|★)|\brated\b/i.test(t)) E(where, 'star ratings need a real source in brand.facts');
    if (/#1\b|\bnumber one\b|\bbest[- ]rated\b|\bworld'?s best\b|\bguarantee(d)?\b|\bthe best\b/i.test(t)) E(where, 'ranking or guarantee claim ("#1", "the best", "guaranteed")');
    if (/["“][^"”]{12,}["”]\s*[-–—]\s*[A-Z][a-z]+/.test(t)) E(where, 'looks like a testimonial; only real, permitted quotes listed in brand.facts');
    if (/\bas seen (on|in)\b|\bfeatured (on|in)\b|\btrusted by\b/i.test(t) && !facts.some((f) => low.includes(f))) E(where, '"as seen in" / "trusted by" needs a real source in brand.facts');
    for (const f of forbidden) if (low.includes(f.toLowerCase())) E(where, `forbidden phrase "${f}" (brand.forbidden)`);
    for (const n of competitors) if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) W(where, `names a competitor (${n}). Keep comparisons factual and fair, or leave the name out.`);
    const save = t.match(/\bsave[sd]?\s+\$?\d[\d,]*/i);
    if (save && brand.priceClaims !== 'examples-labeled') W(where, `money claim "${save[0]}": say it's an example ("e.g.", "in one search") unless it's a verified fact`);
  };

  for (const a of c.ads || []) {
    const w = `ad ${a.id}`;
    if (!a.id || !/^[a-z0-9-]+$/.test(a.id)) E(w, 'id: lowercase letters, numbers and dashes');
    if (!['phone', 'statement', 'list'].includes(a.layout)) E(w, 'layout must be phone, statement or list');
    for (const k of ['headline', 'sub', 'cta', 'badge']) {
      if (a[k] && a[k].length > LIMITS[k]) E(w, `${k} is ${a[k].length} characters; max ${LIMITS[k]} so it reads at phone size`);
      claims(w, a[k]);
    }
    if (!a.headline) E(w, 'needs a headline');
    for (const b of a.bullets || []) { if (b.length > LIMITS.bullet) E(w, `bullet "${b}" is over ${LIMITS.bullet} characters`); claims(w, b); }
    if (a.layout === 'list' && !(a.bullets || []).length) E(w, 'list layout needs bullets');
    if (a.layout !== 'statement' && a.screen && !screens.has(a.screen)) E(w, `screen "${a.screen}" isn't in brand.screens.shots`);
    if (a.layout !== 'statement' && !a.screen) E(w, 'needs a screen for this layout');
    if (count(/!/g, `${a.headline}${a.sub}`) > 1) W(w, 'more than one "!" reads like spam');
  }

  const ids = new Set();
  const nowWeek = Date.parse(`${c.week}T00:00:00Z`);
  for (const p of c.posts || []) {
    const w = `post ${p.id}`;
    const ch = CHANNELS[p.channel];
    if (!p.id || ids.has(p.id)) E(w, 'needs a unique id');
    ids.add(p.id);
    if (!ch) { E(w, `unknown channel "${p.channel}"`); continue; }
    const text = p.text || '';
    if (!text.trim()) E(w, 'needs text');
    if (text.length > ch.textMax) E(w, `${text.length} characters; ${p.channel} max ${ch.textMax}`);
    if (ch.titleMax && p.title && p.title.length > ch.titleMax) E(w, `title over ${ch.titleMax} characters`);
    if (ch.titleMax && !p.title && ['reddit', 'producthunt'].includes(p.channel)) E(w, 'needs a title');
    const tags = count(/(^|\s)#[A-Za-z]\w+/g, text);
    if (tags > ch.hashtagsMax) (ch.hashtagsMax === 0 ? E : W)(w, `${tags} hashtags; ${p.channel} works best with ${ch.hashtagsMax ? 'up to ' + ch.hashtagsMax : 'none'}`);
    if (/https?:\/\//.test(text)) E(w, 'write {link} (or {link:/path}) instead of a raw URL so it gets tracking tags');
    if (ch.auto && !/\{link/.test(text) && p.channel === 'facebook') W(w, 'no {link}: people can’t click through');
    if (p.channel === 'instagram' && /\{link/.test(text)) W(w, 'Instagram captions don’t make links clickable; say "link in bio" instead');
    if (ch.needsImage && !p.ad) E(w, `${p.channel} needs an image (ad)`);
    if (p.ad && !ads.has(p.ad)) E(w, `ad "${p.ad}" isn't in this campaign`);
    if (ch.disclose && !/\b(I|we) (made|built|make|run|created)\b|\bmy (app|side project)\b|\bfull disclosure\b|\bdisclosure\b/i.test(text)) E(w, `${p.channel} posts must say you made it (community rules and FTC disclosure)`);
    if (ch.needsWhere && !p.where) E(w, `say where it goes (subreddit or group name) in "where"`);
    if (ch.needsScript && !p.script) E(w, 'TikTok needs a short shot-by-shot script');
    if (!p.when || Number.isNaN(Date.parse(p.when))) E(w, 'needs "when" as an ISO date-time');
    else {
      const t = Date.parse(p.when);
      if (ch.auto && t < now) W(w, 'scheduled in the past; it will post at the next run after approval');
      if (!Number.isNaN(nowWeek) && (t < nowWeek - 864e5 || t > nowWeek + 8 * 864e5)) W(w, 'not in this campaign’s week');
    }
    claims(w, text);
    if (p.title) claims(w, p.title);
  }
  const auto = (c.posts || []).filter((p) => CHANNELS[p.channel]?.auto);
  const perDay = {};
  for (const p of auto) { const d = String(p.when).slice(0, 10) + p.channel; perDay[d] = (perDay[d] || 0) + 1; }
  for (const [d, n] of Object.entries(perDay)) if (n > 2) W('schedule', `${n} ${d.slice(10)} posts on ${d.slice(0, 10)}; 1–2 a day per channel keeps reach up`);
  return {errors, warnings};
}

/* What to render: each ad in the formats its posts need, plus any it asks for. */
export function neededFormats(c) {
  const need = new Map((c.ads || []).map((a) => [a.id, new Set(a.formats || [])]));
  for (const p of c.posts || []) if (p.ad && need.has(p.ad) && CHANNELS[p.channel]) need.get(p.ad).add(p.format || CHANNELS[p.channel].format);
  for (const [, s] of need) if (!s.size) s.add('square');
  return need;
}

/* The queue entries a scheduler or a person works from. */
export function buildQueue(c, brand) {
  return (c.posts || []).map((p) => {
    const ch = CHANNELS[p.channel];
    const fmt = p.format || ch.format;
    const image = p.ad ? `ads/${p.ad}-${fmt}.jpg` : null;
    return {
      id: p.id, channel: p.channel, when: p.when, auto: !!ch.auto && !p.manual, skip: !!p.skip,
      title: p.title ? fillLinks(p.title, brand, p, c) : undefined, where: p.where, script: p.script,
      text: fillLinks(p.text, brand, p, c), image,
      publicImage: image && ch.auto ? `/m/${c.week}/${p.ad}-${fmt}.jpg` : null,
    };
  });
}
