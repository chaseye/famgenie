/* Shared by the browser app and the Cloudflare Functions. Pure functions and constants only. */

export const METHODS = [
  {id: 'link', name: 'Check-in link', kind: 'direct', ages: [10, 22], needs: 'smartphone',
    how: 'FamGenie texts a one-time link. Your child taps it and the browser shares a single location reading.',
    signal: 'On demand', cost: 'Per text', caveat: 'A snapshot, and only when they tap.'},
  {id: 'reply', name: 'Text reply check-in', kind: 'direct', ages: [8, 22], needs: 'phone',
    how: '"Reply 1 when you get to practice." Works on basic and kid-safe phones too.',
    signal: 'On demand, no GPS', cost: 'Per text', caveat: 'Self-reported, so lower confidence.'},
  {id: 'hub', name: 'Kid page', kind: 'direct', ages: [10, 22], needs: 'smartphone',
    how: 'A private page your child saves to their home screen to check in or ask for money any time.',
    signal: 'When they choose', cost: 'Free', caveat: ''},
  {id: 'shortcut', name: 'Phone automation', kind: 'auto', ages: [12, 22], needs: 'smartphone',
    how: 'An iPhone Shortcuts or Android automation tells FamGenie when they arrive at or leave a saved place.',
    signal: 'Automatic arrive / leave', cost: 'Free', caveat: 'Your child can turn it off; some phones ask before it runs.'},
  {id: 'school', name: 'School attendance', kind: 'partner', ages: [5, 18], needs: '',
    how: '"Marked present" from the school\'s parent portal or a district data agreement.',
    signal: 'Once or twice a day', cost: 'Free', caveat: 'School hours only; access varies by district.'},
  {id: 'tag', name: 'Bluetooth item tag', kind: 'manual', ages: [4, 12], needs: '',
    how: 'AirTag, Galaxy SmartTag, Tile or Chipolo on a backpack or bike. You check its app, then tap to log it here.',
    signal: 'You confirm', cost: 'One-time tag', caveat: 'Tags are made for items, not people, and have no outside access. Anti-tracking alerts may notify nearby phones.'},
  {id: 'watch', name: 'Kids\' GPS watch', kind: 'manual', ages: [4, 12], needs: '',
    how: 'Gabb, Bark, Gizmo or Apple Watch Family Setup. You check the watch app, then tap to log it here.',
    signal: 'You confirm', cost: 'Device + plan', caveat: 'Watch makers generally don\'t offer outside access.'},
  {id: 'share', name: 'Built-in live sharing', kind: 'manual', ages: [13, 22], needs: 'smartphone',
    how: 'Find My, Google Maps or WhatsApp live location. FamGenie asks your teen to start it for a late night or trip.',
    signal: 'You view it in that app', cost: 'Free', caveat: 'FamGenie can\'t read those apps; it only asks and logs.'},
  {id: 'carrier', name: 'Carrier lookup', kind: 'partner', ages: [13, 22], needs: 'phone',
    how: 'Location by phone number from the mobile network, with the line owner\'s consent, through a carrier API aggregator.',
    signal: 'On demand, no app', cost: 'Per lookup', caveat: 'Coming later. US availability is still rolling out.'},
];
export const METHOD_IDS = METHODS.map((m) => m.id);
export const KIND_LABEL = {direct: 'Direct', auto: 'Automation', manual: 'You confirm', partner: 'Partner'};

export const DEVICES = {iphone: 'iPhone', android: 'Android phone', basic: 'Basic or kid-safe phone', watch: 'GPS watch only', none: 'No phone or watch'};
export const ROLES = ['Teacher', 'Tutor', 'Coach', 'School parents group', 'Babysitter', 'Family', 'Other'];
export const EXTERNAL_APPS = {
  classdojo: {name: 'ClassDojo', url: 'https://www.classdojo.com'},
  remind: {name: 'Remind', url: 'https://www.remind.com'},
  groupme: {name: 'GroupMe', url: 'https://groupme.com'},
  whatsapp: {name: 'WhatsApp', url: 'https://web.whatsapp.com'},
  seesaw: {name: 'Seesaw', url: 'https://app.seesaw.me'},
  parentsquare: {name: 'ParentSquare', url: 'https://www.parentsquare.com'},
};
export const CARD_PROVIDERS = {
  greenlight: {name: 'Greenlight', url: 'https://greenlight.com'},
  step: {name: 'Step', url: 'https://step.com'},
  busykid: {name: 'BusyKid', url: 'https://busykid.com'},
  other: {name: 'Other card', url: ''},
};
export const CATEGORIES = ['Tutoring', 'Lessons & coaching', 'School fees', 'Activities', 'Food', 'Transport', 'Clothes', 'Gifts', 'Other'];
export const PAY_METHODS = {
  venmo: 'Venmo', zelle: 'Zelle', paypal: 'PayPal', cashapp: 'Cash App', card: 'Kid\'s card', cash: 'Cash', other: 'Other',
};

