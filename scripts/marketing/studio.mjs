#!/usr/bin/env node
/* Ad studio: turns a campaign (marketing/campaigns/<week>.json) into a review queue of finished ads and posts.
 *
 *   node scripts/marketing/studio.mjs screens            capture fresh app screenshots (marketing/screens/)
 *   node scripts/marketing/studio.mjs new [YYYY-MM-DD]   start a campaign file for a week (Monday)
 *   node scripts/marketing/studio.mjs lint <campaign>    check copy, claims and platform rules
 *   node scripts/marketing/studio.mjs build <campaign>   lint, render images and videos, write marketing/queue/<week>/
 *
 * Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium) and, for videos, ffmpeg.
 * Nothing here posts anything: posting happens only from approved (merged) queues. */
import {readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, readdirSync, renameSync} from 'node:fs';
import {join, resolve, dirname, relative} from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {execSync, execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {FORMATS, CHANNELS, lintCampaign, neededFormats, buildQueue} from './lib.mjs';
import {adHtml} from './template.mjs';

const ROOT = process.cwd();
const M = join(ROOT, 'marketing');
const brand = JSON.parse(readFileSync(join(M, 'brand.json'), 'utf8'));
const [cmd, arg] = process.argv.slice(2);

function playwright() {
  const req = createRequire(join(ROOT, 'package.json'));
  try { return req('playwright'); } catch (e) {
    console.error('Playwright is needed: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
}
const launch = async () => {
  const {chromium} = playwright();
  const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
  try { return await chromium.launch(); } catch (e) { return chromium.launch(exe ? {executablePath: exe, args: ['--no-sandbox']} : {}); }
};
const loadCampaign = (p) => {
  if (!p) { console.error('Give a campaign file, e.g. marketing/campaigns/2026-11-09.json'); process.exit(2); }
  return JSON.parse(readFileSync(resolve(p), 'utf8'));
};
const logo = () => readFileSync(join(M, brand.logo), 'utf8');

/* Serve the app locally for screenshots and recordings: a folder, or one HTML file wrapped as a page. */
async function serve() {
  const s = brand.screens.serve;
  if (s.build) execSync(s.build, {stdio: 'inherit', cwd: ROOT});
  const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2'};
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (s.file) {
      if (path !== '/') { res.writeHead(404, {'Content-Type': 'application/json'}); return res.end('{"error":"demo"}'); }
      const body = readFileSync(join(ROOT, s.file), 'utf8');
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      return res.end(s.wrap ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${body}</body></html>` : body);
    }
    let file = join(ROOT, s.dir, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(join(ROOT, s.dir)) || !existsSync(file)) {
      res.writeHead(404, {'Content-Type': 'application/json'}); return res.end('{"error":"offline"}');
    }
    res.writeHead(200, {'Content-Type': types[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream'});
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {base: `http://127.0.0.1:${server.address().port}`, close: () => server.close()};
}

async function runSteps(page, steps = []) {
  for (const st of steps) {
    if (st.click) await page.locator(st.click).first().click();
    if (st.fill) await page.locator(st.fill[0]).first().fill(st.fill[1]);
    if (st.press) await page.keyboard.press(st.press);
    if (st.scroll) await page.locator(st.scroll).first().evaluate((el) => el.scrollIntoView({block: 'start'}));
    if (st.scrollBy) await page.mouse.wheel(0, st.scrollBy);
    if (st.wait) await page.waitForTimeout(st.wait);
  }
}

async function screens() {
  const srv = await serve();
  const browser = await launch();
  mkdirSync(join(M, 'screens'), {recursive: true});
  try {
    for (const shot of brand.screens.shots) {
      const ctx = await browser.newContext({viewport: {width: shot.width || 390, height: shot.height || 844}, deviceScaleFactor: 3,
        colorScheme: shot.dark ? 'dark' : 'light', timezoneId: brand.timezone || 'America/Chicago'});
      const page = await ctx.newPage();
      await page.goto(srv.base + (shot.path || '/'));
      await page.waitForTimeout(shot.settle || 1200);
      await runSteps(page, shot.steps);
      await page.waitForTimeout(400);
      await page.screenshot({path: join(M, 'screens', `${shot.name}.jpg`), type: 'jpeg', quality: 90});
      await ctx.close();
      console.log(`screen ${shot.name}`);
    }
  } finally { await browser.close(); srv.close(); }
}

function lint(c, {quiet} = {}) {
  const {errors, warnings} = lintCampaign(c, brand);
  for (const w of warnings) console.log(`warning  ${w}`);
  for (const e of errors) console.log(`ERROR    ${e}`);
  if (!quiet) console.log(`${errors.length} errors, ${warnings.length} warnings`);
  return errors.length === 0;
}

async function renderAds(c, out) {
  const need = neededFormats(c);
  const build = join(M, '.build');
  mkdirSync(build, {recursive: true});
  mkdirSync(join(out, 'ads'), {recursive: true});
  const browser = await launch();
  const files = [];
  try {
    for (const ad of c.ads) {
      for (const fmt of need.get(ad.id)) {
        const [W, H] = FORMATS[fmt];
        const html = adHtml({ad, format: fmt, brand, fontsDir: pathToFileURL(join(M, 'fonts')).href,
          screenPath: ad.screen ? pathToFileURL(join(M, 'screens', `${ad.screen}.jpg`)).href : '', logoSvg: logo()});
        const f = join(build, `${ad.id}-${fmt}.html`);
        writeFileSync(f, html);
        const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
        await page.goto(pathToFileURL(f).href);
        await page.evaluate(() => document.fonts.ready);
        const img = join(out, 'ads', `${ad.id}-${fmt}.jpg`);
        await page.screenshot({path: img, type: 'jpeg', quality: 90});
        await page.close();
        files.push(img);
        console.log(`ad ${ad.id} ${fmt}`);
      }
    }
  } finally { await browser.close(); rmSync(build, {recursive: true, force: true}); }
  return files;
}

/* Reels / TikTok: intro card, a real walkthrough of the app, end card. 1080x1920 MP4. */
async function renderVideos(c, out) {
  if (!(c.videos || []).length) return [];
  try { execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); } catch (e) { console.log('ffmpeg not found: skipping videos'); return []; }
  const srv = await serve();
  const browser = await launch();
  mkdirSync(join(out, 'video'), {recursive: true});
  const made = [];
  try {
    for (const v of c.videos) {
      const tmp = join(M, '.build', 'rec-' + v.id);
      mkdirSync(tmp, {recursive: true});
      const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, timezoneId: brand.timezone || 'America/Chicago',
        recordVideo: {dir: tmp, size: {width: 390, height: 844}}});
      const page = await ctx.newPage();
      await page.goto(srv.base + (v.path || '/'));
      await page.waitForTimeout(1500);
      await runSteps(page, v.steps);
      await page.waitForTimeout(800);
      await ctx.close();
      const rec = join(tmp, readdirSync(tmp).find((f) => f.endsWith('.webm')));
      const intro = join(out, 'ads', `${v.intro}-story.jpg`), outro = join(out, 'ads', `${v.outro || v.intro}-story.jpg`);
      if (!existsSync(intro) || !existsSync(outro)) { console.log(`video ${v.id}: render the story format of "${v.intro}" first (add "story" to its formats)`); continue; }
      const mp4 = join(out, 'video', `${v.id}.mp4`);
      const bg = (brand.colors.dark.bgSolid || '#1E0E40').replace('#', '0x');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
        '-loop', '1', '-t', '2.5', '-i', intro, '-i', rec, '-loop', '1', '-t', '2.5', '-i', outro,
        '-f', 'lavfi', '-t', '60', '-i', 'anullsrc=r=44100:cl=stereo',
        '-filter_complex',
        `[0:v]scale=1080:1920,setsar=1,fps=30,format=yuv420p[a];` +
        `[1:v]scale=-2:1760:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${bg},setsar=1,fps=30,format=yuv420p[b];` +
        `[2:v]scale=1080:1920,setsar=1,fps=30,format=yuv420p[c];[a][b][c]concat=n=3:v=1:a=0[v]`,
        '-map', '[v]', '-map', '3:a', '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', mp4]);
      rmSync(tmp, {recursive: true, force: true});
      made.push(mp4);
      console.log(`video ${v.id}`);
    }
  } finally { await browser.close(); srv.close(); }
  return made;
}

