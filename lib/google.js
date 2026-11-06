/* Google Calendar + Gmail, read-only. Refresh tokens are stored encrypted (AES-GCM, key from TOKEN_KEY).
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY (secrets) */
import {newId, randomToken} from './server.js';

export const GOOGLE_SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
};
export const googleReady = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_KEY);

export async function ensureGoogleTables(DB) {
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS google_accounts (family_id TEXT PRIMARY KEY, email TEXT, scopes TEXT NOT NULL, refresh_enc TEXT NOT NULL, connected_at INTEGER NOT NULL)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, family_id TEXT NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`),
  ]);
}

/* ---------- encryption ---------- */
const enc = new TextEncoder();
async function key(env) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(env.TOKEN_KEY));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await key(env), enc.encode(text)));
  return b64(iv) + '.' + b64(ct);
}
export async function unseal(env, sealed) {
  const [iv, ct] = sealed.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(iv)}, await key(env), unb64(ct)));
}

/* ---------- OAuth ---------- */
export async function authUrl(env, DB, origin, familyId, userId, withGmail) {
  await ensureGoogleTables(DB);
  const state = randomToken(24);
  await DB.prepare('INSERT INTO oauth_states (state, family_id, user_id, expires_at) VALUES (?, ?, ?, ?)').bind(state, familyId, userId, Date.now() + 10 * 60e3).run();
  const scope = ['openid', 'email', GOOGLE_SCOPES.calendar, ...(withGmail ? [GOOGLE_SCOPES.gmail] : [])].join(' ');
  const q = new URLSearchParams({client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${origin}/api/google/callback`, response_type: 'code', scope,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state});
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function finishAuth(env, DB, origin, code, state, userId) {
  await ensureGoogleTables(DB);
  const row = await DB.prepare('SELECT family_id, user_id, expires_at FROM oauth_states WHERE state = ?').bind(state || '').first();
  await DB.prepare('DELETE FROM oauth_states WHERE state = ? OR expires_at < ?').bind(state || '', Date.now()).run();
  if (!row || row.expires_at < Date.now() || row.user_id !== userId) throw new Error('state');
  const res = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${origin}/api/google/callback`, grant_type: 'authorization_code'})});
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.refresh_token) throw new Error('token');
  let email = '';
  try { email = JSON.parse(atob(j.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch (e) { /* optional */ }
  const scopes = [(j.scope || '').includes('calendar') ? 'calendar' : '', (j.scope || '').includes('gmail') ? 'gmail' : ''].filter(Boolean).join(',');
  await DB.prepare(`INSERT INTO google_accounts (family_id, email, scopes, refresh_enc, connected_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(family_id) DO UPDATE SET email = excluded.email, scopes = excluded.scopes, refresh_enc = excluded.refresh_enc, connected_at = excluded.connected_at`)
    .bind(row.family_id, email, scopes, await seal(env, j.refresh_token), Date.now()).run();
  return row.family_id;
}

/* A fresh access token for a family, or null if not connected (undefined if Google isn't set up). */
export async function googleAccess(env, DB, familyId) {
  if (!googleReady(env)) return undefined;
  await ensureGoogleTables(DB);
  const acct = await DB.prepare('SELECT email, scopes, refresh_enc FROM google_accounts WHERE family_id = ?').bind(familyId).first();
  if (!acct) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: await unseal(env, acct.refresh_enc), grant_type: 'refresh_token'})});
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (j.error === 'invalid_grant') await DB.prepare('DELETE FROM google_accounts WHERE family_id = ?').bind(familyId).run(); // access was revoked
    throw new Error('Google sign-in expired. Connect Google again.');
  }
  return {token: j.access_token, email: acct.email, scopes: acct.scopes.split(',')};
}

export async function googleStatus(env, DB, familyId) {
  if (!googleReady(env)) return {available: false};
  await ensureGoogleTables(DB);
  const a = await DB.prepare('SELECT email, scopes, connected_at FROM google_accounts WHERE family_id = ?').bind(familyId).first();
  return {available: true, connected: !!a, email: a?.email || '', scopes: a ? a.scopes.split(',') : [], connectedAt: a?.connected_at || null};
}

export async function disconnectGoogle(env, DB, familyId) {
  await ensureGoogleTables(DB);
  const a = await DB.prepare('SELECT refresh_enc FROM google_accounts WHERE family_id = ?').bind(familyId).first();
  if (a) { try { await fetch('https://oauth2.googleapis.com/revoke', {method: 'POST', body: new URLSearchParams({token: await unseal(env, a.refresh_enc)})}); } catch (e) { /* best effort */ } }
  await DB.batch([
    DB.prepare('DELETE FROM google_accounts WHERE family_id = ?').bind(familyId),
    DB.prepare('DELETE FROM events WHERE family_id = ? AND source = \'google\'').bind(familyId),
    DB.prepare('DELETE FROM school_mail WHERE family_id = ?').bind(familyId),
  ]);
}

/* ---------- Calendar ---------- */
export async function googleCalendarEvents(token, fromMs, toMs) {
  const q = new URLSearchParams({timeMin: new Date(fromMs).toISOString(), timeMax: new Date(toMs).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250'});
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, {headers: {Authorization: `Bearer ${token}`}});
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Calendar answered ${res.status}.`);
  return (j.items || []).filter((e) => e.status !== 'cancelled' && e.start).map((e) => {
    const allDay = !!e.start.date;
    const start = allDay ? Date.parse(e.start.date + 'T00:00:00Z') : Date.parse(e.start.dateTime);
    const end = allDay ? Date.parse(e.end.date + 'T00:00:00Z') : Date.parse(e.end?.dateTime || e.start.dateTime) || start + 3600e3;
    return {title: String(e.summary || 'Event').slice(0, 140), location: String(e.location || '').slice(0, 200), start, end, allDay};
  });
}