/* Phone numbers to E.164 (US default). */
export function normPhone(v) {
  const s = String(v || '').trim();
  const d = s.replace(/\D/g, '');
  if (!d) return '';
  if (s.startsWith('+')) return '+' + d;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '+' + d;
}
export function prettyPhone(p) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || '');
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (p || '');
}

export function ageOf(birthday, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday || '')) return null;
  const [y, m, d] = birthday.split('-').map(Number);
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

const deviceIsSmart = (k) => k.device === 'iphone' || k.device === 'android';
const deviceHasPhone = (k) => deviceIsSmart(k) || k.device === 'basic';

/* Can this option be turned on for this child? Returns '' when yes, or the reason it can't. */
export function methodBlocked(m, kid) {
  const age = ageOf(kid.birthday) ?? 10;
  if (m.kind === 'partner' && m.id !== 'school') return 'Coming soon';
  if (age < m.ages[0] || age > m.ages[1]) return `For ages ${m.ages[0]}–${m.ages[1]}`;
  if (m.needs === 'smartphone' && !deviceIsSmart(kid)) return 'Needs a smartphone';
  if (m.needs === 'phone' && !deviceHasPhone(kid)) return 'Needs a phone';
  return '';
}
export function defaultMethods(kid) {
  const age = ageOf(kid.birthday) ?? 10;
  const want = age >= 18 ? ['link', 'hub', 'share']
    : ['link', 'reply', 'hub', 'shortcut', 'school', 'tag', 'watch'].filter((id) => id !== 'watch' || kid.device === 'watch');
  return want.filter((id) => !methodBlocked(METHODS.find((m) => m.id === id), kid));
}

/* Nearest saved place that a reading falls inside (radius + reading accuracy). */
export function distanceM(aLat, aLon, bLat, bLon) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function matchPlace(places, lat, lon, accuracy = 0) {
  let best = null;
  for (const p of places || []) {
    const d = distanceM(lat, lon, p.lat, p.lon);
    if (d <= (p.radius || 150) + Math.min(accuracy || 0, 300) && (!best || d < best.d)) best = {...p, d};
  }
  return best;
}

/* ---------- Money ---------- */
export const fmtMoney = (cents) => (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function toCents(v) {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 100) : 0;
}
/* "2026-11" for an instant. Pass the family's time zone so a payment on the evening of the 31st counts in that month
 * (without tz it uses UTC, as before). */