const HOW = {
  facebook: 'Posts automatically at the time shown after this is approved (merged).',
  instagram: 'Posts automatically at the time shown after this is approved (merged).',
  linkedin: 'Post by hand from your profile or the company page: paste the text, attach the image.',
  reddit: 'Post by hand. Read the subreddit rules first, post as yourself, reply to every comment, and don’t post the same thing to several subreddits.',
  tiktok: 'Post by hand from the TikTok app: use the video (or record the script), paste the caption.',
  group: 'Ask the group admin first, then post as yourself. Never in groups that ban promotion.',
  producthunt: 'Launch once, by hand, at 12:01am Pacific. Use the gallery image and the first comment.',
};

function writeQueue(c, out, videos) {
  const q = buildQueue(c, brand);
  writeFileSync(join(out, 'posts.json'), JSON.stringify({week: c.week, theme: c.theme, app: brand.name, url: brand.url, posts: q}, null, 2) + '\n');
  const tz = brand.timezone || 'America/Chicago';
  const when = (iso) => new Date(iso).toLocaleString('en-US', {timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
  const md = [`# ${brand.name} · week of ${c.week} · ${c.theme}`, '',
    `**Approve by merging this pull request.** Facebook and Instagram posts then go out at their times. Everything else is a ready-to-paste draft.`,
    `To change something, edit \`marketing/campaigns/${c.week}.json\` and rebuild, or set \`"skip": true\` on a post. Delete a post to drop it.`, '',
    c.goal ? `**Goal:** ${c.goal}` : '', c.why ? `**Why this angle:** ${c.why}` : '', ''];
  for (const p of q) {
    md.push(`## ${p.channel} · ${when(p.when)}${p.auto ? ' · auto after approval' : ' · post by hand'}${p.skip ? ' · SKIPPED' : ''}`, '');
    if (p.where) md.push(`**Where:** ${p.where}`, '');
    if (p.title) md.push(`**Title:** ${p.title}`, '');
    if (p.image) md.push(`![${p.id}](${p.image})`, '');
    md.push('```text', p.text, '```', '');
    if (p.script) md.push('**Script:**', '', ...p.script.map((s, i) => `${i + 1}. ${s}`), '');
    md.push(`_${HOW[p.channel]}_`, '');
  }
  if (videos.length) {
    md.push('## Videos (Reels, TikTok, Shorts)', '');
    for (const v of videos) md.push(`- [${relative(out, v)}](${relative(out, v)})`);
    md.push('');
  }
  writeFileSync(join(out, 'README.md'), md.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'));
  /* Images for automatic posts must be on the public site (Instagram fetches them by URL, JPEG only). */
  const pub = join(ROOT, brand.publicDir || 'public', 'm', c.week);
  for (const p of q) {
    if (!p.publicImage || p.skip) continue;
    mkdirSync(pub, {recursive: true});
    copyFileSync(join(out, p.image), join(ROOT, brand.publicDir || 'public', p.publicImage));
  }
  return q;
}

async function build(c) {
  if (!lint(c)) { console.log('Fix the errors above, then build again.'); process.exit(1); }
  const shots = (brand.screens?.shots || []).map((s) => join(M, 'screens', `${s.name}.jpg`));
  if (shots.some((s) => !existsSync(s))) await screens();
  const out = join(M, 'queue', c.week);
  rmSync(join(out, 'ads'), {recursive: true, force: true});
  mkdirSync(out, {recursive: true});
  writeFileSync(join(out, 'campaign.json'), JSON.stringify(c, null, 2) + '\n');
  await renderAds(c, out);
  const videos = await renderVideos(c, out);
  const q = writeQueue(c, out, videos);
  console.log(`\nQueue ready: ${relative(ROOT, out)}/README.md · ${q.length} posts (${q.filter((p) => p.auto).length} automatic after approval)`);
}

function scaffold(week) {
  const d = week ? new Date(week + 'T12:00:00Z') : new Date();
  if (!week) d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  const w = d.toISOString().slice(0, 10);
  const f = join(M, 'campaigns', `${w}.json`);
  if (existsSync(f)) { console.log(`${relative(ROOT, f)} already exists`); return; }
  mkdirSync(dirname(f), {recursive: true});
  writeFileSync(f, JSON.stringify({week: w, theme: '', goal: '', why: '', ads: [], posts: [], videos: []}, null, 2) + '\n');
  console.log(`Started ${relative(ROOT, f)}`);
}

if (cmd === 'screens') await screens();
else if (cmd === 'lint') process.exit(lint(loadCampaign(arg)) ? 0 : 1);
else if (cmd === 'build') await build(loadCampaign(arg));
else if (cmd === 'new') scaffold(arg);
else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 9).join('\n').replace(/^ \* ?/gm, ''));
