/* FamGenie parent app. Talks to the Cloudflare API when it's deployed; otherwise runs a demo stored in this browser. */
import {METHODS, KIND_LABEL, DEVICES, ROLES, EXTERNAL_APPS, CARD_PROVIDERS, CATEGORIES, PAY_METHODS,
  normPhone, prettyPhone, ageOf, methodBlocked, defaultMethods, fmtMoney, toCents, monthKey, payLink, tally} from './shared.js';

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const TINTS = ['#CFE3F7', '#F9DDC4', '#D8EEDC', '#E9DAF5', '#F6E3A1', '#F5D0D6'];
const DEMO_KEY = 'famgenie-demo-v1';
const day = 864e5;
const CONF = {
  gps: ['GPS', 'good'], automation: ['Automation', 'good'], school: ['School record', 'good'], parent: ['You confirmed', 'good'],
  self: ['Self-reported', 'ok'], pending: ['Sent', 'wait'], help: ['Needs help', 'warn'], declined: ['Declined', 'warn'],
};
const ICON = {
  lamp: '<svg viewBox="0 0 24 24" fill="none" stroke="#2A1D00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15h13a4 4 0 0 0 4-4V9l-3 2"/><path d="M5 15c0-3 2.5-5 6-5s5 1.5 6 3"/><path d="M8 18h7"/><path d="M11 10V7"/><circle cx="11" cy="5.5" r="1.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
  family: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="10" r="2.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 15.2c.6-.2 1.3-.2 2-.2 2.2 0 4 1.8 4 4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.6L19.5 9l-5.7 1.6L12 16l-1.8-5.4L4.5 9l5.7-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
};

/* ---------- state ---------- */
let MODE = 'loading';             // 'live' | 'signin' | 'demo'
let LIVE_OK = false;              // the API exists on this site
const emptyFamily = () => ({parent: {name: '', relationship: '', phone: ''}, kids: [], contacts: [], places: [], plan: 'free'});
let D = {family: emptyFamily(), signals: [], messages: [], money: [], checkins: [], sms: 'demo', email: ''};
const ui = {sheet: null, draft: {}, step: 0, inboxTab: 'inbox', moneyKid: 'all'};

const kidById = (id) => D.family.kids.find((k) => k.id === id);
const contactById = (id) => D.family.contacts.find((c) => c.id === id);
const placeById = (id) => D.family.places.find((p) => p.id === id);
const asker = () => (['Mom', 'Dad', 'Grandma', 'Grandpa'].includes(D.family.parent.relationship) ? D.family.parent.relationship : (D.family.parent.name || '').split(/\s+/)[0] || 'Your parent');
const firstName = () => (D.family.parent.name || '').split(/\s+/)[0] || 'there';
const hasPhone = (k) => !!k.phone && ['iphone', 'android', 'basic'].includes(k.device);
const isAdult = (k) => (ageOf(k.birthday) ?? 0) >= 18;
const ageText = (k) => { const a = ageOf(k.birthday); return a === null ? '' : `${a}`; };

