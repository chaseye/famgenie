#!/usr/bin/env node
/* Posts APPROVED Facebook and Instagram items. Runs from GitHub Actions on main only, so only merged (approved) queues post.
 *   META_PAGE_ID, META_PAGE_TOKEN (Page access token), META_IG_USER_ID (Instagram business account), META_API_VERSION (optional)
 * Without the secrets it prints what it would post and changes nothing (dry run).
 * marketing/posted.json records what went out, so nothing posts twice. */
import {readFileSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = process.cwd();
const M = join(ROOT, 'marketing');
const brand = JSON.parse(readFileSync(join(M, 'brand.json'), 'utf8'));
const env = process.env;
const V = env.META_API_VERSION || 'v26.0';
const DRY = !(env.META_PAGE_TOKEN && env.META_PAGE_ID) || env.DRY_RUN === '1';
const GRACE = 36 * 3600e3; // a post more than 36 hours overdue is skipped, not posted late
const postedFile = join(M, 'posted.json');

export function duePosts(queues, posted, now, channelsReady) {
  const out = [];
  for (const q of queues) for (const p of q.posts) {
    if (!p.auto || p.skip || posted[q.week + ':' + p.id + ':' + p.channel] || !channelsReady.includes(p.channel)) continue;
    const t = Date.parse(p.when);
    if (Number.isNaN(t) || t > now || now - t > GRACE) continue;
    out.push({...p, week: q.week});
  }
  return out.sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
}

async function graph(path, params) {
  const res = await fetch(`https://graph.facebook.com/${V}/${path}`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...params, access_token: env.META_PAGE_TOKEN})});
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`${path}: ${j.error?.message || res.status}`);
  return j;
}
async function waitForImage(url) {
  for (let i = 0; i < 12; i++) {
    try { const r = await fetch(url, {method: 'HEAD'}); if (r.ok && (r.headers.get('content-type') || '').includes('jpeg')) return true; } catch (e) { /* not yet */ }
    await new Promise((r) => setTimeout(r, 10000));
  }
  return false;
}

async function main() {
  const qdir = join(M, 'queue');
  const queues = existsSync(qdir) ? readdirSync(qdir).filter((w) => existsSync(join(qdir, w, 'posts.json')))
    .map((w) => JSON.parse(readFileSync(join(qdir, w, 'posts.json'), 'utf8'))) : [];
  const posted = existsSync(postedFile) ? JSON.parse(readFileSync(postedFile, 'utf8')) : {};
  const ready = ['facebook', ...(env.META_IG_USER_ID ? ['instagram'] : [])];
  const due = duePosts(queues, posted, Date.now(), DRY ? ['facebook', 'instagram'] : ready);
  if (!due.length) { console.log('Nothing due.'); return; }
  let changed = false;
  for (const p of due) {
    const img = p.publicImage ? new URL(p.publicImage, brand.url).toString() : null;
    if (DRY) { console.log(`[dry run] ${p.channel} ${p.id}${img ? ' ' + img : ''}\n${p.text}\n`); continue; }
    try {
      if (img && !(await waitForImage(img))) throw new Error(`image isn't live yet at ${img}`);
      let id;
      if (p.channel === 'facebook') {
        id = img ? (await graph(`${env.META_PAGE_ID}/photos`, {url: img, message: p.text})).post_id
          : (await graph(`${env.META_PAGE_ID}/feed`, {message: p.text})).id;
      } else if (p.channel === 'instagram') {
        const c = await graph(`${env.META_IG_USER_ID}/media`, {image_url: img, caption: p.text});
        await new Promise((r) => setTimeout(r, 5000));
        id = (await graph(`${env.META_IG_USER_ID}/media_publish`, {creation_id: c.id})).id;
      }
      posted[p.week + ':' + p.id + ':' + p.channel] = {at: new Date().toISOString(), week: p.week, remoteId: id};
      changed = true;
      console.log(`posted ${p.channel} ${p.id} → ${id}`);
    } catch (e) {
      console.log(`FAILED ${p.channel} ${p.id}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  if (changed) writeFileSync(postedFile, JSON.stringify(posted, null, 2) + '\n');
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