/* ---------- Gmail: only school-related mail, only subject / sender / snippet ---------- */
export function schoolMailQuery(family) {
  const senders = [...new Set(family.contacts.filter((c) => c.email && ['Teacher', 'Tutor', 'Coach', 'School parents group'].includes(c.role)).map((c) => c.email))].slice(0, 20);
  const words = '(subject:(field trip) OR subject:permission OR subject:"due" OR subject:deadline OR subject:form OR subject:conference OR subject:"early dismissal" OR subject:"no school")';
  return `newer_than:14d -category:promotions ${senders.length ? `(${senders.map((s) => `from:${s}`).join(' OR ')} OR ${words})` : words}`;
}
export async function googleMail(env, DB, familyId, family, token) {
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({q: schoolMailQuery(family), maxResults: '15'})}`, {headers: {Authorization: `Bearer ${token}`}});
  const lj = await list.json().catch(() => ({}));
  if (!list.ok) throw new Error(`Gmail answered ${list.status}.`);
  let n = 0;
  for (const {id} of lj.messages || []) {
    const exists = await DB.prepare('SELECT 1 FROM school_mail WHERE family_id = ? AND gmail_id = ?').bind(familyId, id).first();
    if (exists) continue;
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, {headers: {Authorization: `Bearer ${token}`}});
    const m = await r.json().catch(() => ({}));
    if (!r.ok) continue;
    const h = Object.fromEntries((m.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
    const fm = /^(.*?)\s*<([^>]+)>/.exec(h.from || '');
    const fromAddr = (fm ? fm[2] : h.from || '').toLowerCase().slice(0, 200);
    const contact = family.contacts.find((c) => c.email && c.email.toLowerCase() === fromAddr);
    const text = `${h.subject || ''} ${m.snippet || ''}`;
    const kid = contact?.kidIds?.length === 1 ? contact.kidIds[0] : family.kids.find((k) => new RegExp(`\\b${k.name}\\b`, 'i').test(text))?.id || '';
    await DB.prepare(`INSERT OR IGNORE INTO school_mail (id, family_id, gmail_id, from_addr, from_name, subject, snippet, at, kid_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(newId(), familyId, id, fromAddr, (contact?.name || (fm ? fm[1].replace(/"/g, '') : fromAddr)).slice(0, 80), String(h.subject || '').slice(0, 200),
        decodeEntities(m.snippet || '').slice(0, 300), +m.internalDate || Date.now(), kid).run();
    n++;
  }
  return n;
}
const decodeEntities = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export {newId};
