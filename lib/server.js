/* Server-only helpers: database, sessions, rate limits, email and the family record.
 * Needs (Cloudflare Pages settings):
 *   D1 binding named DB              — families, check-ins, signals, messages, money
 *   RESEND_API_KEY (secret)          — sends sign-in links
 *   EMAIL_FROM (variable, optional)  — e.g. "FamGenie <hello@yourdomain.com>"
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (secrets), TWILIO_FROM (variable) — texting
 */
export const APP_NAME = 'FamGenie';
export const SESSION_COOKIE = 'fg_session';
const DAY = 864e5;

export function jsonRes(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers}});
}
export function htmlRes(html, status = 200) {
  return new Response(html, {status, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
    'X-Robots-Tag': 'noindex'}});
}

/* ---------- crypto ---------- */
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256(s) { return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
export const newId = () => randomToken(12);
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

/* ---------- database ---------- */
let ready = false;
export async function db(env) {
  if (!env.DB) return null;
  if (!ready) {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, verified_at INTEGER)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, ip TEXT)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, window_start INTEGER NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, data_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS family_members (family_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (family_id, user_id))`),
      /* Lookups so texts and kid links find their family: phone → family, token hash → child. */
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS phones (phone TEXT NOT NULL, family_id TEXT NOT NULL, kind TEXT NOT NULL, ref_id TEXT NOT NULL, label TEXT)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS kid_tokens (token_hash TEXT PRIMARY KEY, family_id TEXT NOT NULL, kid_id TEXT NOT NULL, kind TEXT NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS checkins (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, kid_id TEXT NOT NULL, how TEXT NOT NULL, reason TEXT,
        token_hash TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, result TEXT)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS signals (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, kid_id TEXT NOT NULL, at INTEGER NOT NULL, text TEXT NOT NULL,
        source TEXT NOT NULL, confidence TEXT NOT NULL, lat REAL, lon REAL, accuracy INTEGER, place_id TEXT)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, dir TEXT NOT NULL, phone TEXT, thread_id TEXT, body TEXT NOT NULL,
        at INTEGER NOT NULL, status TEXT)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS money (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, kid_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, payee TEXT, contact_id TEXT, category TEXT, method TEXT, note TEXT, source TEXT,
        created_at INTEGER NOT NULL, decided_at INTEGER, paid_at INTEGER)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS phones_phone ON phones(phone)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS phones_family ON phones(family_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS members_user ON family_members(user_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS signals_family ON signals(family_id, at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS messages_family ON messages(family_id, at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS money_family ON money(family_id, created_at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS checkins_kid ON checkins(family_id, kid_id, created_at)`),
    ]);
    ready = true;
  }
  return env.DB;
}

/* Fixed-window rate limit. Returns true when the call is allowed. */
export async function allow(DB, key, max, windowMs) {
  const now = Date.now();
  const row = await DB.prepare('SELECT n, window_start FROM rate_limits WHERE k = ?').bind(key).first();
  if (!row || now - row.window_start > windowMs) {
    await DB.prepare('INSERT INTO rate_limits (k, n, window_start) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, window_start = excluded.window_start').bind(key, now).run();
    return true;
  }
  if (row.n >= max) return false;
  await DB.prepare('UPDATE rate_limits SET n = n + 1 WHERE k = ?').bind(key).run();
  return true;
}

/* ---------- sessions ---------- */
export function readCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
export function sessionCookie(value, maxAgeSec) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
export async function createSession(DB, userId) {
  const token = randomToken(32);
  await DB.prepare('INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, Date.now() + 30 * DAY, Date.now()).run();
  return token;
}
export async function currentUser(request, DB) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !DB) return null;
  return DB.prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?')
    .bind(await sha256(token), Date.now()).first();
}

