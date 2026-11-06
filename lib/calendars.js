/* Calendar sync: school/activity iCal links and Google Calendar → the events table. */
import {newId} from './server.js';
import {parseIcs} from './ics.js';
import {expandSchedule, DEFAULT_TZ} from '../public/assets/shared.js';
import {googleAccess, googleCalendarEvents, googleMail} from './google.js';

const WINDOW_BACK = 864e5, WINDOW_AHEAD = 21 * 864e5;

export async function ensureCalendarTables(DB) {
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, source TEXT NOT NULL, kid_ids TEXT NOT NULL,
      title TEXT NOT NULL, location TEXT, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, all_day INTEGER NOT NULL DEFAULT 0, place_id TEXT)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS events_family ON events(family_id, start_at)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS calendar_status (family_id TEXT NOT NULL, source TEXT NOT NULL, synced_at INTEGER NOT NULL, ok INTEGER NOT NULL,
      message TEXT, count INTEGER, PRIMARY KEY (family_id, source))`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS school_mail (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, gmail_id TEXT NOT NULL, from_addr TEXT, from_name TEXT,
      subject TEXT, snippet TEXT, at INTEGER NOT NULL, kid_id TEXT, task TEXT, due TEXT, done INTEGER NOT NULL DEFAULT 0, UNIQUE(family_id, gmail_id))`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS alerts_sent (family_id TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (family_id, key))`),
  ]);
}

/* Match an event to a saved place by its location text or title, else the calendar's default place. */
function placeFor(family, ev, fallback) {
  const hay = `${ev.location} ${ev.title}`.toLowerCase();
  const hit = family.places.filter((p) => p.name.length >= 3 && hay.includes(p.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  return hit?.id || fallback || '';
}
/* Which kids an event is for: the calendar's kids, or kids named in the title (for a whole-family calendar). */
function kidsFor(family, ev, calKids) {
  const named = family.kids.filter((k) => new RegExp(`\\b${k.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(ev.title)).map((k) => k.id);
  return named.length ? named : calKids;
}

async function replaceEvents(DB, familyId, source, rows) {
  const stmts = [DB.prepare('DELETE FROM events WHERE family_id = ? AND source = ?').bind(familyId, source)];
  for (const e of rows) {
    stmts.push(DB.prepare('INSERT INTO events (id, family_id, source, kid_ids, title, location, start_at, end_at, all_day, place_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(newId(), familyId, source, JSON.stringify(e.kidIds), e.title, e.location || '', e.start, e.end, e.allDay ? 1 : 0, e.placeId || ''));
  }
  for (let i = 0; i < stmts.length; i += 80) await DB.batch(stmts.slice(i, i + 80));
}
async function setStatus(DB, familyId, source, ok, message, count) {
  await DB.prepare(`INSERT INTO calendar_status (family_id, source, synced_at, ok, message, count) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(family_id, source) DO UPDATE SET synced_at = excluded.synced_at, ok = excluded.ok, message = excluded.message, count = excluded.count`)
    .bind(familyId, source, Date.now(), ok ? 1 : 0, message || '', count || 0).run();
}

export function calendarUrl(raw, env) {
  let u;
  try { u = new URL(String(raw || '').trim().replace(/^webcal:\/\//i, 'https://')); } catch (e) { return null; }
  if (u.protocol === 'http:' && env.DEV_ALLOW_HTTP_CALENDARS === '1') return u.toString();
  return u.protocol === 'https:' ? u.toString() : null;
}

export async function fetchIcs(url) {
  const res = await fetch(url, {headers: {'User-Agent': 'FamGenie calendar sync', Accept: 'text/calendar, text/plain, */*'}, redirect: 'follow', signal: AbortSignal.timeout(15000)});
  if (!res.ok) throw new Error(`The calendar link answered ${res.status}.`);
  const text = await res.text();
  if (text.length > 4_000_000) throw new Error('That calendar is too big to read.');
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link isn’t a calendar (.ics) feed.');
  return text;
}

/* Refresh every calendar of one family. Returns a status per source. */
export async function syncFamilyCalendars(env, DB, familyId, family) {
  await ensureCalendarTables(DB);
  const tz = family.timezone || DEFAULT_TZ;
  const fromMs = Date.now() - WINDOW_BACK, toMs = Date.now() + WINDOW_AHEAD;
  const results = {};
  const keep = new Set((family.calendars || []).map((c) => 'ics:' + c.id));
  const old = (await DB.prepare('SELECT DISTINCT source FROM events WHERE family_id = ? AND source LIKE \'ics:%\'').bind(familyId).all()).results;
  for (const {source} of old) if (!keep.has(source)) await replaceEvents(DB, familyId, source, []);
  for (const cal of family.calendars || []) {
    const source = 'ics:' + cal.id;
    try {
      const url = calendarUrl(cal.url, env);
      if (!url) throw new Error('Use an https:// or webcal:// calendar link.');
      const evs = parseIcs(await fetchIcs(url), {fromMs, toMs, tz}).map((e) => ({...e, kidIds: kidsFor(family, e, cal.kidIds), placeId: placeFor(family, e, cal.placeId)}));
      await replaceEvents(DB, familyId, source, evs);
      await setStatus(DB, familyId, source, true, '', evs.length);
      results[source] = {ok: true, count: evs.length};
    } catch (e) {
      await setStatus(DB, familyId, source, false, e.message, 0);
      results[source] = {ok: false, message: e.message};
    }
  }
  const g = await googleAccess(env, DB, familyId);
  if (g) {
    try {
      const evs = (await googleCalendarEvents(g.token, fromMs, toMs)).map((e) => ({...e, kidIds: kidsFor(family, e, []), placeId: placeFor(family, e, '')}));
      await replaceEvents(DB, familyId, 'google', evs);
      await setStatus(DB, familyId, 'google', true, '', evs.length);
      results.google = {ok: true, count: evs.length};
    } catch (e) { await setStatus(DB, familyId, 'google', false, e.message, 0); results.google = {ok: false, message: e.message}; }
    if (g.scopes.includes('gmail')) {
      try {
        const n = await googleMail(env, DB, familyId, family, g.token);
        await setStatus(DB, familyId, 'gmail', true, '', n);
        results.gmail = {ok: true, count: n};
      } catch (e) { await setStatus(DB, familyId, 'gmail', false, e.message, 0); results.gmail = {ok: false, message: e.message}; }
    }
  } else if (g === null) {
    await DB.prepare('DELETE FROM events WHERE family_id = ? AND source = \'google\'').bind(familyId).run();
  }
  return results;
}

/* Stored events plus weekly activities, for a window. */
export async function familyEvents(DB, familyId, family, fromMs, toMs) {
  await ensureCalendarTables(DB);
  const rows = (await DB.prepare('SELECT * FROM events WHERE family_id = ? AND end_at > ? AND start_at < ? ORDER BY start_at LIMIT 2000').bind(familyId, fromMs, toMs).all()).results;
  const stored = rows.map((r) => ({id: r.id, kidIds: JSON.parse(r.kid_ids || '[]'), title: r.title, location: r.location || '', start: r.start_at, end: r.end_at, allDay: !!r.all_day, placeId: r.place_id || '', source: r.source}));
  return [...stored, ...expandSchedule(family.schedule || [], fromMs, toMs, family.timezone || DEFAULT_TZ)].sort((a, b) => a.start - b.start);
}