export function monthKey(ts, tz) {
  if (!tz) return new Date(ts).toISOString().slice(0, 7);
  const p = tzParts(ts, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

/* A kid's text like "PAY 40 Priya tutoring" or "need $25 for field trip". */
export function parseMoneyText(body) {
  const m = /^\s*(?:pay|need|ask)\s+\$?(\d{1,5}(?:\.\d{1,2})?)\s*(?:to\s+|for\s+)?([\s\S]*)$/i.exec(body || '');
  if (!m) return null;
  const cents = toCents(m[1]);
  if (!cents) return null;
  return {cents, rest: m[2].trim().slice(0, 140)};
}
/* Guess payee and category from the free text, using the child's contacts. */
export function guessRequest(rest, contacts) {
  const words = (rest || '').toLowerCase();
  const contact = (contacts || []).find((c) => c.kind !== 'group' && c.name && words.includes(c.name.toLowerCase().split(/\s+/)[0]));
  let category = 'Other';
  if (/tutor/.test(words)) category = 'Tutoring';
  else if (/lesson|coach|piano|swim|class/.test(words)) category = 'Lessons & coaching';
  else if (/trip|fee|book|school|lab/.test(words)) category = 'School fees';
  else if (/lunch|food|dinner|snack/.test(words)) category = 'Food';
  else if (/uber|lyft|bus|train|gas|ride/.test(words)) category = 'Transport';
  else if (contact?.role === 'Tutor') category = 'Tutoring';
  else if (contact?.role === 'Coach') category = 'Lessons & coaching';
  return {contactId: contact?.id || '', payee: contact?.name || '', category};
}

/* Pre-filled pay links. FamGenie never moves money: these open the parent's own app. */
export function payLink(method, handle, cents, note) {
  const h = String(handle || '').trim();
  if (!h) return '';
  const amt = (cents / 100).toFixed(2);
  if (method === 'venmo') return `https://venmo.com/${encodeURIComponent(h.replace(/^@/, ''))}?txn=pay&amount=${amt}&note=${encodeURIComponent(note || '')}`;
  if (method === 'paypal') return `https://paypal.me/${encodeURIComponent(h.replace(/^https?:\/\/(www\.)?paypal\.me\//i, '').replace(/^@/, ''))}/${amt}USD`;
  if (method === 'cashapp') return `https://cash.app/$${encodeURIComponent(h.replace(/^\$/, ''))}/${amt}`;
  return '';
}

/* Month summary per child: what was spent, topped up, waiting, and left in the budget. */
export function tally(entries, kids, month, tz) {
  const out = {};
  for (const k of kids) out[k.id] = {spent: 0, topups: 0, pending: 0, pendingCount: 0, budget: k.monthlyBudget || 0, byCategory: {}};
  for (const e of entries) {
    const t = out[e.kidId];
    if (!t) continue;
    if (e.status === 'pending' || e.status === 'approved') {
      if (e.kind === 'request') { t.pending += e.amountCents; t.pendingCount++; }
      continue;
    }
    if (e.status !== 'paid' || monthKey(e.paidAt || e.createdAt, tz) !== month) continue;
    if (e.kind === 'topup' || e.kind === 'allowance') t.topups += e.amountCents;
    else { t.spent += e.amountCents; t.byCategory[e.category || 'Other'] = (t.byCategory[e.category || 'Other'] || 0) + e.amountCents; }
  }
  for (const id in out) out[id].left = out[id].budget ? out[id].budget - out[id].spent : null;
  return out;
}

/* One line on what a request would do to this month's budget (same math as "After this" in the app).
 * t is one child's tally; '' when the child has no budget. */
export function budgetAfter(t, cents) {
  if (!t?.budget) return '';
  const after = t.left - cents;
  return after >= 0 ? `After this: ${fmtMoney(after)} left of ${fmtMoney(t.budget)} this month.`
    : `This would be ${fmtMoney(-after)} over this month's ${fmtMoney(t.budget)} budget.`; // plain ' keeps texts in one SMS encoding
}

/* ---------- Time zones and schedules ---------- */
export const DEFAULT_TZ = 'America/Chicago';
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const partsFmt = new Map();
/* Wall-clock parts of an instant in a time zone. */
export function tzParts(ms, tz = DEFAULT_TZ) {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short'});
    partsFmt.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return {y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: WD.indexOf(p.weekday)};
}
/* The instant when the wall clock in tz reads y-m-d h:mi. */
export function zonedToUtc(y, m, d, h, mi, tz = DEFAULT_TZ) {
  const want = Date.UTC(y, m - 1, d, h, mi);
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const p = tzParts(guess, tz);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - want;
    if (!diff) break;
    guess -= diff;
  }
  return guess;
}
export const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', {timeZone: tz}); return true; } catch (e) { return false; } };
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m && +m[1] < 24 && +m[2] < 60 ? [+m[1], +m[2]] : null; };

