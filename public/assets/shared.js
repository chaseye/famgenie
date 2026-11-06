/* Shared by the browser app and the Cloudflare Functions. Pure functions and constants only. */

export const METHODS = [
  {id: 'link', name: 'Check-in link', kind: 'direct', ages: [10, 22], needs: 'smartphone',
    how: 'Hootline texts a one-time link. Your child taps it and the browser shares a single location reading.',
    signal: 'On demand', cost: 'Per text', caveat: 'A snapshot, and only when they tap.'},
  {id: 'reply', name: 'Text reply check-in', kind: 'direct', ages: [8, 22], needs: 'phone',
    how: '"Reply 1 when you get to practice." Works on basic and kid-safe phones too.',
    signal: 'On demand, no GPS', cost: 'Per text', caveat: 'Self-reported, so lower confidence.'},
  {id: 'hub', name: 'Kid page', kind: 'direct', ages: [10, 22], needs: 'smartphone',
    how: 'A private page your child saves to their home screen to check in or ask for money any time.',
    signal: 'When they choose', cost: 'Free', caveat: ''},
  {id: 'shortcut', name: 'Phone automation', kind: 'auto', ages: [12, 22], needs: 'smartphone',
    how: 'An iPhone Shortcuts or Android automation tells Hootline when they arrive at or leave a saved place.',
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
    how: 'Find My, Google Maps or WhatsApp live location. Hootline asks your teen to start it for a late night or trip.',
    signal: 'You view it in that app', cost: 'Free', caveat: 'Hootline can\'t read those apps; it only asks and logs.'},
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
export const monthKey = (ts) => new Date(ts).toISOString().slice(0, 7);

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

/* Pre-filled pay links. Hootline never moves money: these open the parent's own app. */
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
export function tally(entries, kids, month) {
  const out = {};
  for (const k of kids) out[k.id] = {spent: 0, topups: 0, pending: 0, pendingCount: 0, budget: k.monthlyBudget || 0, byCategory: {}};
  for (const e of entries) {
    const t = out[e.kidId];
    if (!t) continue;
    if (e.status === 'pending' || e.status === 'approved') {
      if (e.kind === 'request') { t.pending += e.amountCents; t.pendingCount++; }
      continue;
    }
    if (e.status !== 'paid' || monthKey(e.paidAt || e.createdAt) !== month) continue;
    if (e.kind === 'topup' || e.kind === 'allowance') t.topups += e.amountCents;
    else { t.spent += e.amountCents; t.byCategory[e.category || 'Other'] = (t.byCategory[e.category || 'Other'] || 0) + e.amountCents; }
  }
  for (const id in out) out[id].left = out[id].budget ? out[id].budget - out[id].spent : null;
  return out;
}
