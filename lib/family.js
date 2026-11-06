/* Cleans the family record a parent saves, and keeps the phone and kid-link lookups in step with it. */
import {METHOD_IDS, DEVICES, ROLES, EXTERNAL_APPS, CARD_PROVIDERS, normPhone, validTz, DEFAULT_TZ} from '../public/assets/shared.js';
import {randomToken, sha256} from './server.js';

const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const validId = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(v) ? v : '');
const newClientId = () => randomToken(9);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const photo = (v) => (typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 350000 ? v : '');
const tint = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : '');
const cents = (v) => (Number.isInteger(v) && v >= 0 && v <= 10000000 ? v : 0);
const handle = (v) => str(v, 80).replace(/[<>"']/g, '');

export function sanitizeFamily(input, prev) {
  const p = input?.parent || {};
  const prevKids = new Map((prev?.kids || []).map((k) => [k.id, k]));
  const kids = (Array.isArray(input?.kids) ? input.kids : []).slice(0, 12).map((k) => {
    const id = validId(k.id) || newClientId();
    const old = prevKids.get(id);
    return {
      id, name: str(k.name, 40), birthday: /^\d{4}-\d{2}-\d{2}$/.test(k.birthday || '') ? k.birthday : '',
      school: str(k.school, 80), grade: str(k.grade, 30), phone: normPhone(k.phone),
      device: k.device in DEVICES ? k.device : 'none', photo: photo(k.photo), tint: tint(k.tint),
      methods: [...new Set((Array.isArray(k.methods) ? k.methods : []).filter((m) => METHOD_IDS.includes(m)))],
      monthlyBudget: cents(k.monthlyBudget),
      card: k.card && k.card.provider in CARD_PROVIDERS ? {provider: k.card.provider, label: str(k.card.label, 40)} : null,
      // Secret links stay server-issued; a client can't choose them.
      hubToken: old?.hubToken || randomToken(18), hookToken: old?.hookToken || randomToken(18),
    };
  }).filter((k) => k.name);
  const kidIds = new Set(kids.map((k) => k.id));
  const contacts = (Array.isArray(input?.contacts) ? input.contacts : []).slice(0, 200).map((c) => ({
    id: validId(c.id) || newClientId(),
    kidIds: (Array.isArray(c.kidIds) ? c.kidIds : []).filter((x) => kidIds.has(x)),
    role: ROLES.includes(c.role) ? c.role : 'Other', kind: c.kind === 'group' ? 'group' : 'person',
    name: str(c.name, 60), phone: normPhone(c.phone), email: str(c.email, 120), photo: photo(c.photo),
    members: c.kind === 'group' ? (Array.isArray(c.members) ? c.members : []).slice(0, 60)
      .map((m) => ({name: str(m.name, 60), phone: normPhone(m.phone)})).filter((m) => m.phone) : [],
    allow: c.allow !== false, route: c.route === 'external' ? 'external' : 'app',
    externalApp: c.externalApp in EXTERNAL_APPS ? c.externalApp : '',
    pay: {venmo: handle(c.pay?.venmo), zelle: handle(c.pay?.zelle), paypal: handle(c.pay?.paypal), cashapp: handle(c.pay?.cashapp)},
  })).filter((c) => c.name);
  const places = (Array.isArray(input?.places) ? input.places : []).slice(0, 50).map((pl) => ({
    id: validId(pl.id) || newClientId(), name: str(pl.name, 60),
    lat: num(pl.lat, -90, 90), lon: num(pl.lon, -180, 180), radius: num(pl.radius, 25, 2000) ?? 150,
  })).filter((pl) => pl.name && pl.lat !== null && pl.lon !== null);
  const placeIds = new Set(places.map((pl) => pl.id));
  const hhmm = (v) => (typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? v.padStart(5, '0') : '');
  const schedule = (Array.isArray(input?.schedule) ? input.schedule : []).slice(0, 80).map((x) => ({
    id: validId(x.id) || newClientId(), kidIds: (Array.isArray(x.kidIds) ? x.kidIds : []).filter((k) => kidIds.has(k)), title: str(x.title, 60),
    days: [...new Set((Array.isArray(x.days) ? x.days : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
    start: hhmm(x.start), end: hhmm(x.end), placeId: placeIds.has(x.placeId) ? x.placeId : '',
  })).filter((x) => x.title && x.kidIds.length && x.days.length && x.start && x.end);
  const calendars = (Array.isArray(input?.calendars) ? input.calendars : []).slice(0, 20).map((c) => ({
    id: validId(c.id) || newClientId(), name: str(c.name, 60), url: str(c.url, 1000), kind: ['school', 'activity', 'family'].includes(c.kind) ? c.kind : 'school',
    kidIds: (Array.isArray(c.kidIds) ? c.kidIds : []).filter((k) => kidIds.has(k)), placeId: placeIds.has(c.placeId) ? c.placeId : '',
  })).filter((c) => c.name && /^(https?|webcal):\/\//i.test(c.url));
  return {
    parent: {name: str(p.name, 60), relationship: str(p.relationship, 20), phone: normPhone(p.phone)},
    kids, contacts, places, schedule, calendars,
    timezone: validTz(input?.timezone) ? input.timezone : DEFAULT_TZ,
    alerts: {late: input?.alerts?.late !== false},
    plan: ['free', 'family', 'plus'].includes(input?.plan) ? input.plan : 'free',
  };
}

/* Rebuild the lookups that let inbound texts and kid links find this family. */
export async function reindexFamily(DB, familyId, family) {
  const stmts = [
    DB.prepare('DELETE FROM phones WHERE family_id = ?').bind(familyId),
    DB.prepare('DELETE FROM kid_tokens WHERE family_id = ?').bind(familyId),
  ];
  const addPhone = (phone, kind, ref, label) => phone && stmts.push(DB.prepare('INSERT INTO phones (phone, family_id, kind, ref_id, label) VALUES (?, ?, ?, ?, ?)').bind(phone, familyId, kind, ref, label || ''));
  for (const k of family.kids) {
    addPhone(k.phone, 'kid', k.id, k.name);
    stmts.push(DB.prepare('INSERT INTO kid_tokens (token_hash, family_id, kid_id, kind) VALUES (?, ?, ?, ?)').bind(await sha256(k.hubToken), familyId, k.id, 'hub'));
    stmts.push(DB.prepare('INSERT INTO kid_tokens (token_hash, family_id, kid_id, kind) VALUES (?, ?, ?, ?)').bind(await sha256(k.hookToken), familyId, k.id, 'hook'));
  }
  for (const c of family.contacts) {
    addPhone(c.phone, 'contact', c.id, c.name);
    for (const m of c.members) addPhone(m.phone, 'member', c.id, m.name);
  }
  await DB.batch(stmts);
}

/* Which child does a secret link belong to? */
export async function kidForToken(DB, token, kind) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 64) return null;
  const row = await DB.prepare('SELECT family_id, kid_id FROM kid_tokens WHERE token_hash = ? AND kind = ?').bind(await sha256(token), kind).first();
  return row ? {familyId: row.family_id, kidId: row.kid_id} : null;
}