/* Weekly activities ({kidIds, title, days:[0-6], start:'16:30', end:'18:00', placeId}) → dated events in a window. */
export function expandSchedule(schedule, fromMs, toMs, tz = DEFAULT_TZ) {
  const out = [];
  const first = tzParts(fromMs, tz);
  const days = Math.min(62, Math.ceil((toMs - fromMs) / 864e5) + 2);
  for (let i = -1; i < days; i++) {
    const dt = new Date(Date.UTC(first.y, first.m - 1, first.d + i));
    const [y, m, d, wd] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), dt.getUTCDay()];
    for (const s of schedule || []) {
      const a = hm(s.start), b = hm(s.end);
      if (!a || !b || !(s.days || []).includes(wd)) continue;
      const start = zonedToUtc(y, m, d, a[0], a[1], tz);
      let end = zonedToUtc(y, m, d, b[0], b[1], tz);
      if (end <= start) end = start + 60 * 60e3;
      if (end > fromMs && start < toMs) out.push({id: `${s.id}:${y}-${m}-${d}`, kidIds: s.kidIds || [], title: s.title, start, end, allDay: false, placeId: s.placeId || '', location: '', source: 'schedule'});
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/* Where should this child be now, and do we know they're there? */
export function kidExpectation(kidId, events, signals, now = Date.now()) {
  const mine = events.filter((e) => !e.allDay && e.kidIds.includes(kidId));
  const current = mine.filter((e) => e.start <= now && now < e.end).sort((a, b) => b.start - a.start)[0];
  if (current) {
    const since = current.start - 30 * 60e3;
    const seen = signals.filter((s) => s.kidId === kidId && s.at >= since && s.confidence !== 'pending' && s.confidence !== 'declined');
    const atPlace = current.placeId ? seen.find((s) => s.placeId === current.placeId) : null;
    const said = seen.find((s) => (s.confidence === 'self' || s.confidence === 'parent') && !s.placeId);
    const elsewhere = current.placeId ? seen.find((s) => s.placeId && s.placeId !== current.placeId && s.at >= current.start) : null;
    if (atPlace || said) return {state: 'confirmed', event: current, signal: atPlace || said};
    if (elsewhere) return {state: 'elsewhere', event: current, signal: elsewhere};
    if (now - current.start > 10 * 60e3) return {state: 'late', event: current};
    return {state: 'due', event: current};
  }
  const next = mine.filter((e) => e.start > now && e.start - now < 3 * 3600e3).sort((a, b) => a.start - b.start)[0];
  return next ? {state: 'upcoming', event: next} : {state: null};
}

/* Two kids who need to be in different places at the same time (someone has to drive). */
export function findConflicts(events, kids, fromMs, toMs) {
  const young = new Set(kids.filter((k) => (ageOf(k.birthday) ?? 10) < 16).map((k) => k.id));
  // School days are routine (bus, carpool), so they don't count as a conflict to solve.
  const ev = events.filter((e) => !e.allDay && e.placeId && !/\bschool\b/i.test(e.title) && e.start < toMs && e.end > fromMs && e.kidIds.some((id) => young.has(id)))
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (let i = 0; i < ev.length; i++) {
    for (let j = i + 1; j < ev.length && ev[j].start < ev[i].end; j++) {
      const a = ev[i], b = ev[j];
      if (a.placeId === b.placeId) continue;
      if (a.kidIds.some((id) => b.kidIds.includes(id))) continue;
      if (Math.abs(a.start - b.start) > 45 * 60e3 && Math.abs(a.end - b.end) > 45 * 60e3) continue;
      out.push({a, b, at: Math.max(a.start, b.start)});
    }
  }
  return out;
}

/* ---------- Inbox threads ---------- */
export function threadKey(m, family) {
  if (m.threadId) return m.threadId;
  const p = m.phone;
  const kid = family.kids.find((k) => k.phone && k.phone === p);
  if (kid) return 'k-' + kid.id;
  for (const c of family.contacts) {
    if (c.phone && c.phone === p) return 'c-' + c.id;
    if (c.kind === 'group' && (c.members || []).some((x) => x.phone === p)) return 'c-' + c.id;
  }
  return 'u-' + String(p || '').replace(/\D/g, '');
}

/* ---------- The brief: what needs a parent right now (rules; the AI only words it) ---------- */
const clock = (ms, tz) => { const p = tzParts(ms, tz); return `${((p.h + 11) % 12) + 1}:${String(p.mi).padStart(2, '0')}${p.h < 12 ? 'am' : 'pm'}`; };
export function ruleBrief({family, signals = [], events = [], money = [], messages = [], mail = [], checkins = [], now = Date.now()}) {
  const tz = family.timezone || DEFAULT_TZ;
  const items = [];
  const kidName = (id) => family.kids.find((k) => k.id === id)?.name || '';
  const place = (id) => family.places.find((p) => p.id === id)?.name || '';
  for (const k of family.kids) {
    const recent = signals.filter((s) => s.kidId === k.id && now - s.at < 6 * 3600e3).sort((a, b) => b.at - a.at)[0];
    if (recent?.confidence === 'help') { items.push({p: 0, kind: 'help', kidId: k.id, text: `${k.name} asked for help: ${recent.text.toLowerCase()}.`, action: {type: 'checkin', id: k.id}}); continue; }
    const ex = kidExpectation(k.id, events, signals, now);
    const where = ex.event ? (place(ex.event.placeId) || ex.event.title) : '';
    if (ex.state === 'late') items.push({p: 1, kind: 'late', kidId: k.id, text: `${k.name} isn’t confirmed at ${where} (${ex.event.title}, started ${clock(ex.event.start, tz)}).`, action: {type: 'checkin', id: k.id}});
    if (ex.state === 'elsewhere') items.push({p: 1, kind: 'late', kidId: k.id, text: `${k.name} should be at ${where} but was last seen ${ex.signal.text.replace(/^At /, 'at ').replace(/^Seen at /, 'at ')}.`, action: {type: 'checkin', id: k.id}});
    const open = checkins.find((c) => c.kidId === k.id && !c.usedAt && c.expiresAt > now);
    if (open && ex.state !== 'late') items.push({p: 3, kind: 'waiting', kidId: k.id, text: `Waiting on ${k.name}’s check-in.`, action: {type: 'kid', id: k.id}});
  }
  for (const r of money.filter((m) => m.kind === 'request' && m.status === 'pending')) {
    items.push({p: 2, kind: 'money', kidId: r.kidId, text: `${kidName(r.kidId)} asked for ${fmtMoney(r.amountCents)}${r.payee ? ' to ' + r.payee : ''} (${r.category}).`, action: {type: 'pay', id: r.id}});
  }
  const dayEnd = now + 36 * 3600e3;
  for (const c of findConflicts(events, family.kids, now, dayEnd).slice(0, 2)) {
    items.push({p: 2, kind: 'conflict', text: `${kidName(c.a.kidIds[0])}’s ${c.a.title} and ${kidName(c.b.kidIds[0])}’s ${c.b.title} overlap ${sameDay(c.at, now, tz) ? 'today' : 'tomorrow'} at ${clock(c.at, tz)}, in different places. Who’s driving?`, action: {type: 'schedule'}});
  }
  const byThread = new Map();
  for (const m of messages) byThread.set(threadKey(m, family), m);
  for (const [tid, last] of byThread) {
    if (last.dir !== 'in' || now - last.at > 48 * 3600e3) continue;
    const c = tid.startsWith('c-') ? family.contacts.find((x) => x.id === tid.slice(2)) : null;
    if (tid.startsWith('u-') || (c && !c.allow)) continue;
    const who = c ? c.name : kidName(tid.slice(2));
    items.push({p: 4, kind: 'reply', text: `${who} is waiting on a reply: “${last.body.slice(0, 70)}${last.body.length > 70 ? '…' : ''}”`, action: {type: 'thread', id: tid}});
  }
  for (const m of mail.filter((x) => !x.done).slice(0, 3)) {
    items.push({p: 4, kind: 'mail', kidId: m.kidId, text: m.task ? `${m.task}${m.due ? ` (by ${m.due})` : ''}. From ${m.fromName || 'school email'}.` : `School email from ${m.fromName || m.from}: “${m.subject}”`, action: {type: 'mail', id: m.id}});
  }
  const held = [...byThread.entries()].filter(([tid]) => {
    const c = tid.startsWith('c-') ? family.contacts.find((x) => x.id === tid.slice(2)) : null;
    return tid.startsWith('u-') || (c && !c.allow);
  }).length;
  if (held) items.push({p: 5, kind: 'held', text: `${held} message${held > 1 ? 's' : ''} held from people you haven’t allowed.`, action: {type: 'held'}});
  const upcoming = events.filter((e) => !e.allDay && e.start > now && e.start < now + 4 * 3600e3).sort((a, b) => a.start - b.start).slice(0, 3);
  for (const e of upcoming) items.push({p: 6, kind: 'next', text: `${clock(e.start, tz)} · ${e.kidIds.map(kidName).filter(Boolean).join(' & ') || 'Family'}: ${e.title}${place(e.placeId) ? ' at ' + place(e.placeId) : ''}.`, action: {type: 'schedule'}});
  return items.sort((a, b) => a.p - b.p);
}
function sameDay(a, b, tz) { const x = tzParts(a, tz), y = tzParts(b, tz); return x.y === y.y && x.m === y.m && x.d === y.d; }
