/* GET /api/state — everything the parent app shows: family, today's signals, messages, money, open check-ins. */
import {parentContext, jsonRes, moneyRow, pruneOld} from '../../lib/server.js';
import {smsMode} from '../../lib/sms.js';
import {familyEvents, ensureCalendarTables} from '../../lib/calendars.js';
import {googleStatus} from '../../lib/google.js';
import {aiMode} from '../../lib/ai.js';
import {mailRow} from '../../lib/brief.js';

export async function onRequestGet({request, env}) {
  const ctx = await parentContext(request, env);
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family, user} = ctx;
  await pruneOld(DB, env);
  const since = Date.now() - 45 * 864e5;
  const [signals, messages, money, checkins] = await Promise.all([
    DB.prepare('SELECT * FROM signals WHERE family_id = ? ORDER BY at DESC LIMIT 300').bind(familyId).all(),
    DB.prepare('SELECT * FROM messages WHERE family_id = ? AND at > ? ORDER BY at ASC LIMIT 1000').bind(familyId, since).all(),
    DB.prepare('SELECT * FROM money WHERE family_id = ? AND (created_at > ? OR status IN (\'pending\', \'approved\')) ORDER BY created_at DESC LIMIT 1000').bind(familyId, Date.now() - 400 * 864e5).all(),
    DB.prepare('SELECT id, kid_id, how, reason, created_at, expires_at, used_at, result FROM checkins WHERE family_id = ? AND created_at > ? ORDER BY created_at DESC').bind(familyId, Date.now() - 864e5).all(),
  ]);
  const now = Date.now();
  await ensureCalendarTables(DB);
  const [events, mail, calStatus, google] = await Promise.all([
    familyEvents(DB, familyId, family, now - 12 * 3600e3, now + 14 * 864e5),
    DB.prepare('SELECT * FROM school_mail WHERE family_id = ? AND at > ? ORDER BY at DESC LIMIT 30').bind(familyId, now - 30 * 864e5).all(),
    DB.prepare('SELECT source, synced_at, ok, message, count FROM calendar_status WHERE family_id = ?').bind(familyId).all(),
    googleStatus(env, DB, familyId),
  ]);
  return jsonRes({
    email: user.email, sms: smsMode(env), ai: aiMode(env), google, family,
    events: events.filter((e) => e.source !== 'schedule'),
    mail: mail.results.map(mailRow),
    calendarStatus: Object.fromEntries(calStatus.results.map((r) => [r.source, {syncedAt: r.synced_at, ok: !!r.ok, message: r.message, count: r.count}])),
    signals: signals.results.map((s) => ({id: s.id, kidId: s.kid_id, at: s.at, text: s.text, source: s.source, confidence: s.confidence, placeId: s.place_id, accuracy: s.accuracy})),
    messages: messages.results.map((m) => ({id: m.id, dir: m.dir, phone: m.phone, threadId: m.thread_id, body: m.body, at: m.at, status: m.status})),
    money: money.results.map(moneyRow),
    checkins: checkins.results.map((c) => ({id: c.id, kidId: c.kid_id, how: c.how, reason: c.reason, createdAt: c.created_at, expiresAt: c.expires_at, usedAt: c.used_at, result: c.result})),
  });
}