function fmtTime(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}).toLowerCase().replace(' ', '');
  if (now - d < 6 * day) return d.toLocaleDateString([], {weekday: 'short'});
  return d.toLocaleDateString([], {month: 'short', day: 'numeric'});
}
function avatar(p, size = 40, group = false) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (p?.photo && /^data:image\//.test(p.photo)) return `<img class="av${group ? ' group' : ''}" style="${style}" src="${esc(p.photo)}" alt="">`;
  const ini = (p?.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<span class="av${group ? ' group' : ''}" style="${style};background:${esc(p?.tint || 'var(--sunk)')}" aria-hidden="true">${esc(ini)}</span>`;
}
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2800);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch (e) { toast('Select the text and copy it'); }
}

/* ---------- data: live API or browser demo ---------- */
async function api(method, path, body) {
  const r = await fetch(path, {method, credentials: 'same-origin', headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
  let j = {};
  try { j = await r.json(); } catch (e) { /* empty */ }
  if (r.status === 401) { MODE = 'signin'; render(); throw new Error('Sign in to continue.'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
  return j;
}
const live = {
  async load() { const s = await api('GET', '/api/state'); Object.assign(D, s); },
  async saveFamily() { D.family = await api('PUT', '/api/family', D.family); },
  async checkin(kidId, how, reason) { const r = await api('POST', '/api/checkins', {kidId, how, reason}); await this.load(); return r; },
  async logSeen(kidId, source, placeId, text) { await api('POST', '/api/signals', {kidId, source, placeId, text}); await this.load(); },
  async send(threadId, body) { await api('POST', '/api/messages', {threadId, body}); await this.load(); },
  async money(op) { await api('POST', '/api/money', op); await this.load(); },
};
const demo = {
  async load() {
    try { const s = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); if (s && s.family) Object.assign(D, s); } catch (e) { /* storage blocked */ }
    D.sms = 'demo';
  },
  persist() {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify({family: D.family, signals: D.signals, messages: D.messages, money: D.money, checkins: D.checkins})); }
    catch (e) { if (!demo.warned) { demo.warned = true; toast('This browser couldn’t save the demo; it resets on reload.'); } }
  },
  async saveFamily() {
    for (const k of D.family.kids) { k.hubToken ||= 'demo-' + uid(); k.hookToken ||= 'demo-' + uid(); }
    this.persist();
  },
  async checkin(kidId, how, reason) {
    const c = {id: uid(), kidId, how, reason, createdAt: Date.now(), expiresAt: Date.now() + (how === 'link' ? 15 : 120) * 60e3, usedAt: null};
    D.checkins.unshift(c);
    addSignal(kidId, how === 'link' ? 'Check-in link sent' : 'Text check-in sent', `Sent by ${asker()}`, 'pending');
    this.persist();
    return {demo: true, checkinId: c.id};
  },
  async logSeen(kidId, source, placeId, text) {
    const p = placeById(placeId);
    addSignal(kidId, p ? `Seen at ${p.name}` : text, source, 'parent', placeId);
    this.persist();
  },
  async send(threadId, body) {
    D.messages.push({id: uid(), dir: 'out', threadId, body, at: Date.now(), status: 'demo'});
    this.persist();
    setTimeout(() => demoReply(threadId), 1500);
  },
  async money(op) { demoMoney(op); this.persist(); },
};
const backend = () => (MODE === 'live' ? live : demo);

function addSignal(kidId, text, source, confidence, placeId = null) {
  D.signals.unshift({id: uid(), kidId, at: Date.now(), text, source, confidence, placeId});
}
function demoReply(threadId) {
  let phone = '', body = 'Got it, thanks!';
  if (threadId.startsWith('c-')) {
    const c = contactById(threadId.slice(2)); if (!c) return;
    phone = c.kind === 'group' ? c.members[0]?.phone : c.phone;
    body = {Tutor: 'Sounds good, see you then.', Teacher: 'Thanks for letting me know!', Coach: 'Thanks, noted for practice.', 'School parents group': 'I can help with that.'}[c.role] || body;
  } else if (threadId.startsWith('k-')) { phone = kidById(threadId.slice(2))?.phone; body = 'ok 👍'; }
  if (!phone) return;
  D.messages.push({id: uid(), dir: 'in', phone, body: body + ' (demo reply)', at: Date.now(), status: 'received'});
  demo.persist();
  if (route().name === 'thread' || route().name === 'inbox') render();
}
function demoMoney(op) {
  const now = Date.now();
  if (op.op === 'record') {
    const c = contactById(op.contactId);
    const kind = op.kind || 'payment';
    D.money.unshift({id: uid(), kidId: op.kidId, kind, status: 'paid', amountCents: toCents(op.amount), payee: c?.name || op.payee || '', contactId: c?.id || '',
      category: kind === 'payment' ? op.category : kind === 'topup' ? 'Card top-up' : 'Allowance', method: op.method || '', note: op.note || '', source: 'parent', createdAt: now, paidAt: now});
    return;
  }
  if (op.op === 'request') {
    const c = contactById(op.contactId);
    D.money.unshift({id: uid(), kidId: op.kidId, kind: 'request', status: 'pending', amountCents: toCents(op.amount), payee: c?.name || op.payee || '', contactId: c?.id || '',
      category: op.category || 'Other', method: '', note: op.note || '', source: 'kid-page', createdAt: now});
    return;
  }
  const r = D.money.find((x) => x.id === op.id); if (!r) return;
  if (op.op === 'approve') Object.assign(r, {status: 'approved', decidedAt: now, method: op.method || r.method});
  if (op.op === 'decline') Object.assign(r, {status: 'declined', decidedAt: now, note: op.note ? `${r.note ? r.note + ' · ' : ''}${asker()}: ${op.note}` : r.note});
  if (op.op === 'paid') Object.assign(r, {status: 'paid', decidedAt: r.decidedAt || now, paidAt: now, method: op.method || r.method || 'other'});
}

/* ---------- sample family (demo) ---------- */
function sampleFamily() {
  const y = new Date().getFullYear();
  const ago = (min) => Date.now() - min * 60e3;
  const ids = {leo: uid(), maya: uid(), sam: uid(), alv: uid(), riv: uid(), pri: uid(), room: uid(), pto: uid(), swim: uid()};
  const pl = {home: uid(), jeff: uid(), lhs: uid(), field: uid(), ymca: uid()};
  const family = {
    parent: {name: 'Dana Reyes', relationship: 'Mom', phone: '+13125550100'},
    plan: 'family',
    kids: [
      {id: ids.leo, name: 'Leo', birthday: `${y - 7}-03-14`, school: 'Jefferson Elementary', grade: '2nd grade', phone: '', device: 'watch', photo: '', tint: TINTS[0],
        methods: ['school', 'tag', 'watch'], monthlyBudget: 4000, card: null},
      {id: ids.maya, name: 'Maya', birthday: `${y - 14}-01-22`, school: 'Lincoln High School', grade: '9th grade', phone: '+13125550142', device: 'iphone', photo: '', tint: TINTS[1],
        methods: ['link', 'reply', 'hub', 'shortcut', 'school', 'share'], monthlyBudget: 15000, card: {provider: 'greenlight', label: 'Maya’s Greenlight'}},
      {id: ids.sam, name: 'Sam', birthday: `${y - 19}-02-02`, school: 'University of Illinois', grade: 'Sophomore', phone: '+12175550119', device: 'android', photo: '', tint: TINTS[2],
        methods: ['link', 'hub', 'share'], monthlyBudget: 30000, card: null},
    ],
    contacts: [
      {id: ids.alv, kidIds: [ids.leo], role: 'Teacher', kind: 'person', name: 'Ms. Alvarez', phone: '+13125550161', email: 'alvarez@example.org', members: [], allow: true, route: 'app', externalApp: '', pay: {}},
      {id: ids.riv, kidIds: [ids.maya], role: 'Coach', kind: 'person', name: 'Coach Rivera', phone: '+13125550163', email: '', members: [], allow: true, route: 'app', externalApp: '', pay: {venmo: 'Rivera-Soccer'}},
      {id: ids.pri, kidIds: [ids.maya], role: 'Tutor', kind: 'person', name: 'Priya Shah', phone: '+13125550164', email: 'priya@example.com', members: [], allow: true, route: 'app', externalApp: '',
        pay: {venmo: 'PriyaShah-Tutor', zelle: 'priya@example.com'}},
      {id: ids.room, kidIds: [ids.leo], role: 'School parents group', kind: 'group', name: 'Room 12 parents', phone: '', email: '', allow: true, route: 'app', externalApp: '', pay: {},
        members: [{name: 'Jen (Ava’s mom)', phone: '+13125550171'}, {name: 'Marcus (Eli’s dad)', phone: '+13125550172'}]},
      {id: ids.pto, kidIds: [ids.maya], role: 'School parents group', kind: 'group', name: 'Lincoln High PTO', phone: '', email: '', members: [], allow: true, route: 'external', externalApp: 'whatsapp', pay: {}},
      {id: ids.swim, kidIds: [ids.leo], role: 'Coach', kind: 'person', name: 'Westside swim club', phone: '+13125550199', email: '', members: [], allow: false, route: 'app', externalApp: '', pay: {}},
    ],
    places: [
      {id: pl.home, name: 'Home', lat: 41.9214, lon: -87.6513, radius: 120},
      {id: pl.jeff, name: 'Jefferson Elementary', lat: 41.925, lon: -87.657, radius: 150},
      {id: pl.lhs, name: 'Lincoln High', lat: 41.918, lon: -87.644, radius: 200},
      {id: pl.field, name: 'Lincoln Park field 3', lat: 41.926, lon: -87.634, radius: 150},
      {id: pl.ymca, name: 'Westside Y', lat: 41.91, lon: -87.67, radius: 120},
    ],
  };
  for (const k of family.kids) { k.hubToken = 'demo-' + uid(); k.hookToken = 'demo-' + uid(); }
  const signals = [
    {kidId: ids.leo, at: ago(15), text: 'Seen at Westside Y', source: 'Parent confirmed from tag app', confidence: 'parent', placeId: pl.ymca},
    {kidId: ids.maya, at: ago(65), text: 'Left Lincoln High', source: 'Phone automation', confidence: 'automation', placeId: pl.lhs},
    {kidId: ids.maya, at: ago(470), text: 'Marked present at Lincoln High', source: 'School attendance', confidence: 'school', placeId: pl.lhs},
    {kidId: ids.leo, at: ago(475), text: 'Marked present at Jefferson Elementary', source: 'School attendance', confidence: 'school', placeId: pl.jeff},
  ].map((s) => ({id: uid(), ...s}));
  const messages = [
    {dir: 'in', phone: '+13125550161', body: 'Reminder: the zoo field trip form is due Friday. Leo still needs to bring his.', at: ago(300)},
    {dir: 'out', threadId: 'c-' + ids.pri, body: 'Can we move Thursday’s session to 5:30?', at: ago(210)},
    {dir: 'in', phone: '+13125550164', body: '5:30 works. Maya did really well with stoichiometry today.', at: ago(190)},
    {dir: 'in', phone: '+13125550163', body: 'Practice moves to field 3 today because of the wet grass.', at: ago(80)},
    {dir: 'in', phone: '+13125550171', body: 'Can anyone drive Saturday’s museum trip? I have 2 seats left.', at: ago(95)},
    {dir: 'in', phone: '+13125550199', body: 'Hi! Spring swim registration is open. Sign up by the 15th for 10% off.', at: ago(40)},
  ].map((m) => ({id: uid(), status: 'received', ...m}));
  const money = [
    {kidId: ids.maya, kind: 'request', status: 'pending', amountCents: 4000, payee: 'Priya Shah', contactId: ids.pri, category: 'Tutoring', note: 'Thursday tutoring session', source: 'kid-text', createdAt: ago(25)},
    {kidId: ids.sam, kind: 'request', status: 'pending', amountCents: 6500, payee: 'Campus bookstore', contactId: '', category: 'School fees', note: 'Lab manual for chem', source: 'kid-page', createdAt: ago(140)},
    {kidId: ids.maya, kind: 'payment', status: 'paid', amountCents: 4000, payee: 'Priya Shah', contactId: ids.pri, category: 'Tutoring', method: 'venmo', note: 'Last Thursday', source: 'parent', createdAt: ago(7 * 1440), paidAt: ago(7 * 1440)},
    {kidId: ids.maya, kind: 'topup', status: 'paid', amountCents: 2500, payee: '', category: 'Card top-up', method: 'card', note: 'Lunch money', source: 'parent', createdAt: ago(3 * 1440), paidAt: ago(3 * 1440)},
    {kidId: ids.maya, kind: 'payment', status: 'paid', amountCents: 3500, payee: 'Coach Rivera', contactId: ids.riv, category: 'Lessons & coaching', method: 'venmo', note: 'Tournament fee', source: 'parent', createdAt: ago(2 * 1440), paidAt: ago(2 * 1440)},
    {kidId: ids.leo, kind: 'payment', status: 'paid', amountCents: 1200, payee: 'Jefferson Elementary', category: 'School fees', method: 'other', note: 'Zoo field trip', source: 'parent', createdAt: ago(1440), paidAt: ago(1440)},
    {kidId: ids.sam, kind: 'allowance', status: 'paid', amountCents: 20000, payee: '', category: 'Allowance', method: 'zelle', note: 'November', source: 'parent', createdAt: ago(4 * 1440), paidAt: ago(4 * 1440)},
    {kidId: ids.sam, kind: 'payment', status: 'paid', amountCents: 2800, payee: 'Uber', category: 'Transport', method: 'card', note: 'Ride home from the airport', source: 'parent', createdAt: ago(5 * 1440), paidAt: ago(5 * 1440)},
  ].map((m) => ({id: uid(), method: '', contactId: '', ...m}));
  return {family, signals, messages, money, checkins: []};
}

/* ---------- threads ---------- */
function threadOf(m) {
  if (m.threadId) return m.threadId;
  const p = m.phone;
  const kid = D.family.kids.find((k) => k.phone && k.phone === p);
  if (kid) return 'k-' + kid.id;
  for (const c of D.family.contacts) {
    if (c.phone && c.phone === p) return 'c-' + c.id;
    if (c.kind === 'group' && (c.members || []).some((x) => x.phone === p)) return 'c-' + c.id;
  }
  return 'u-' + String(p || '').replace(/\D/g, '');
}
function threadInfo(tid) {
  if (tid.startsWith('c-')) {
    const c = contactById(tid.slice(2));
    if (!c) return null;
    const kids = c.kidIds.map((id) => kidById(id)?.name).filter(Boolean).join(', ');
    return {tid, title: c.name, sub: `${c.role}${kids ? ' · ' + kids : ''}`, held: !c.allow, contact: c, av: avatar(c, 42, c.kind === 'group')};
  }
  if (tid.startsWith('k-')) {
    const k = kidById(tid.slice(2));
    if (!k) return null;
    return {tid, title: k.name, sub: 'Your child', held: false, kid: k, av: avatar(k, 42)};
  }
  const phone = '+' + tid.slice(2);
  return {tid, title: prettyPhone(phone), sub: 'Not in your contacts', held: true, phone, av: avatar({name: '#'}, 42)};
}
function threads() {
  const map = new Map();
  for (const m of D.messages) {
    const tid = threadOf(m);
    const t = map.get(tid) || {tid, msgs: []};
    t.msgs.push(m); map.set(tid, t);
  }
  return [...map.values()].map((t) => ({...t, info: threadInfo(t.tid), last: t.msgs[t.msgs.length - 1]}))
    .filter((t) => t.info).sort((a, b) => b.last.at - a.last.at);
}
function senderName(m) {
  if (m.dir === 'out') return '';
  for (const c of D.family.contacts) {
    const mem = c.kind === 'group' && (c.members || []).find((x) => x.phone === m.phone);
    if (mem) return mem.name;
  }
  return '';
}

/* ---------- status per child ---------- */
function kidStatus(k) {
  const recent = D.signals.filter((s) => s.kidId === k.id && Date.now() - s.at < 14 * 3600e3).sort((a, b) => b.at - a.at);
  const last = recent[0];
  const open = D.checkins.find((c) => c.kidId === k.id && !c.usedAt && c.expiresAt > Date.now());
  if (last?.confidence === 'help') return {cls: 'warn', head: 'Asked for help', sub: `${last.text} · ${fmtTime(last.at)}`};
  if (open && (!last || last.confidence === 'pending')) return {cls: 'wait', head: `Waiting for ${k.name}`, sub: `${open.how === 'link' ? 'Check-in link' : 'Text check-in'} sent ${fmtTime(open.createdAt)}`};
  const real = recent.find((s) => s.confidence !== 'pending');
  if (real?.confidence === 'declined') return {cls: 'warn', head: 'Chose "not now"', sub: `${fmtTime(real.at)} · try a call`};
  if (real) return {cls: CONF[real.confidence]?.[1] || 'good', head: real.text, sub: `${real.source} · ${fmtTime(real.at)}`, conf: real.confidence};
  if (isAdult(k)) return {cls: 'quiet', head: `Shares when ${k.name} chooses`, sub: `${k.name} is 18+, so sharing is their call.`};
  return {cls: 'quiet', head: 'No check-ins yet today', sub: 'Send a check-in or log what you see.'};
}

/* ---------- routing ---------- */
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith('kid-')) return {name: 'kid', id: h.slice(4)};
  if (h.startsWith('thread-')) return {name: 'thread', id: h.slice(7)};
  return {name: ['home', 'inbox', 'money', 'family', 'settings', 'setup'].includes(h) ? h : 'home'};
}
const needsSetup = () => !D.family.parent.name || !D.family.kids.length;

/* ---------- render ---------- */
function render() {
  if (MODE === 'loading') return;
  const r = route();
  let view;
  if (MODE === 'signin') view = signinView();
  else if (r.name === 'setup' || needsSetup()) view = setupView();
  else view = ({home: homeView, inbox: inboxView, thread: () => threadView(r.id), money: moneyView, family: familyView, kid: () => kidView(r.id), settings: settingsView}[r.name] || homeView)();
  document.body.classList.toggle('no-tabs', MODE === 'signin' || r.name === 'setup' || needsSetup());
  $('#bar').innerHTML = view.bar || brandBar();
  $('#screen').innerHTML = view.html;
  renderTabs(r.name);
  renderSheet();
}
function brandBar(right = '') {
  return `<div class="brand"><span class="lamp">${ICON.lamp}</span><span class="title">FamGenie</span></div><span style="flex:1"></span>
    ${MODE === 'demo' ? '<span class="modepill">Demo</span>' : ''}${right}`;
}
function backBar(title, href, right = '') {
  return `<a class="icon-btn btn" href="#${href}" aria-label="Back">${ICON.back}</a><span class="title">${esc(title)}</span>${right}`;
}
function renderTabs(active) {
  const held = threads().filter((t) => t.info.held).length;
  const pending = D.money.filter((m) => m.kind === 'request' && m.status === 'pending').length;
  const tab = (id, label, icon, badge = 0) => {
    const on = active === id || (id === 'inbox' && active === 'thread') || (id === 'family' && active === 'kid');
    return `<a href="#${id}" ${on ? 'aria-current="page"' : ''}>${ICON[icon]}${label}${badge ? `<span class="dot">${badge}</span>` : ''}</a>`;
  };
  $('#tabs').innerHTML = `<div class="in">${tab('home', 'Home', 'home')}${tab('inbox', 'Inbox', 'inbox', held)}${tab('money', 'Money', 'money', pending)}${tab('family', 'Family', 'family')}${tab('settings', 'Settings', 'gear')}</div>`;
}

/* ---------- sign in ---------- */
function signinView() {
  const q = new URLSearchParams(location.search).get('signin');
  const note = q === 'expired' ? '<p class="banner warn">That sign-in link expired. Send a new one.</p>' : '';
  return {html: `<div class="welcome">
    <span class="lamp">${ICON.lamp}</span>
    <h1>Your family’s AI assistant</h1>
    <p class="muted">Check-ins, messages from tutors and teachers, and kids’ spending in one place. Sign in with your email; no password.</p>
    ${note}
    <form class="card" id="signinForm" data-form="signin">
      <label class="f">Email<input type="email" id="si-email" autocomplete="email" required placeholder="you@example.com"></label>
      <input type="text" name="website" id="si-website" tabindex="-1" autocomplete="off" hidden>
      <button class="primary" type="submit">Email me a sign-in link</button>
      <p class="small muted" id="si-out" role="status"></p>
    </form>
    <button class="ghost" data-act="tryDemo">Try the demo first</button></div>`};
}

/* ---------- setup ---------- */
function setupView() {
  const step = ui.step;
  const dots = `<div class="steps">${[1, 2, 3, 4].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
  if (step === 0) {
    return {html: `<div class="welcome">
      <span class="lamp">${ICON.lamp}</span>
      <h1>Hi, I’m FamGenie</h1>
      <p class="muted">I keep track of where your kids are, collect messages from the people around them, and handle their money requests, so you only step in when it matters.</p>
      <ul class="promise">
        <li>${avatar({name: '1', tint: TINTS[0]}, 28)}<span><b>Know they got there</b><span class="muted small">Check-ins, school attendance, tags and watches in one status.</span></span></li>
        <li>${avatar({name: '2', tint: TINTS[1]}, 28)}<span><b>One inbox for everyone</b><span class="muted small">Tutors, teachers, coaches and parent groups text one family number.</span></span></li>
        <li>${avatar({name: '3', tint: TINTS[2]}, 28)}<span><b>Kids ask, you approve</b><span class="muted small">Pay with Venmo, Zelle, PayPal or their card, and see every dollar by month.</span></span></li>
      </ul>
      <button class="primary wide" data-act="setupNext">Set up my family · 3 minutes</button>
      <button class="ghost wide" data-act="loadSample">Explore with a sample family</button></div>`};
  }
  if (step === 1) {
    const p = D.family.parent;
    return {bar: `<span class="title">About you</span>`, html: `${dots}
      <div class="hello"><h1>First, about you</h1><p class="muted">Kids see this name when FamGenie texts them for you.</p></div>
      <form class="card" data-form="parent" id="parentForm">
        <label class="f">Your name<input id="p-name" value="${esc(p.name)}" required autocomplete="name" placeholder="Dana Reyes"></label>
        <label class="f">Kids call you<select id="p-rel">${['Mom', 'Dad', 'Grandma', 'Grandpa', 'Guardian', 'Other'].map((r) => `<option ${p.relationship === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <label class="f">Your mobile <span class="hint">For alerts like "Maya asked for $40" or "Leo needs a ride"</span><input id="p-phone" type="tel" value="${esc(prettyPhone(p.phone))}" autocomplete="tel" placeholder="(312) 555-0100"></label>
        <button class="primary" type="submit">Next: add your kids</button>
      </form>`};
  }
  if (step === 2) {
    return {bar: `<span class="title">Your kids</span>`, html: `${dots}
      <div class="hello"><h1>Add your kids</h1><p class="muted">A photo makes their card easy to spot. You can change anything later.</p></div>
      <div class="list">${D.family.kids.map((k) => `<button class="item" data-act="editKid" data-id="${k.id}">${avatar(k, 44)}<span class="body"><span class="t">${esc(k.name)}${ageText(k) ? ', ' + ageText(k) : ''}</span><span class="s">${esc([k.grade, k.school].filter(Boolean).join(' · ') || DEVICES[k.device])}</span></span><span class="r">Edit</span></button>`).join('') || '<p class="empty">No kids added yet.</p>'}</div>
      <button data-act="addKid">+ Add a child</button>
      <div class="row-actions"><button class="ghost" data-act="setupBack">Back</button><span style="flex:1"></span><button class="primary" data-act="setupNext" ${D.family.kids.length ? '' : 'disabled'}>Next: their people</button></div>`};
  }
  if (step === 3) {
    return {bar: `<span class="title">Their people</span>`, html: `${dots}
      <div class="hello"><h1>Who’s around your kids?</h1><p class="muted">Tutors, teachers, coaches, sitters and parent groups. Their texts land in your FamGenie inbox, and you choose who can reach you.</p></div>
      ${D.family.kids.map((k) => {
        const cs = D.family.contacts.filter((c) => c.kidIds.includes(k.id));
        return `<section><div class="sec-head"><h2>${esc(k.name)}</h2><button class="ghost small" data-act="addContact" data-kid="${k.id}">+ Add</button></div>
          <div class="list">${cs.map(contactItem).join('') || `<p class="empty">No one yet for ${esc(k.name)}.</p>`}</div></section>`;
      }).join('')}
      <div class="row-actions"><button data-act="importContacts">Import from phone contacts</button></div>
      <div class="row-actions"><button class="ghost" data-act="setupBack">Back</button><span style="flex:1"></span><button class="primary" data-act="setupNext">Next: location</button></div>`};
  }
  return {bar: `<span class="title">Staying in touch</span>`, html: `${dots}
    <div class="hello"><h1>How should I know where they are?</h1><p class="muted">I picked sensible options for each child’s age and phone. Turn any off.</p></div>
    ${D.family.kids.map((k) => `<section class="card"><div class="kid-top">${avatar(k, 40)}<div><h3>${esc(k.name)}</h3><p class="small muted">${esc(DEVICES[k.device])}</p></div></div>${methodToggles(k)}</section>`).join('')}
    <div class="row-actions"><button class="ghost" data-act="setupBack">Back</button><span style="flex:1"></span><button class="primary" data-act="setupDone">Finish setup</button></div>`};
}

function methodToggles(k) {
  return METHODS.map((m) => {
    const blocked = methodBlocked(m, k);
    const on = k.methods.includes(m.id) && !blocked;
    return `<div class="toggle-row"><div class="body"><strong>${esc(m.name)} <span class="badge ${m.kind === 'direct' ? 'good' : m.kind === 'auto' ? 'gold' : m.kind === 'partner' ? 'warn' : ''}">${KIND_LABEL[m.kind]}</span></strong>
      <span class="small muted">${esc(blocked || m.how)}</span>${m.caveat && !blocked ? `<span class="small muted">${esc(m.caveat)}</span>` : ''}</div>
      <label class="switch"><input type="checkbox" id="m-${k.id}-${m.id}" data-method="${m.id}" data-kid="${k.id}" ${on ? 'checked' : ''} ${blocked ? 'disabled' : ''} aria-label="${esc(m.name)} for ${esc(k.name)}"><span></span></label></div>`;
  }).join('');
}
function contactItem(c) {
  const app = c.route === 'external' ? EXTERNAL_APPS[c.externalApp]?.name : '';
  const note = !c.allow ? 'Messages held' : app ? `Uses ${app}` : c.kind === 'group' ? `${(c.members || []).length} members` : prettyPhone(c.phone);
  return `<button class="item" data-act="editContact" data-id="${c.id}">${avatar(c, 40, c.kind === 'group')}<span class="body"><span class="t">${esc(c.name)}</span><span class="s">${esc(c.role)} · ${esc(note)}</span></span>
    ${!c.allow ? '<span class="badge warn">Held</span>' : app ? '<span class="badge">External</span>' : ''}</button>`;
}

/* ---------- home ---------- */
function homeView() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const pending = D.money.filter((m) => m.kind === 'request' && m.status === 'pending');
  const held = threads().filter((t) => t.info.held);
  const help = D.family.kids.filter((k) => ['warn'].includes(kidStatus(k).cls));
  const waiting = D.family.kids.filter((k) => kidStatus(k).cls === 'wait');
  const items = [
    ...help.map((k) => `<li><span><b>${esc(k.name)}</b>: ${esc(kidStatus(k).head.toLowerCase())}.</span>${hasPhone(k) ? `<button data-act="checkin" data-id="${k.id}">Check in</button>` : ''}</li>`),
    ...pending.slice(0, 3).map((m) => `<li><span><b>${esc(kidById(m.kidId)?.name || '')}</b> asked for ${fmtMoney(m.amountCents)}${m.payee ? ' to ' + esc(m.payee) : ''} (${esc(m.category)}).</span><button class="primary" data-act="pay" data-id="${m.id}">Review</button></li>`),
    ...waiting.map((k) => `<li><span>Waiting on <b>${esc(k.name)}</b>’s check-in.</span></li>`),
    ...(held.length ? [`<li><span>${held.length} message${held.length > 1 ? 's' : ''} held from people you haven’t allowed.</span><a class="btn" href="#inbox" data-act="heldTab">See</a></li>`] : []),
  ];
  const feed = [...D.signals].sort((a, b) => b.at - a.at).slice(0, 8);
  return {html: `
    <div class="hello"><p class="eyebrow">${new Date().toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'})}</p><h1>${greet}, ${esc(firstName())}</h1></div>
    <div class="genie"><span class="who">${ICON.spark} FamGenie</span>${items.length ? `<p>Here’s what needs you:</p><ul>${items.join('')}</ul>` : '<p>Nothing needs you right now. I’ll speak up if something changes.</p>'}</div>
    <section><div class="sec-head"><h2>Kids</h2><a class="small muted" href="#family">Manage</a></div>${D.family.kids.map(kidCard).join('')}</section>
    <section><h2>Today</h2><div class="list"><ul class="feed">${feed.map((s) => `<li><span class="mono">${fmtTime(s.at)}</span><span><b>${esc(kidById(s.kidId)?.name || '')}</b> · ${esc(s.text)}<span class="src">${esc(s.source)}</span></span></li>`).join('') || '<li class="empty" style="display:block">No activity yet.</li>'}</ul></div></section>`};
}
function kidCard(k) {
  const st = kidStatus(k);
  const acts = [];
  if (hasPhone(k) && (k.methods.includes('link') || k.methods.includes('reply'))) acts.push(`<button class="primary" data-act="checkin" data-id="${k.id}">Check in</button>`);
  if (k.methods.includes('tag') || k.methods.includes('watch') || !hasPhone(k)) acts.push(`<button data-act="logSeen" data-id="${k.id}">Log where I see them</button>`);
  if (hasPhone(k)) acts.push(`<a class="btn" href="#thread-k-${k.id}">Message</a>`);
  return `<article class="card kid"><a class="kid-top" href="#kid-${k.id}">${avatar(k, 52)}<div><h3>${esc(k.name)}${ageText(k) ? ', ' + ageText(k) : ''}</h3><p class="small muted">${esc([k.grade, k.school].filter(Boolean).join(' · '))}</p></div></a>
    <div class="status ${st.cls}"><span class="d"></span><div><strong>${esc(st.head)}</strong><span class="small muted">${esc(st.sub)}</span></div></div>
    <div class="row-actions">${acts.join('')}</div></article>`;
}

/* ---------- inbox ---------- */
function inboxView() {
  const all = threads();
  const list = all.filter((t) => (ui.inboxTab === 'held' ? t.info.held : !t.info.held));
  const heldN = all.filter((t) => t.info.held).length;
  return {bar: brandBar(`<button class="primary" data-act="newMessage">New</button>`), html: `
    <div class="hello"><h1>Inbox</h1><p class="muted">Everyone who texts your family number, in one place. People you haven’t allowed wait in Held.</p></div>
    <div class="seg" role="group" aria-label="Inbox filter"><button data-act="inboxTab" data-tab="inbox" aria-pressed="${ui.inboxTab === 'inbox'}">Inbox</button><button data-act="inboxTab" data-tab="held" aria-pressed="${ui.inboxTab === 'held'}">Held${heldN ? ` (${heldN})` : ''}</button></div>
    <div class="list">${list.map((t) => `<a class="item" href="#thread-${t.tid}">${t.info.av}<span class="body"><span class="t">${esc(t.info.title)}</span><span class="s">${t.last.dir === 'out' ? 'You: ' : ''}${esc(t.last.body)}</span></span><span class="r">${fmtTime(t.last.at)}<br><span class="small">${esc(t.info.sub.split(' · ')[0])}</span></span></a>`).join('')
      || `<p class="empty">${ui.inboxTab === 'held' ? 'Nothing held.' : 'No messages yet. When a tutor, teacher or coach texts your family number, it shows up here.'}</p>`}</div>`};
}
function threadView(tid) {
  const info = threadInfo(tid);
  if (!info) return {bar: backBar('Message', 'inbox'), html: '<p class="empty">This conversation isn’t available.</p>'};
  const msgs = D.messages.filter((m) => threadOf(m) === tid).sort((a, b) => a.at - b.at);
  const c = info.contact;
  let banner = '', composer = true;
  if (c && c.route === 'external') {
    const app = EXTERNAL_APPS[c.externalApp] || {name: 'their app', url: ''};
    banner = `<div class="banner plum"><span>${esc(c.name)} uses <b>${esc(app.name)}</b>, so messages with them happen there.</span>${app.url ? `<a class="btn" href="${esc(app.url)}" target="_blank" rel="noopener">Open ${esc(app.name)}</a>` : ''}<span class="small muted">Tip: ask the group to add your FamGenie number so updates land here too.</span></div>`;
    composer = false;
  } else if (info.held) {
    banner = c
      ? `<div class="banner warn"><span>You turned off messages from ${esc(c.name)}. New texts wait here and don’t notify you.</span><div class="row-actions"><button class="primary" data-act="allowContact" data-id="${c.id}">Allow messages</button></div></div>`
      : `<div class="banner warn"><span>This number isn’t in your contacts.</span><div class="row-actions"><button class="primary" data-act="addContact" data-phone="${esc(info.phone)}">Add as contact</button></div></div>`;
    composer = !!c;
  }
  if (c && c.kind === 'group' && c.route !== 'external') banner += `<p class="small muted">Messages to ${esc(c.name)} go out as separate texts to ${c.members.length} people. Replies come back only to you.</p>`;
  const right = c ? `<button class="ghost" data-act="editContact" data-id="${c.id}">Details</button>` : info.kid ? `<a class="btn ghost" href="#kid-${info.kid.id}">Profile</a>` : '';
  return {bar: backBar(info.title, 'inbox', right), html: `
    <div class="kid-top">${info.av}<div><h3>${esc(info.title)}</h3><p class="small muted">${esc(info.sub)}</p></div></div>
    ${banner}
    <div class="thread">${msgs.map((m) => `<div class="bubble ${m.dir === 'out' ? 'out' : ''}">${senderName(m) ? `<b class="small">${esc(senderName(m))}</b><br>` : ''}${esc(m.body)}<span class="meta">${fmtTime(m.at)}${m.dir === 'out' && m.status && m.status !== 'demo' ? ' · ' + esc(m.status) : ''}</span></div>`).join('') || '<p class="empty">No messages yet.</p>'}</div>
    ${composer ? `<form class="composer" data-form="send" data-tid="${esc(tid)}"><div class="in"><input id="composer" autocomplete="off" placeholder="Text ${esc(info.title)}" maxlength="600"><button class="primary" type="submit">Send</button></div></form><div style="height:56px"></div>` : ''}`};
}

/* ---------- money ---------- */
function moneyView() {
  const month = monthKey(Date.now());
  const t = tally(D.money, D.family.kids, month);
  const kidsShown = ui.moneyKid === 'all' ? D.family.kids : D.family.kids.filter((k) => k.id === ui.moneyKid);
  const spent = kidsShown.reduce((s, k) => s + t[k.id].spent, 0);
  const funded = kidsShown.reduce((s, k) => s + t[k.id].topups, 0);
  const pending = D.money.filter((m) => m.kind === 'request' && (m.status === 'pending' || m.status === 'approved') && kidsShown.some((k) => k.id === m.kidId));
  const activity = D.money.filter((m) => m.status !== 'pending' && m.status !== 'approved' && monthKey(m.paidAt || m.decidedAt || m.createdAt) === month && kidsShown.some((k) => k.id === m.kidId))
    .sort((a, b) => (b.paidAt || b.decidedAt || b.createdAt) - (a.paidAt || a.decidedAt || a.createdAt));
  const cats = {};
  for (const k of kidsShown) for (const [c, v] of Object.entries(t[k.id].byCategory)) cats[c] = (cats[c] || 0) + v;
  const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const monthName = new Date().toLocaleDateString([], {month: 'long'});
  return {bar: brandBar(`<button class="primary" data-act="record" data-kind="payment">Record</button>`), html: `
    <div class="hello"><h1>Money</h1><p class="muted">Kids ask, you approve, and you pay in your own Venmo, Zelle, PayPal or card app. FamGenie keeps the tally.</p></div>
    <div class="seg" role="group" aria-label="Whose money"><button data-act="moneyKid" data-id="all" aria-pressed="${ui.moneyKid === 'all'}">Everyone</button>${D.family.kids.map((k) => `<button data-act="moneyKid" data-id="${k.id}" aria-pressed="${ui.moneyKid === k.id}">${esc(k.name)}</button>`).join('')}</div>
    <div class="card"><p class="eyebrow">${esc(monthName)} spending</p><div class="bigmoney">${fmtMoney(spent)}</div>
      <p class="small muted">${fmtMoney(funded)} added to cards and allowances · ${pending.length} request${pending.length === 1 ? '' : 's'} waiting</p>
      ${kidsShown.map((k) => {
        const x = t[k.id]; const pct = x.budget ? Math.min(100, Math.round(x.spent / x.budget * 100)) : 0;
        return `<div style="display:grid;gap:6px"><div class="sec-head"><span style="display:flex;gap:8px;align-items:center">${avatar(k, 24)}<b>${esc(k.name)}</b></span><span class="small num">${fmtMoney(x.spent)}${x.budget ? ` of ${fmtMoney(x.budget)}` : ''}</span></div>
          ${x.budget ? `<div class="meter" role="img" aria-label="${pct}% of monthly budget"><i class="${pct >= 90 ? 'hot' : ''}" style="width:${pct}%"></i></div><span class="small muted">${x.left >= 0 ? fmtMoney(x.left) + ' left' : fmtMoney(-x.left) + ' over budget'}</span>` : '<span class="small muted">No monthly budget set</span>'}</div>`;
      }).join('')}
    </div>
    <section><div class="sec-head"><h2>Needs your OK</h2>${MODE === 'demo' ? '<button class="ghost small" data-act="kidPage" data-id="' + (D.family.kids.find((k) => k.methods.includes('hub'))?.id || '') + '">Try a kid’s request</button>' : ''}</div>
      ${pending.map(requestCard).join('') || '<p class="card empty">No requests waiting.</p>'}</section>
    ${catList.length ? `<section><h2>Where it went</h2><div class="list">${catList.map(([c, v]) => `<div class="item"><span class="body"><span class="t">${esc(c)}</span></span><span class="num">${fmtMoney(v)}</span></div>`).join('')}</div></section>` : ''}
    <section><div class="sec-head"><h2>Activity</h2><span class="row-actions"><button class="ghost small" data-act="record" data-kind="topup">Add funds</button><button class="ghost small" data-act="record" data-kind="allowance">Allowance</button></span></div>
      <div class="list">${activity.map(moneyItem).join('') || '<p class="empty">Nothing recorded this month.</p>'}</div></section>`};
}
function requestCard(m) {
  const k = kidById(m.kidId);
  const t = tally(D.money, D.family.kids, monthKey(Date.now()))[m.kidId];
  const after = t?.budget ? t.left - m.amountCents : null;
  return `<article class="card req"><div class="kid-top">${avatar(k, 40)}<div style="flex:1;min-width:0"><b>${esc(k?.name || '')}</b> <span class="muted small">${m.source === 'kid-text' ? 'by text' : m.source === 'kid-page' ? 'from their page' : ''} · ${fmtTime(m.createdAt)}</span>
      <div class="amt">${fmtMoney(m.amountCents)}${m.payee ? ` <span class="muted" style="font-size:15px;font-weight:600">to ${esc(m.payee)}</span>` : ''}</div></div>${m.status === 'approved' ? '<span class="badge gold">Approved</span>' : ''}</div>
    <p class="small">${esc(m.category)}${m.note ? ' · ' + esc(m.note) : ''}</p>
    ${after !== null ? `<p class="small ${after < 0 ? 'danger' : 'muted'}">After this: ${after >= 0 ? fmtMoney(after) + ' left of ' + fmtMoney(t.budget) : fmtMoney(-after) + ' over this month’s budget'}</p>` : ''}
    <div class="row-actions"><button class="primary" data-act="pay" data-id="${m.id}">${m.status === 'approved' ? 'Finish paying' : 'Approve & pay'}</button><button data-act="decline" data-id="${m.id}">Decline</button></div></article>`;
}
function moneyItem(m) {
  const k = kidById(m.kidId);
  const label = m.kind === 'topup' ? 'Added to card' : m.kind === 'allowance' ? 'Allowance' : m.payee || m.category;
  const sign = m.status === 'declined' ? '' : m.kind === 'topup' || m.kind === 'allowance' ? '+' : '';
  return `<div class="item">${avatar(k, 34)}<span class="body"><span class="t">${esc(label)}</span><span class="s">${esc(k?.name || '')} · ${esc(m.category)}${m.method ? ' · ' + esc(PAY_METHODS[m.method] || m.method) : ''}${m.note ? ' · ' + esc(m.note) : ''}</span></span>
    <span class="r"><span class="num" style="color:var(--ink);font-weight:600">${m.status === 'declined' ? '<s>' + fmtMoney(m.amountCents) + '</s>' : sign + fmtMoney(m.amountCents)}</span><br>${m.status === 'declined' ? 'Declined' : fmtTime(m.paidAt || m.createdAt)}</span></div>`;
}

/* ---------- family ---------- */
function familyView() {
  const p = D.family.parent;
  const byRole = ROLES.map((r) => [r, D.family.contacts.filter((c) => c.role === r)]).filter(([, cs]) => cs.length);
  return {bar: brandBar(), html: `
    <div class="hello"><h1>Family</h1></div>
    <section><div class="list"><button class="item" data-act="editParent">${avatar({name: p.name, tint: 'var(--gold-soft)'}, 44)}<span class="body"><span class="t">${esc(p.name)}</span><span class="s">${esc(p.relationship)} · ${esc(prettyPhone(p.phone) || 'No mobile yet')}</span></span><span class="r">Edit</span></button></div></section>
    <section><div class="sec-head"><h2>Kids</h2><button class="ghost small" data-act="addKid">+ Add</button></div>
      <div class="list">${D.family.kids.map((k) => `<a class="item" href="#kid-${k.id}">${avatar(k, 44)}<span class="body"><span class="t">${esc(k.name)}${ageText(k) ? ', ' + ageText(k) : ''}</span><span class="s">${esc([k.grade, k.school].filter(Boolean).join(' · ') || DEVICES[k.device])}</span></span><span class="r">${k.methods.length} on</span></a>`).join('')}</div></section>
    <section><div class="sec-head"><h2>People</h2><span class="row-actions"><button class="ghost small" data-act="importContacts">Import</button><button class="ghost small" data-act="addContact">+ Add</button></span></div>
      ${byRole.map(([r, cs]) => `<p class="eyebrow">${esc(r)}</p><div class="list">${cs.map(contactItem).join('')}</div>`).join('') || '<p class="card empty">Add tutors, teachers, coaches and parent groups so their texts reach your inbox.</p>'}</section>
    <section><div class="sec-head"><h2>Saved places</h2><button class="ghost small" data-act="addPlace">+ Add</button></div>
      <div class="list">${D.family.places.map((pl) => `<button class="item" data-act="editPlace" data-id="${pl.id}"><span class="body"><span class="t">${esc(pl.name)}</span><span class="s mono">${pl.lat.toFixed(4)}, ${pl.lon.toFixed(4)} · ${pl.radius} m</span></span><span class="r">Edit</span></button>`).join('') || '<p class="empty">Add home, school and practice so check-ins say "At Lincoln High" instead of coordinates.</p>'}</div></section>`};
}
function kidView(id) {
  const k = kidById(id);
  if (!k) return {bar: backBar('Child', 'family'), html: '<p class="empty">This child isn’t in your family.</p>'};
  const st = kidStatus(k);
  const t = tally(D.money, D.family.kids, monthKey(Date.now()))[k.id];
  const cs = D.family.contacts.filter((c) => c.kidIds.includes(k.id));
  const sig = D.signals.filter((s) => s.kidId === k.id).sort((a, b) => b.at - a.at).slice(0, 6);
  const origin = location.origin;
  const links = MODE === 'live' ? `
    ${k.methods.includes('hub') ? `<div class="card"><h3>${esc(k.name)}’s page</h3><p class="small muted">A private page to check in or ask for money. Text it once; they save it to their home screen.</p>
      <div class="handle"><code>${esc(origin)}/k/${esc(k.hubToken)}</code><button class="ghost small" data-act="copy" data-text="${esc(origin)}/k/${esc(k.hubToken)}">Copy</button></div>
      ${hasPhone(k) ? `<button data-act="textHub" data-id="${k.id}">Text it to ${esc(k.name)}</button>` : ''}</div>` : ''}
    ${k.methods.includes('shortcut') ? `<div class="card"><h3>Phone automation</h3><p class="small muted">In Shortcuts: Automation → Arrive (or Leave) → pick the place → "Get contents of URL", method POST, JSON body <span class="mono">{"event":"arrive","place":"Lincoln High"}</span>.</p>
      <div class="handle"><code>${esc(origin)}/hooks/arrive/${esc(k.hookToken)}</code><button class="ghost small" data-act="copy" data-text="${esc(origin)}/hooks/arrive/${esc(k.hookToken)}">Copy</button></div></div>` : ''}`
    : (k.methods.includes('hub') ? `<div class="card"><h3>${esc(k.name)}’s page</h3><p class="small muted">In the live app, ${esc(k.name)} gets a private link to check in and ask for money.</p><button data-act="kidPage" data-id="${k.id}">Preview ${esc(k.name)}’s page</button></div>` : '');
  return {bar: backBar(k.name, 'family', `<button class="ghost" data-act="editKid" data-id="${k.id}">Edit</button>`), html: `
    <div class="kid-top">${avatar(k, 72)}<div><h1>${esc(k.name)}${ageText(k) ? ', ' + ageText(k) : ''}</h1><p class="muted">${esc([k.grade, k.school].filter(Boolean).join(' · '))}</p><p class="small muted">${esc(DEVICES[k.device])}${k.phone ? ' · ' + esc(prettyPhone(k.phone)) : ''}</p></div></div>
    <div class="status ${st.cls}"><span class="d"></span><div><strong>${esc(st.head)}</strong><span class="small muted">${esc(st.sub)}</span></div></div>
    <div class="row-actions">${hasPhone(k) && (k.methods.includes('link') || k.methods.includes('reply')) ? `<button class="primary" data-act="checkin" data-id="${k.id}">Check in</button>` : ''}<button data-act="logSeen" data-id="${k.id}">Log where I see them</button>${hasPhone(k) ? `<a class="btn" href="#thread-k-${k.id}">Message</a>` : ''}</div>
    <section><div class="sec-head"><h2>Recent</h2></div><div class="list"><ul class="feed">${sig.map((s) => `<li><span class="mono">${fmtTime(s.at)}</span><span>${esc(s.text)} <span class="badge ${CONF[s.confidence]?.[1] === 'warn' ? 'warn' : ''}">${esc(CONF[s.confidence]?.[0] || '')}</span><span class="src">${esc(s.source)}</span></span></li>`).join('') || '<li style="display:block" class="empty">Nothing yet.</li>'}</ul></div></section>
    <section><div class="sec-head"><h2>Money this month</h2><a class="small muted" href="#money" data-act="moneyKid" data-id="${k.id}">Details</a></div>
      <div class="card"><div class="sec-head"><span class="bigmoney" style="font-size:26px">${fmtMoney(t.spent)}</span><span class="small muted">${t.budget ? `of ${fmtMoney(t.budget)} budget` : 'No budget set'}</span></div>
      ${k.card ? `<p class="small muted">Card: ${esc(k.card.label || CARD_PROVIDERS[k.card.provider]?.name)}</p>` : ''}
      <div class="row-actions"><button data-act="record" data-kind="payment" data-kid="${k.id}">Record payment</button><button data-act="record" data-kind="topup" data-kid="${k.id}">Add funds</button></div></div></section>
    <section><div class="sec-head"><h2>People</h2><button class="ghost small" data-act="addContact" data-kid="${k.id}">+ Add</button></div><div class="list">${cs.map(contactItem).join('') || '<p class="empty">No one yet.</p>'}</div></section>
    <section><div class="sec-head"><h2>Location options</h2></div><div class="card" style="gap:0">${methodToggles(k)}</div></section>
    ${links}`};
}

/* ---------- settings ---------- */
function settingsView() {
  const plan = D.family.plan || 'free';
  const plans = [['free', 'Free', '$0', 'Check-ins by text, family inbox, money tally for 1 child'],
    ['family', 'Family', '$9.99/mo', 'Unlimited check-ins and kid pages, inbox for every contact, money for all kids'],
    ['plus', 'Family Plus', '$17.99/mo', 'Everything, plus your own family number, co-parents and homework help']];
  return {bar: brandBar(), html: `
    <div class="hello"><h1>Settings</h1></div>
    <section><h2>Account</h2><div class="card">
      ${MODE === 'live' ? `<p>Signed in as <b>${esc(D.email)}</b></p><p class="small muted">Texting: ${D.sms === 'live' ? 'on' : D.sms === 'dry-run' ? 'test mode (texts are printed in the server log)' : 'not set up yet'}</p><button data-act="signout">Sign out</button>`
        : `<p><b>Demo mode.</b> Everything stays in this browser. Nothing is texted and no money moves.</p>${LIVE_OK ? '<button class="primary" data-act="goLive">Sign in to the real app</button>' : ''}<div class="row-actions"><button data-act="loadSample">Reload sample family</button><button class="danger" data-act="askReset">Start over empty</button></div>`}
    </div></section>
    <section><h2>Plan</h2><div class="list">${plans.map(([id, name, price, text]) => `<button class="item" data-act="plan" data-id="${id}"><span class="body"><span class="t">${name} · ${price}</span><span class="s" style="white-space:normal">${text}</span></span>${plan === id ? '<span class="badge gold">Current</span>' : ''}</button>`).join('')}</div>
      <p class="small muted">Proposed prices for the prototype; nothing is charged.</p></section>
    <section><h2>Messages live in FamGenie</h2><div class="card"><p class="small">Tutors, teachers and coaches text one family number and it all lands here, so you pay for one service instead of juggling five apps. For groups that only use ClassDojo, Remind, GroupMe or WhatsApp, mark the contact as "uses their own app" and FamGenie opens it for you.</p></div></section>
    <section><h2>How money works</h2><div class="card"><p class="small">FamGenie never holds or moves money. When you approve a request, it opens Venmo, PayPal or Cash App with the amount filled in, or shows the Zelle details, and you finish in your own app. Then you tap "Mark as paid" and it counts toward that child’s month.</p></div></section>`};
}

/* ---------- sheets ---------- */
function openSheet(name, args = {}, draft = {}) { ui.sheet = {name, args}; ui.draft = structuredClone(draft); renderSheet(); setTimeout(() => $('#sheet [autofocus]')?.focus(), 30); }
function closeSheet() { ui.sheet = null; ui.draft = {}; renderSheet(); }
function renderSheet() {
  const s = ui.sheet;
  $('#scrim').hidden = !s; $('#sheet').hidden = !s;
  if (!s) { $('#sheet').innerHTML = ''; return; }
  const b = SHEETS[s.name](s.args);
  $('#sheet').innerHTML = `<div class="in"><div class="grab"></div><div class="sheet-head"><h2>${esc(b.title)}</h2><button class="ghost" data-act="closeSheet">Close</button></div>${b.html}</div>`;
}
const field = (label, key, value, attrs = '', hint = '') => `<label class="f">${label}${hint ? ` <span class="hint">${hint}</span>` : ''}<input data-f="${key}" value="${esc(value ?? '')}" ${attrs}></label>`;
const selectF = (label, key, value, options) => `<label class="f">${label}<select data-f="${key}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;

const SHEETS = {
  kid() {
    const d = ui.draft;
    return {title: d.isNew ? 'Add a child' : `Edit ${d.name || 'child'}`, html: `
      <div class="photo-pick">${avatar(d, 72)}<div class="row-actions"><button data-act="pickPhoto">${d.photo ? 'Change photo' : 'Add photo'}</button>${d.photo ? '<button class="ghost" data-act="clearPhoto">Remove</button>' : ''}</div></div>
      ${field('First name', 'name', d.name, 'required maxlength="40" autofocus autocomplete="off"')}
      <div class="two">${field('Birthday', 'birthday', d.birthday, 'type="date"')}${field('Grade', 'grade', d.grade, 'maxlength="30" placeholder="9th grade"')}</div>
      ${field('School', 'school', d.school, 'maxlength="80" placeholder="Lincoln High School"')}
      ${selectF('Phone or device', 'device', d.device, Object.entries(DEVICES))}
      ${field('Their mobile number', 'phone', prettyPhone(d.phone), 'type="tel" placeholder="(312) 555-0142"', 'for check-ins and their money requests')}
      <div class="two">${field('Monthly budget ($)', 'budgetDollars', d.budgetDollars, 'inputmode="decimal" placeholder="150"')}
        ${selectF('Kid’s card', 'cardProvider', d.cardProvider, [['', 'None'], ...Object.entries(CARD_PROVIDERS).map(([k, v]) => [k, v.name])])}</div>
      <p class="small muted">${isAdultDraft(d) ? 'At 18+, location sharing is their choice. FamGenie only asks; it never tracks an adult.' : 'Location options are picked by age and phone. You can change them after saving.'}</p>
      <div class="row-actions">${d.isNew ? '' : '<button class="danger ghost" data-act="removeKid">Remove</button>'}<span style="flex:1"></span><button class="primary" data-act="saveKid">Save</button></div>`};
  },
  contact() {
    const d = ui.draft;
    const group = d.kind === 'group';
    return {title: d.isNew ? 'Add a contact' : `Edit ${d.name || 'contact'}`, html: `
      <div class="seg" role="group" aria-label="Contact type"><button data-act="contactKind" data-kind="person" aria-pressed="${!group}">Person</button><button data-act="contactKind" data-kind="group" aria-pressed="${group}">Group</button></div>
      ${field(group ? 'Group name' : 'Name', 'name', d.name, 'required maxlength="60" autofocus autocomplete="off"')}
      ${selectF('Role', 'role', d.role, ROLES.map((r) => [r, r]))}
      <div class="f"><span style="font-size:13.5px;font-weight:600">For</span><div class="kidpick">${D.family.kids.map((k) => `<label><input type="checkbox" data-kidpick="${k.id}" ${d.kidIds.includes(k.id) ? 'checked' : ''}>${esc(k.name)}</label>`).join('')}</div></div>
      ${group ? `<label class="f">Members <span class="hint">One per line: name, phone</span><textarea data-f="membersText" rows="4" placeholder="Jen (Ava's mom), 312 555 0171">${esc(d.membersText || '')}</textarea></label>`
        : `${field('Mobile', 'phone', prettyPhone(d.phone), 'type="tel" placeholder="(312) 555-0164"')}${field('Email', 'email', d.email, 'type="email" placeholder="name@example.com"')}`}
      <div class="toggle-row"><div class="body"><strong>Allow messages</strong><span class="small muted">Off: their texts wait in Held and don’t notify you.</span></div><label class="switch"><input type="checkbox" data-f="allow" ${d.allow ? 'checked' : ''} aria-label="Allow messages"><span></span></label></div>
      ${selectF('Where you talk', 'routeChoice', d.route === 'external' ? d.externalApp : 'app', [['app', 'In FamGenie (recommended)'], ...Object.entries(EXTERNAL_APPS).map(([k, v]) => [k, `They use ${v.name}`])])}
      ${!group ? `<details ${Object.values(d.pay || {}).some(Boolean) ? 'open' : ''}><summary class="small" style="font-weight:600;cursor:pointer">How to pay them (optional)</summary><div style="display:grid;gap:10px;margin-top:10px">
        <div class="two">${field('Venmo', 'pay.venmo', d.pay?.venmo, 'placeholder="@username"')}${field('Zelle', 'pay.zelle', d.pay?.zelle, 'placeholder="email or phone"')}</div>
        <div class="two">${field('PayPal.me', 'pay.paypal', d.pay?.paypal, 'placeholder="username"')}${field('Cash App', 'pay.cashapp', d.pay?.cashapp, 'placeholder="$cashtag"')}</div></div></details>` : ''}
      <div class="row-actions">${d.isNew ? '' : '<button class="danger ghost" data-act="removeContact">Remove</button>'}<span style="flex:1"></span><button class="primary" data-act="saveContact">Save</button></div>`};
  },
  importPick({list}) {
    return {title: 'Pick a contact', html: `<div class="list">${list.map((c, i) => `<button class="item" data-act="importOne" data-i="${i}">${avatar(c, 36)}<span class="body"><span class="t">${esc(c.name || 'No name')}</span><span class="s">${esc(prettyPhone(normPhone(c.phone)) || c.email || '')}</span></span></button>`).join('') || '<p class="empty">No contacts found in that file.</p>'}</div>`};
  },
  parent() {
    const d = ui.draft;
    return {title: 'About you', html: `${field('Your name', 'name', d.name, 'required autofocus')}
      ${selectF('Kids call you', 'relationship', d.relationship, ['Mom', 'Dad', 'Grandma', 'Grandpa', 'Guardian', 'Other'].map((r) => [r, r]))}
      ${field('Your mobile', 'phone', prettyPhone(d.phone), 'type="tel"', 'for alerts')}
      <button class="primary" data-act="saveParent">Save</button>`};
  },
  place() {
    const d = ui.draft;
    return {title: d.isNew ? 'Add a place' : `Edit ${d.name}`, html: `
      ${field('Name', 'name', d.name, 'required autofocus placeholder="Lincoln High"')}
      <div class="two">${field('Latitude', 'lat', d.lat, 'inputmode="decimal" placeholder="41.9180"')}${field('Longitude', 'lon', d.lon, 'inputmode="decimal" placeholder="-87.6440"')}</div>
      ${field('Radius (meters)', 'radius', d.radius, 'inputmode="numeric"', 'how close counts as "there"')}
      <p class="small muted">Tip: in Google Maps, long-press the spot and copy the numbers it shows.</p>
      <div class="row-actions">${d.isNew ? '' : '<button class="danger ghost" data-act="removePlace">Remove</button>'}<span style="flex:1"></span><button class="primary" data-act="savePlace">Save</button></div>`};
  },
  checkin({kidId}) {
    const k = kidById(kidId); const d = ui.draft;
    if (d.result) {
      const r = d.result;
      if (r.demo) return {title: `Sent to ${k.name}`, html: `<p class="muted">In the demo nothing is texted. See what ${esc(k.name)} gets:</p><button class="primary" data-act="openKidSim" data-id="${r.checkinId}">Open ${esc(k.name)}’s phone</button>`};
      return {title: `Sent to ${k.name}`, html: r.url ? `<p class="banner gold">Texting is in test mode, so nothing was sent. Open the link yourself to try it:</p><div class="handle"><code>${esc(r.url)}</code><button class="ghost small" data-act="copy" data-text="${esc(r.url)}">Copy</button></div>`
        : `<p>${r.how === 'link' ? `${esc(k.name)} got a one-time link. It expires in 15 minutes.` : `${esc(k.name)} can reply 1 (made it) or 2 (needs help).`} You’ll see the answer on Home.</p><button class="primary" data-act="closeSheet">Done</button>`};
    }
    const canLink = k.methods.includes('link') && ['iphone', 'android'].includes(k.device);
    const how = d.how || (canLink ? 'link' : 'reply');
    return {title: `Check in with ${k.name}`, html: `
      <div class="seg" role="group" aria-label="How">${canLink ? `<button data-act="ciHow" data-how="link" aria-pressed="${how === 'link'}">Share location link</button>` : ''}<button data-act="ciHow" data-how="reply" aria-pressed="${how === 'reply'}">Text reply (1 or 2)</button></div>
      ${field('Where should they be?', 'reason', d.reason, 'maxlength="60" placeholder="soccer practice" autofocus')}
      <div class="banner plum small" id="ci-preview">${ciPreview(k, how, d.reason)}</div>
      <p class="small muted">${how === 'link' ? 'One location reading, only if they tap. Nothing runs in the background.' : 'Works on any phone. Self-reported, so lower confidence.'}</p>
      <button class="primary" data-act="sendCheckin" data-id="${k.id}" data-how="${how}">Send</button>`};
  },
  kidSim({checkinId}) {
    const c = D.checkins.find((x) => x.id === checkinId); const k = kidById(c?.kidId);
    if (!c || !k) return {title: 'Check-in', html: '<p class="empty">Not found.</p>'};
    const done = c.usedAt;
    const body = c.how === 'link'
      ? (done ? `<p><b>Sent.</b> ${esc(asker())} can see it now.</p>` : `<b>${esc(asker())} is asking if you made it${c.reason ? ' to ' + esc(c.reason) : ''}</b><p class="small muted">Tapping share sends your location one time.</p>
         <label class="f">Pretend I’m at<select id="sim-place">${D.family.places.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
         <button class="primary" data-act="simAnswer" data-ans="share">Share my location once</button><button data-act="simAnswer" data-ans="here">I’m here, skip location</button><button data-act="simAnswer" data-ans="no">Not now</button>`)
      : (done ? `<p><b>Reply sent.</b></p>` : `<div class="kbub">Made it${c.reason ? ' to ' + esc(c.reason) : ''}? Reply 1 for yes, 2 if you need a ride or help.</div><div class="row-actions"><button class="primary" data-act="simAnswer" data-ans="1">Reply "1"</button><button data-act="simAnswer" data-ans="2">Reply "2"</button></div>`);
    return {title: `${k.name}’s phone (demo)`, html: `<div class="phonebox"><div class="scr">${body}</div></div>`};
  },
  kidPage({kidId}) {
    const k = kidById(kidId) || D.family.kids[0]; const d = ui.draft;
    const t = tally(D.money, D.family.kids, monthKey(Date.now()))[k.id];
    const payees = D.family.contacts.filter((c) => c.kind !== 'group' && c.kidIds.includes(k.id));
    return {title: `${k.name}’s page (demo)`, html: `<p class="small muted">This is what ${esc(k.name)} sees at their private link.</p><div class="phonebox"><div class="scr">
      <b style="font-size:17px">Hi ${esc(k.name)}</b>
      ${t.budget ? `<p class="small muted">Left this month: <b>${fmtMoney(t.left)}</b> of ${fmtMoney(t.budget)}</p>` : ''}
      <label class="f">Amount<input data-f="amount" value="${esc(d.amount || '')}" inputmode="decimal" placeholder="40.00"></label>
      <label class="f">Who gets paid<select data-f="contactId"><option value="">Someone else / me</option>${payees.map((c) => `<option value="${c.id}" ${d.contactId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="f">What for<select data-f="category">${CATEGORIES.map((c) => `<option ${d.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="f">Note<input data-f="note" value="${esc(d.note || '')}" placeholder="Thursday tutoring"></label>
      <button class="primary" data-act="simAsk" data-id="${k.id}">Send to ${esc(asker())}</button></div></div>
      <p class="small muted">Kids can also text the family number, like <span class="mono">PAY 40 Priya tutoring</span>.</p>`};
  },
  logSeen({kidId}) {
    const k = kidById(kidId); const d = ui.draft;
    const sources = [['Parent confirmed from tag app', 'Their tag app (AirTag, SmartTag, Tile)'], ['Parent confirmed from watch app', 'Their watch app'], ['Parent confirmed from live sharing', 'Find My / Maps sharing'], ['Parent confirmed in person', 'I saw them / talked to them']];
    return {title: `Where is ${k.name}?`, html: `<p class="small muted">Tag and watch apps don’t share with other apps, so check yours and log it here. It shows on ${esc(k.name)}’s status.</p>
      ${selectF('I checked', 'source', d.source, sources)}
      ${selectF('They’re at', 'placeId', d.placeId, [...D.family.places.map((p) => [p.id, p.name]), ['', 'Somewhere else…']])}
      ${!d.placeId ? field('Where', 'text', d.text, 'placeholder="Grandma’s house" maxlength="80"') : ''}
      <button class="primary" data-act="saveSeen" data-id="${k.id}">Log it</button>`};
  },
  record({kind}) {
    const d = ui.draft;
    const kidContacts = D.family.contacts.filter((c) => c.kind !== 'group' && (!d.kidId || c.kidIds.includes(d.kidId)));
    return {title: {payment: 'Record a payment', topup: 'Add funds to a card', allowance: 'Give allowance'}[kind], html: `
      <div class="seg" role="group" aria-label="Type">${[['payment', 'Payment'], ['topup', 'Card top-up'], ['allowance', 'Allowance']].map(([v, l]) => `<button data-act="recordKind" data-kind="${v}" aria-pressed="${kind === v}">${l}</button>`).join('')}</div>
      ${selectF('For', 'kidId', d.kidId, D.family.kids.map((k) => [k.id, k.name]))}
      ${field('Amount ($)', 'amount', d.amount, 'inputmode="decimal" placeholder="25.00" autofocus')}
      ${kind === 'payment' ? `${selectF('Paid to', 'contactId', d.contactId, [['', 'Someone else'], ...kidContacts.map((c) => [c.id, `${c.name} (${c.role})`])])}
        ${!d.contactId ? field('Name', 'payee', d.payee, 'placeholder="Campus bookstore"') : ''}
        ${selectF('Category', 'category', d.category, CATEGORIES.map((c) => [c, c]))}` : ''}
      ${kind === 'topup' && kidById(d.kidId)?.card ? `<p class="small muted">Add the money in ${esc(CARD_PROVIDERS[kidById(d.kidId).card.provider]?.name)}${CARD_PROVIDERS[kidById(d.kidId).card.provider]?.url ? `, <a href="${esc(CARD_PROVIDERS[kidById(d.kidId).card.provider].url)}" target="_blank" rel="noopener">open it</a>` : ''}, then save it here.</p>` : ''}
      ${selectF('Paid with', 'method', d.method, Object.entries(PAY_METHODS))}
      ${field('Note', 'note', d.note, 'maxlength="140" placeholder="Optional"')}
      <button class="primary" data-act="saveRecord" data-kind="${kind}">Save</button>`};
  },
  pay({id}) {
    const m = D.money.find((x) => x.id === id);
    if (!m) return {title: 'Request', html: '<p class="empty">Not found.</p>'};
    const k = kidById(m.kidId); const c = contactById(m.contactId); const pay = c?.pay || {};
    const note = `${k?.name || ''}: ${m.note || m.category}`;
    const opts = [];
    for (const meth of ['venmo', 'paypal', 'cashapp']) {
      const url = payLink(meth, pay[meth], m.amountCents, note);
      if (url) opts.push(`<a class="btn" href="${esc(url)}" target="_blank" rel="noopener" data-act="payOpen" data-method="${meth}"><b>${PAY_METHODS[meth]}</b><span class="small muted">${esc(pay[meth])}</span></a>`);
    }
    if (pay.zelle) opts.push(`<button data-act="payPick" data-method="zelle"><b>Zelle</b><span class="small muted">${esc(pay.zelle)}</span></button>`);
    if (k?.card) opts.push(`<button data-act="payPick" data-method="card"><b>Add to ${esc(k.name)}’s card</b></button>`);
    opts.push(`<button data-act="payPick" data-method="cash"><b>Cash</b></button>`, `<button data-act="payPick" data-method="other"><b>Other</b></button>`);
    const picked = ui.draft.method;
    return {title: `${fmtMoney(m.amountCents)} for ${k?.name || ''}`, html: `
      <p>${m.payee ? `To <b>${esc(m.payee)}</b> · ` : ''}${esc(m.category)}${m.note ? ' · ' + esc(m.note) : ''}</p>
      ${!c && m.payee ? `<p class="small muted">${esc(m.payee)} isn’t a saved contact, so there are no pay links. Pay however you like, then mark it paid.</p>` : ''}
      ${!picked ? `<p class="eyebrow">Pay with</p><div class="paygrid">${opts.join('')}</div>
        <p class="small muted">The amount is filled in where the app allows. FamGenie never moves money; you finish in your own app.</p>`
      : `<div class="banner gold"><span>${picked === 'zelle' ? `Send ${fmtMoney(m.amountCents)} by Zelle to <b>${esc(pay.zelle)}</b> in your bank’s app.` : picked === 'card' ? `Add ${fmtMoney(m.amountCents)} in ${esc(CARD_PROVIDERS[k.card.provider]?.name)}.` : `Pay ${fmtMoney(m.amountCents)} with ${esc(PAY_METHODS[picked])}.`} Then come back and mark it paid.</span>
          ${picked === 'zelle' ? `<div class="handle"><code>${esc(pay.zelle)}</code><button class="ghost small" data-act="copy" data-text="${esc(pay.zelle)}">Copy</button></div>` : ''}</div>
        <button class="primary" data-act="markPaid" data-id="${m.id}">Mark as paid</button><button class="ghost" data-act="payPick" data-method="">Pick another way</button>`}
      <button class="ghost danger" data-act="decline" data-id="${m.id}">Decline instead</button>`};
  },
  decline({id}) {
    const m = D.money.find((x) => x.id === id); const k = kidById(m?.kidId);
    return {title: `Decline ${fmtMoney(m?.amountCents || 0)}?`, html: `${field(`Tell ${esc(k?.name || 'them')} why (optional)`, 'note', ui.draft.note, 'maxlength="140" placeholder="Let’s talk about it tonight" autofocus')}
      <button class="primary" data-act="confirmDecline" data-id="${id}">Decline</button>`};
  },
  newMessage() {
    const people = [...D.family.contacts.filter((c) => c.route !== 'external').map((c) => ({tid: 'c-' + c.id, p: c, s: c.role, g: c.kind === 'group'})),
      ...D.family.kids.filter(hasPhone).map((k) => ({tid: 'k-' + k.id, p: k, s: 'Your child'}))];
    return {title: 'New message', html: `<div class="list">${people.map((x) => `<a class="item" href="#thread-${x.tid}" data-act="closeSheet">${avatar(x.p, 36, x.g)}<span class="body"><span class="t">${esc(x.p.name)}</span><span class="s">${esc(x.s)}</span></span></a>`).join('') || '<p class="empty">Add contacts first.</p>'}</div>`};
  },
  confirmReset() {
    return {title: 'Start over?', html: '<p>This clears the demo family in this browser.</p><button class="primary danger" data-act="doReset">Clear everything</button>'};
  },
};
function ciPreview(k, how, reason) {
  const to = reason ? ' to ' + esc(reason) : '';
  return `<b>${esc(k.name)} will get:</b> ` + (how === 'link'
    ? `"Hi ${esc(k.name)}, ${esc(asker())} is asking if you made it${to}. Tap to check in (works once, 15 min): …"`
    : `"Made it${to}? Reply 1 for yes, 2 if you need a ride or help."`);
}
function isAdultDraft(d) { return (ageOf(d.birthday) ?? 0) >= 18; }

/* ---------- photos and contacts import ---------- */
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
function parseVcf(text) {
  const out = [];
  for (const card of text.split(/END:VCARD/i)) {
    const lines = card.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    let name = '', phone = '', email = '';
    for (const line of lines) {
      const i = line.indexOf(':'); if (i < 0) continue;
      const key = line.slice(0, i).toUpperCase(), val = line.slice(i + 1).trim();
      if (key === 'FN' || key.startsWith('FN;')) name = val;
      else if (!name && (key === 'N' || key.startsWith('N;'))) name = val.split(';').filter(Boolean).reverse().join(' ');
      else if (!phone && (key === 'TEL' || key.startsWith('TEL;') || key.includes('.TEL'))) phone = val;
      else if (!email && (key === 'EMAIL' || key.startsWith('EMAIL;') || key.includes('.EMAIL'))) email = val;
    }
    if (name || phone) out.push({name: name.replace(/\\,/g, ','), phone, email});
  }
  return out.slice(0, 300);
}
async function importContacts(kidId) {
  ui.importKid = kidId || '';
  if ('contacts' in navigator && navigator.contacts && 'select' in navigator.contacts) {
    try {
      const picked = await navigator.contacts.select(['name', 'tel', 'email'], {multiple: true});
      const list = picked.map((c) => ({name: c.name?.[0] || '', phone: c.tel?.[0] || '', email: c.email?.[0] || ''}));
      if (list.length === 1) return startContact({kidId, preset: list[0]});
      if (list.length) return openSheet('importPick', {list});
      return;
    } catch (e) { /* fall through to a file */ }
  }
  const inp = $('#vcfInput'); inp.value = '';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const list = parseVcf(await f.text());
    if (list.length === 1) startContact({kidId, preset: list[0]}); else openSheet('importPick', {list});
  };
  toast('Pick a contact card (.vcf). On iPhone: Contacts → Share Contact → Save to Files.');
  inp.click();
}
function startContact({id, kidId, preset} = {}) {
  const c = id ? contactById(id) : null;
  const d = c ? structuredClone(c) : {id: uid(), kind: 'person', role: 'Tutor', name: preset?.name || '', phone: normPhone(preset?.phone || ''), email: preset?.email || '',
    kidIds: kidId ? [kidId] : D.family.kids.length === 1 ? [D.family.kids[0].id] : [], members: [], allow: true, route: 'app', externalApp: '', pay: {}, isNew: true};
  d.membersText = (d.members || []).map((m) => `${m.name}, ${prettyPhone(m.phone)}`).join('\n');
  d.pay ||= {};
  openSheet('contact', {}, d);
}
function startKid(id) {
  const k = id ? kidById(id) : null;
  const d = k ? structuredClone(k) : {id: uid(), name: '', birthday: '', school: '', grade: '', phone: '', device: 'iphone', photo: '', tint: TINTS[D.family.kids.length % TINTS.length], methods: [], monthlyBudget: 0, card: null, isNew: true};
  d.budgetDollars = d.monthlyBudget ? String(d.monthlyBudget / 100) : '';
  d.cardProvider = d.card?.provider || '';
  openSheet('kid', {}, d);
}

/* ---------- actions ---------- */
async function save(msg) {
  try { await backend().saveFamily(); if (msg) toast(msg); } catch (e) { toast(e.message); }
  render();
}
const ACTIONS = {
  closeSheet: () => closeSheet(),
  tryDemo: async () => { MODE = 'demo'; await demo.load(); if (needsSetup()) ui.step = 0; history.replaceState(null, '', location.pathname + '#home'); render(); },
  goLive: () => { location.href = location.pathname; },
  setupNext: () => { ui.step = Math.min(4, ui.step + 1); render(); window.scrollTo(0, 0); },
  setupBack: () => { ui.step = Math.max(0, ui.step - 1); render(); },
  setupDone: async () => { await save('All set. FamGenie is on it.'); location.hash = 'home'; render(); },
  loadSample: async () => {
    if (MODE !== 'demo') { MODE = 'demo'; }
    Object.assign(D, sampleFamily()); demo.persist(); ui.step = 0; location.hash = 'home'; render(); toast('Sample family loaded');
  },
  askReset: () => openSheet('confirmReset'),
  doReset: () => { Object.assign(D, {family: emptyFamily(), signals: [], messages: [], money: [], checkins: []}); demo.persist(); closeSheet(); ui.step = 0; location.hash = 'setup'; render(); },
  addKid: () => startKid(),
  editKid: (el) => startKid(el.dataset.id),
  pickPhoto: () => {
    const inp = $('#photoInput'); inp.value = '';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try { ui.draft.photo = await resizePhoto(f); renderSheet(); } catch (e) { toast('That photo couldn’t be read. Try a JPG or PNG.'); }
    };
    inp.click();
  },
  clearPhoto: () => { ui.draft.photo = ''; renderSheet(); },
  saveKid: async () => {
    const d = ui.draft;
    if (!d.name?.trim()) return toast('Add a first name.');
    const kid = {id: d.id, name: d.name.trim(), birthday: d.birthday || '', school: d.school || '', grade: d.grade || '', phone: normPhone(d.phone), device: d.device,
      photo: d.photo || '', tint: d.tint, monthlyBudget: toCents(d.budgetDollars), card: d.cardProvider ? {provider: d.cardProvider, label: `${d.name.trim()}’s ${CARD_PROVIDERS[d.cardProvider].name}`} : null,
      methods: d.methods || [], hubToken: d.hubToken, hookToken: d.hookToken};
    if (d.isNew || !kid.methods.length) kid.methods = defaultMethods(kid);
    else kid.methods = kid.methods.filter((m) => !methodBlocked(METHODS.find((x) => x.id === m), kid));
    const i = D.family.kids.findIndex((k) => k.id === kid.id);
    if (i >= 0) D.family.kids[i] = kid; else D.family.kids.push(kid);
    closeSheet(); await save(`${kid.name} saved`);
  },
  removeKid: async () => {
    const id = ui.draft.id;
    D.family.kids = D.family.kids.filter((k) => k.id !== id);
    D.family.contacts.forEach((c) => { c.kidIds = c.kidIds.filter((x) => x !== id); });
    closeSheet(); if (route().name === 'kid') location.hash = 'family'; await save('Removed');
  },
  addContact: (el) => startContact({kidId: el.dataset.kid, preset: el.dataset.phone ? {phone: el.dataset.phone} : null}),
  editContact: (el) => startContact({id: el.dataset.id}),
  importContacts: (el) => importContacts(el.dataset.kid),
  importOne: (el) => startContact({kidId: ui.importKid, preset: ui.sheet.args.list[+el.dataset.i]}),
  contactKind: (el) => { ui.draft.kind = el.dataset.kind; if (ui.draft.kind === 'group' && ui.draft.role !== 'School parents group') ui.draft.role = 'School parents group'; renderSheet(); },
  saveContact: async () => {
    const d = ui.draft;
    if (!d.name?.trim()) return toast('Add a name.');
    const members = d.kind === 'group' ? String(d.membersText || '').split('\n').map((line) => {
      const m = /^(.*?)[,\s]+(\+?[\d\s().-]{7,})\s*$/.exec(line.trim()); return m ? {name: m[1].trim(), phone: normPhone(m[2])} : null;
    }).filter(Boolean) : [];
    const route = d.routeChoice && d.routeChoice !== 'app' ? 'external' : (d.routeChoice === 'app' ? 'app' : d.route);
    const c = {id: d.id, kidIds: d.kidIds, role: d.role, kind: d.kind, name: d.name.trim(), phone: d.kind === 'group' ? '' : normPhone(d.phone), email: d.email || '',
      photo: d.photo || '', members, allow: !!d.allow, route, externalApp: route === 'external' ? (d.routeChoice in EXTERNAL_APPS ? d.routeChoice : d.externalApp) : '', pay: d.pay || {}};
    const i = D.family.contacts.findIndex((x) => x.id === c.id);
    if (i >= 0) D.family.contacts[i] = c; else D.family.contacts.push(c);
    closeSheet(); await save(`${c.name} saved`);
  },
  removeContact: async () => { D.family.contacts = D.family.contacts.filter((c) => c.id !== ui.draft.id); closeSheet(); await save('Removed'); },
  allowContact: async (el) => { const c = contactById(el.dataset.id); c.allow = true; await save(`Messages from ${c.name} allowed`); },
  editParent: () => openSheet('parent', {}, D.family.parent),
  saveParent: async () => { const d = ui.draft; if (!d.name?.trim()) return toast('Add your name.'); D.family.parent = {name: d.name.trim(), relationship: d.relationship, phone: normPhone(d.phone)}; closeSheet(); await save('Saved'); },
  addPlace: () => openSheet('place', {}, {id: uid(), name: '', lat: '', lon: '', radius: 150, isNew: true}),
  editPlace: (el) => openSheet('place', {}, placeById(el.dataset.id)),
  savePlace: async () => {
    const d = ui.draft; const lat = Number(d.lat), lon = Number(d.lon), radius = Math.max(25, Math.min(2000, Number(d.radius) || 150));
    if (!d.name?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || d.lat === '' || d.lon === '') return toast('Add a name, latitude and longitude.');
    const p = {id: d.id, name: d.name.trim(), lat, lon, radius};
    const i = D.family.places.findIndex((x) => x.id === p.id);
    if (i >= 0) D.family.places[i] = p; else D.family.places.push(p);
    closeSheet(); await save(`${p.name} saved`);
  },
  removePlace: async () => { D.family.places = D.family.places.filter((p) => p.id !== ui.draft.id); closeSheet(); await save('Removed'); },
  checkin: (el) => openSheet('checkin', {kidId: el.dataset.id}, {reason: ''}),
  ciHow: (el) => { ui.draft.how = el.dataset.how; renderSheet(); },
  sendCheckin: async (el) => {
    el.disabled = true;
    try { ui.draft.result = await backend().checkin(el.dataset.id, el.dataset.how, ui.draft.reason || ''); renderSheet(); render(); }
    catch (e) { toast(e.message); el.disabled = false; }
  },
  openKidSim: (el) => openSheet('kidSim', {checkinId: el.dataset.id}),
  simAnswer: (el) => {
    const c = D.checkins.find((x) => x.id === ui.sheet.args.checkinId); const a = el.dataset.ans;
    c.usedAt = Date.now(); c.result = a;
    if (a === 'share') { const p = placeById($('#sim-place')?.value); addSignal(c.kidId, p ? `At ${p.name}` : 'Shared a location', 'Check-in link', 'gps', p?.id || null); }
    if (a === 'here') addSignal(c.kidId, `Says they made it${c.reason ? ' to ' + c.reason : ''}`, 'Check-in link', 'self');
    if (a === 'no') addSignal(c.kidId, 'Chose "not now"', 'Check-in link', 'declined');
    if (a === '1') addSignal(c.kidId, 'Replied 1: made it', 'Text reply', 'self');
    if (a === '2') addSignal(c.kidId, 'Replied 2: needs a ride or help', 'Text reply', 'help');
    demo.persist(); renderSheet(); render(); toast('Home is updated');
  },
  kidPage: (el) => openSheet('kidPage', {kidId: el.dataset.id || D.family.kids[0]?.id}, {category: 'Tutoring'}),
  simAsk: async (el) => {
    const d = ui.draft;
    if (!toCents(d.amount)) return toast('Enter an amount, like 40.');
    await demo.money({op: 'request', kidId: el.dataset.id, amount: d.amount, contactId: d.contactId, category: d.category, note: d.note});
    closeSheet(); location.hash = 'money'; render(); toast(`Request from ${kidById(el.dataset.id).name} arrived`);
  },
  logSeen: (el) => openSheet('logSeen', {kidId: el.dataset.id}, {source: 'Parent confirmed from tag app', placeId: D.family.places[0]?.id || ''}),
  saveSeen: async (el) => {
    const d = ui.draft;
    if (!d.placeId && !d.text?.trim()) return toast('Say where they are.');
    try { await backend().logSeen(el.dataset.id, d.source, d.placeId, d.text || ''); closeSheet(); render(); toast('Logged'); } catch (e) { toast(e.message); }
  },
  inboxTab: (el) => { ui.inboxTab = el.dataset.tab; render(); },
  heldTab: () => { ui.inboxTab = 'held'; },
  newMessage: () => openSheet('newMessage'),
  textHub: async (el) => {
    const k = kidById(el.dataset.id);
    try { await backend().send('k-' + k.id, `Here’s your FamGenie page to check in or ask for money: ${location.origin}/k/${k.hubToken} Save it to your home screen. Don’t share it.`); toast(`Sent to ${k.name}`); render(); } catch (e) { toast(e.message); }
  },
  copy: (el) => copy(el.dataset.text),
  moneyKid: (el) => { ui.moneyKid = el.dataset.id; if (route().name !== 'money') location.hash = 'money'; else render(); },
  record: (el) => openSheet('record', {kind: el.dataset.kind}, {kidId: el.dataset.kid || (ui.moneyKid !== 'all' ? ui.moneyKid : D.family.kids[0]?.id), category: 'Tutoring', method: el.dataset.kind === 'topup' ? 'card' : 'venmo', amount: '', contactId: ''}),
  recordKind: (el) => { ui.sheet.args.kind = el.dataset.kind; renderSheet(); },
  saveRecord: async (el) => {
    const d = ui.draft;
    if (!toCents(d.amount)) return toast('Enter an amount, like 25 or 25.50.');
    try { await backend().money({op: 'record', kind: el.dataset.kind, kidId: d.kidId, amount: d.amount, contactId: d.contactId, payee: d.payee, category: d.category, method: d.method, note: d.note}); closeSheet(); render(); toast('Recorded'); }
    catch (e) { toast(e.message); }
  },
  pay: (el) => { location.hash = 'money'; openSheet('pay', {id: el.dataset.id}, {}); },
  payOpen: async (el) => {
    const m = D.money.find((x) => x.id === ui.sheet.args.id);
    ui.draft.method = el.dataset.method;
    if (m.status === 'pending') { try { await backend().money({op: 'approve', id: m.id, method: el.dataset.method}); } catch (e) { toast(e.message); } }
    renderSheet(); render();
  },
  payPick: async (el) => {
    const m = D.money.find((x) => x.id === ui.sheet.args.id);
    ui.draft.method = el.dataset.method;
    if (el.dataset.method && m.status === 'pending') { try { await backend().money({op: 'approve', id: m.id, method: el.dataset.method}); } catch (e) { toast(e.message); } }
    renderSheet(); render();
  },
  markPaid: async (el) => {
    try { await backend().money({op: 'paid', id: el.dataset.id, method: ui.draft.method}); closeSheet(); render(); toast('Marked as paid'); } catch (e) { toast(e.message); }
  },
  decline: (el) => openSheet('decline', {id: el.dataset.id}, {note: ''}),
  confirmDecline: async (el) => {
    try { await backend().money({op: 'decline', id: el.dataset.id, note: ui.draft.note}); closeSheet(); render(); toast('Declined'); } catch (e) { toast(e.message); }
  },
  plan: async (el) => { D.family.plan = el.dataset.id; await save('Plan updated (demo, nothing charged)'); },
  signout: async () => { try { await fetch('/api/auth/logout', {method: 'POST'}); } catch (e) { /* offline */ } MODE = 'signin'; render(); },
};

/* ---------- events ---------- */
function setPath(obj, path, val) {
  const keys = path.split('.'); let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ||= {});
  o[keys[keys.length - 1]] = val;
}
const RERENDER = new Set(['device', 'birthday', 'contactId', 'placeId', 'kidId']);
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.id === 'scrim') closeSheet(); return; }
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'BUTTON' || (el.tagName === 'A' && el.getAttribute('href')?.startsWith('#') && el.dataset.act !== 'moneyKid' && el.dataset.act !== 'heldTab' && el.dataset.act !== 'closeSheet')) e.preventDefault();
  fn(el);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.f && ui.sheet) {
    setPath(ui.draft, t.dataset.f, t.type === 'checkbox' ? t.checked : t.value);
    if (RERENDER.has(t.dataset.f) && t.tagName === 'SELECT') renderSheet();
    if (t.dataset.f === 'reason' && ui.sheet.name === 'checkin') {
      const k = kidById(ui.sheet.args.kidId), b = $('#ci-preview');
      if (k && b) b.innerHTML = ciPreview(k, $('#sheet [data-act="sendCheckin"]')?.dataset.how || 'link', t.value);
    }
  }
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.f && ui.sheet) {
    setPath(ui.draft, t.dataset.f, t.type === 'checkbox' ? t.checked : t.value);
    if (RERENDER.has(t.dataset.f)) renderSheet();
  }
  if (t.dataset.kidpick) {
    const id = t.dataset.kidpick;
    ui.draft.kidIds = t.checked ? [...new Set([...ui.draft.kidIds, id])] : ui.draft.kidIds.filter((x) => x !== id);
  }
  if (t.dataset.method && t.dataset.kid) {
    const k = kidById(t.dataset.kid);
    k.methods = t.checked ? [...new Set([...k.methods, t.dataset.method])] : k.methods.filter((m) => m !== t.dataset.method);
    if (route().name === 'setup' || needsSetup()) { if (MODE === 'demo') demo.persist(); }
    else await save(`${METHODS.find((m) => m.id === t.dataset.method).name} ${t.checked ? 'on' : 'off'} for ${k.name}`);
  }
});
document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'parent') {
    const name = $('#p-name').value.trim(); if (!name) return toast('Add your name.');
    D.family.parent = {name, relationship: $('#p-rel').value, phone: normPhone($('#p-phone').value)};
    if (MODE === 'live') { try { await live.saveFamily(); } catch (err) { return toast(err.message); } } else demo.persist();
    ui.step = 2; render();
  }
  if (f.dataset.form === 'send') {
    const input = $('#composer'); const text = input.value.trim(); if (!text) return;
    input.disabled = true;
    try { await backend().send(f.dataset.tid, text); render(); $('#composer')?.focus(); window.scrollTo(0, document.body.scrollHeight); }
    catch (err) { toast(err.message); input.disabled = false; }
  }
  if (f.dataset.form === 'signin') {
    const out = $('#si-out'); const btn = f.querySelector('button');
    btn.disabled = true; out.textContent = 'Sending…';
    try {
      const r = await fetch('/api/auth/start', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: $('#si-email').value, website: $('#si-website').value})});
      const j = await r.json().catch(() => ({}));
      out.textContent = r.ok ? 'Check your email for a sign-in link. It works once, for 15 minutes.' : (j.error || 'That didn’t work. Try again.');
    } catch (err) { out.textContent = 'You seem to be offline. Try again.'; }
    btn.disabled = false;
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });
window.addEventListener('hashchange', () => { if (ui.sheet && ui.sheet.name !== 'pay') closeSheet(); render(); window.scrollTo(0, 0); });

/* ---------- start ---------- */
async function start() {
  try {
    const r = await fetch('/api/me', {credentials: 'same-origin'});
    const me = r.ok ? await r.json() : null;
    if (me && me.available) {
      LIVE_OK = true;
      if (me.email) { MODE = 'live'; await live.load(); }
      else MODE = 'signin';
    }
  } catch (e) { /* no API here: demo */ }
  if (MODE === 'loading') {
    MODE = 'demo';
    await demo.load();
    if (needsSetup()) { Object.assign(D, sampleFamily()); demo.persist(); }
  }
  if (MODE !== 'signin' && needsSetup()) { ui.step = D.family.parent.name ? 2 : 0; }
  render();
  if (MODE === 'live') {
    setInterval(async () => {
      if (document.hidden || ui.sheet || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      try { await live.load(); render(); } catch (e) { /* next time */ }
    }, 15000);
  }
}
start();
