/* Everything the brief, Ask and the scheduler need about one family right now. */
import {familyEvents, ensureCalendarTables} from './calendars.js';
import {moneyRow} from './server.js';
import {ruleBrief, threadKey} from '../public/assets/shared.js';

export async function snapshot(DB, familyId, family, now = Date.now()) {
  await ensureCalendarTables(DB);
  const [events, signals, money, messages, mail, checkins] = await Promise.all([
    familyEvents(DB, familyId, family, now - 12 * 3600e3, now + 7 * 864e5),
    DB.prepare('SELECT * FROM signals WHERE family_id = ? AND at > ? ORDER BY at DESC LIMIT 300').bind(familyId, now - 24 * 3600e3).all(),
    DB.prepare('SELECT * FROM money WHERE family_id = ? AND status = \'pending\' ORDER BY created_at DESC LIMIT 50').bind(familyId).all(),
    DB.prepare('SELECT * FROM messages WHERE family_id = ? AND at > ? ORDER BY at ASC LIMIT 300').bind(familyId, now - 72 * 3600e3).all(),
    DB.prepare('SELECT * FROM school_mail WHERE family_id = ? AND done = 0 ORDER BY at DESC LIMIT 20').bind(familyId).all(),
    DB.prepare('SELECT kid_id, how, created_at, expires_at, used_at FROM checkins WHERE family_id = ? AND created_at > ?').bind(familyId, now - 864e5).all(),
  ]);
  const s = {
    family, now, events,
    signals: signals.results.map((x) => ({kidId: x.kid_id, at: x.at, text: x.text, source: x.source, confidence: x.confidence, placeId: x.place_id})),
    money: money.results.map(moneyRow),
    messages: messages.results.map((m) => ({dir: m.dir, phone: m.phone, threadId: m.thread_id, body: m.body, at: m.at})),
    mail: mail.results.map(mailRow),
    checkins: checkins.results.map((c) => ({kidId: c.kid_id, how: c.how, createdAt: c.created_at, expiresAt: c.expires_at, usedAt: c.used_at})),
  };
  for (const m of s.messages) {
    const tid = threadKey(m, family);
    m.who = tid.startsWith('c-') ? family.contacts.find((c) => c.id === tid.slice(2))?.name : tid.startsWith('k-') ? family.kids.find((k) => k.id === tid.slice(2))?.name : 'Unknown number';
  }
  s.items = ruleBrief(s);
  return s;
}
export const mailRow = (m) => ({id: m.id, from: m.from_addr, fromName: m.from_name, subject: m.subject, snippet: m.snippet, at: m.at, kidId: m.kid_id || '', task: m.task || '', due: m.due || '', done: !!m.done});