/* Reject cross-site writes: browsers send Origin on POST/PUT/DELETE. */
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}
export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'unknown';
export const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/* ---------- email ---------- */
export async function sendEmail(env, {to, subject, html, text}) {
  // Local testing only: print the email instead of sending it. Never set DEV_EMAIL_LOG in production.
  if (env.DEV_EMAIL_LOG === '1') { console.log(`[dev email] to=${to} subject=${subject}\n${text}`); return; }
  if (!env.RESEND_API_KEY) throw new Error('Email is not set up (RESEND_API_KEY missing).');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({from: env.EMAIL_FROM || `${APP_NAME} <onboarding@resend.dev>`, to: [to], subject, html, text}),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export function emailLayout(title, bodyHtml) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;color:#15202B">
    <p style="font-weight:800;font-size:20px;margin:0 0 16px">${APP_NAME}</p>
    <h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}
    <p style="color:#586676;font-size:12px;margin-top:24px">You received this because this address was used on ${APP_NAME}. If that wasn’t you, ignore this email.</p></div>`;
}

/* ---------- the parent's family ---------- */
export const EMPTY_FAMILY = () => ({parent: {name: '', relationship: '', phone: ''}, kids: [], contacts: [], places: [], plan: 'free'});

/* Signed-in parent and their family (created on first use). Returns {DB, user, family} or a Response. */
export async function parentContext(request, env, {write = false} = {}) {
  const DB = await db(env);
  if (!DB) return jsonRes({error: 'The database isn’t set up yet.'}, 503);
  if (write && !sameOrigin(request)) return jsonRes({error: 'Bad origin.'}, 403);
  const user = await currentUser(request, DB);
  if (!user) return jsonRes({error: 'Sign in to continue.'}, 401);
  let row = await DB.prepare('SELECT f.id, f.data_json FROM family_members m JOIN families f ON f.id = m.family_id WHERE m.user_id = ? LIMIT 1').bind(user.id).first();
  if (!row) {
    row = {id: newId(), data_json: JSON.stringify(EMPTY_FAMILY())};
    await DB.batch([
      DB.prepare('INSERT INTO families (id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(row.id, row.data_json, Date.now(), Date.now()),
      DB.prepare('INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, ?)').bind(row.id, user.id, 'owner'),
    ]);
  }
  return {DB, user, familyId: row.id, family: JSON.parse(row.data_json)};
}
export async function loadFamily(DB, familyId) {
  const row = await DB.prepare('SELECT data_json FROM families WHERE id = ?').bind(familyId).first();
  return row ? JSON.parse(row.data_json) : null;
}

export async function addSignal(DB, familyId, s) {
  const sig = {id: newId(), at: Date.now(), lat: null, lon: null, accuracy: null, placeId: null, ...s};
  await DB.prepare('INSERT INTO signals (id, family_id, kid_id, at, text, source, confidence, lat, lon, accuracy, place_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(sig.id, familyId, sig.kidId, sig.at, sig.text, sig.source, sig.confidence, sig.lat, sig.lon, sig.accuracy, sig.placeId).run();
  return sig;
}

/* Location readings are kept only as long as they are useful (default 30 days). */
export async function pruneOld(DB, env) {
  const days = +env.RETENTION_DAYS || 30;
  await DB.prepare('DELETE FROM signals WHERE at < ?').bind(Date.now() - days * DAY).run();
  await DB.prepare('DELETE FROM checkins WHERE created_at < ?').bind(Date.now() - days * DAY).run();
  try { await DB.prepare('DELETE FROM school_mail WHERE at < ?').bind(Date.now() - days * DAY).run(); } catch (e) { /* table not created yet */ }
}

export const moneyRow = (r) => ({id: r.id, kidId: r.kid_id, kind: r.kind, status: r.status, amountCents: r.amount_cents, payee: r.payee || '',
  contactId: r.contact_id || '', category: r.category || 'Other', method: r.method || '', note: r.note || '', source: r.source || '',
  createdAt: r.created_at, decidedAt: r.decided_at, paidAt: r.paid_at});

/* What a child calls their parent in texts: "Mom", "Dad", or the parent's first name. */
export function askerLabel(family) {
  const rel = family?.parent?.relationship || '';
  if (['Mom', 'Dad', 'Grandma', 'Grandpa'].includes(rel)) return rel;
  return (family?.parent?.name || '').split(/\s+/)[0] || 'Your parent';
}
