/* A small iCalendar (.ics) reader for school and activity calendars.
 * Handles all-day and timed events, UTC / TZID / floating times, DURATION, and repeating events
 * (DAILY and WEEKLY with INTERVAL, BYDAY, UNTIL, COUNT, EXDATE, and moved instances). */
import {zonedToUtc, validTz, DEFAULT_TZ} from '../public/assets/shared.js';

const unescape = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
const DAYS = {SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6};

function parseLines(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out = [];
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const [name, ...params] = line.slice(0, i).split(';');
    const p = {};
    for (const kv of params) { const j = kv.indexOf('='); if (j > 0) p[kv.slice(0, j).toUpperCase()] = kv.slice(j + 1).replace(/^"|"$/g, ''); }
    out.push({name: name.toUpperCase(), params: p, value: line.slice(i + 1)});
  }
  return out;
}

/* → {ms, allDay, date:{y,m,d}, time:[h,mi]|null, tz} */
export function parseIcsDate(value, params, fallbackTz) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec((value || '').trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (!m[4] || params.VALUE === 'DATE') return {allDay: true, date: {y, m: mo, d}, time: null, tz: fallbackTz, ms: zonedToUtc(y, mo, d, 0, 0, fallbackTz)};
  const time = [+m[4], +m[5]];
  if (m[7]) return {allDay: false, date: {y, m: mo, d}, time, tz: 'UTC', ms: Date.UTC(y, mo - 1, d, time[0], time[1], +(m[6] || 0))};
  const tz = params.TZID && validTz(params.TZID) ? params.TZID : fallbackTz;
  return {allDay: false, date: {y, m: mo, d}, time, tz, ms: zonedToUtc(y, mo, d, time[0], time[1], tz)};
}

function durationMs(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
  if (!m) return null;
  return ((+m[2] || 0) * 7 * 864e5 + (+m[3] || 0) * 864e5 + (+m[4] || 0) * 3600e3 + (+m[5] || 0) * 60e3 + (+m[6] || 0) * 1e3) * (m[1] === '-' ? -1 : 1);
}

/* Each occurrence keeps its wall-clock time in its own zone, so a 4:30pm practice stays 4:30pm across DST changes. */
function occurrences(start, rule, fromMs, toMs, max = 400) {
  const r = Object.fromEntries(rule.split(';').map((kv) => kv.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = r.FREQ, interval = Math.max(1, +r.INTERVAL || 1);
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return [start.ms];
  const until = r.UNTIL ? parseIcsDate(r.UNTIL, {}, start.tz)?.ms : Infinity;
  const count = r.COUNT ? +r.COUNT : Infinity;
  const byDay = (r.BYDAY || '').split(',').map((s) => DAYS[s.replace(/^[+-]?\d+/, '')]).filter((x) => x !== undefined);
  const base = Date.UTC(start.date.y, start.date.m - 1, start.date.d);
  const baseWd = new Date(base).getUTCDay();
  const days = freq === 'WEEKLY' ? (byDay.length ? byDay : [baseWd]) : null;
  const weekStart = base - baseWd * 864e5;
  const out = [];
  let n = 0;
  for (let i = 0; i < 3000 && out.length < max; i++) {
    const dayMs = base + i * 864e5;
    const dt = new Date(dayMs);
    if (freq === 'DAILY' && i % interval) continue;
    if (freq === 'WEEKLY') {
      const week = Math.floor((dayMs - weekStart) / (7 * 864e5));
      if (week % interval || !days.includes(dt.getUTCDay())) continue;
    }
    const [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
    const ms = start.allDay ? zonedToUtc(y, m, d, 0, 0, start.tz) : start.tz === 'UTC'
      ? Date.UTC(y, m - 1, d, start.time[0], start.time[1]) : zonedToUtc(y, m, d, start.time[0], start.time[1], start.tz);
    if (ms > until) break;
    n++;
    if (n > count) break;
    if (ms >= fromMs - 2 * 864e5 && ms <= toMs) out.push(ms);
    if (ms > toMs) break;
  }
  return out;
}

/* Parse an .ics file into events inside [fromMs, toMs]. */
export function parseIcs(text, {fromMs, toMs, tz = DEFAULT_TZ, limit = 1500} = {}) {
  const lines = parseLines(text || '');
  const raw = [];
  let cur = null;
  for (const l of lines) {
    if (l.name === 'BEGIN' && l.value.toUpperCase() === 'VEVENT') { cur = {exdates: []}; continue; }
    if (l.name === 'END' && l.value.toUpperCase() === 'VEVENT') { if (cur) raw.push(cur); cur = null; continue; }
    if (!cur) continue;
    if (l.name === 'DTSTART') cur.start = parseIcsDate(l.value, l.params, tz);
    else if (l.name === 'DTEND') cur.end = parseIcsDate(l.value, l.params, tz);
    else if (l.name === 'DURATION') cur.duration = durationMs(l.value);
    else if (l.name === 'SUMMARY') cur.title = unescape(l.value).slice(0, 140);
    else if (l.name === 'LOCATION') cur.location = unescape(l.value).slice(0, 200);
    else if (l.name === 'UID') cur.uid = l.value.trim().slice(0, 200);
    else if (l.name === 'RRULE') cur.rrule = l.value;
    else if (l.name === 'STATUS') cur.status = l.value.toUpperCase();
    else if (l.name === 'EXDATE') for (const v of l.value.split(',')) { const d = parseIcsDate(v, l.params, tz); if (d) cur.exdates.push(d.ms); }
    else if (l.name === 'RECURRENCE-ID') cur.recurrenceId = parseIcsDate(l.value, l.params, tz)?.ms;
  }
  const moved = new Map();
  for (const e of raw) if (e.uid && e.recurrenceId) moved.set(`${e.uid}|${e.recurrenceId}`, true);
  const out = [];
  for (const e of raw) {
    if (!e.start || e.status === 'CANCELLED') continue;
    const len = e.end ? Math.max(0, e.end.ms - e.start.ms) : e.duration ?? (e.start.allDay ? 864e5 : 3600e3);
    const starts = e.rrule && !e.recurrenceId ? occurrences(e.start, e.rrule, fromMs, toMs) : [e.start.ms];
    for (const s of starts) {
      if (e.exdates.includes(s)) continue;
      if (!e.recurrenceId && e.uid && moved.has(`${e.uid}|${s}`)) continue;
      const end = s + (len || 3600e3);
      if (end <= fromMs || s >= toMs) continue;
      out.push({uid: `${e.uid || e.title}|${s}`, title: e.title || 'Event', location: e.location || '', start: s, end, allDay: e.start.allDay});
      if (out.length >= limit) return out;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
