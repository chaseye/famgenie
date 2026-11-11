/* Runs every 10 minutes (Worker cron): late alerts by text; hourly calendar and Google refresh. */
import {db, loadFamily, pruneOld} from './server.js';
import {sendSms, smsMode} from './sms.js';
import {syncFamilyCalendars, familyEvents, ensureCalendarTables} from './calendars.js';
import {kidExpectation, ageOf, tzParts, DEFAULT_TZ} from '../public/assets/shared.js';
import {googleStatus} from './google.js';

export async function runCron(env, at = Date.now(), {forceSync = false} = {}) {
  const DB = await db(env);
  if (!DB) return {families: 0};
  await ensureCalendarTables(DB);
  const hourly = forceSync || new Date(at).getUTCMinutes() < 10;
  const fams = (await DB.prepare('SELECT id FROM families ORDER BY updated_at DESC LIMIT 500').all()).results;
  const report = {families: fams.length, synced: 0, alerts: 0};
  for (const {id} of fams) {
    const family = await loadFamily(DB, id);
    if (!family?.kids?.length) continue;
    try {
      if (hourly && ((family.calendars || []).length || (await googleStatus(env, DB, id)).connected)) {
        await syncFamilyCalendars(env, DB, id, family);
        report.synced++;
      }
      report.alerts += await lateAlerts(env, DB, id, family, at);
    } catch (e) { console.log(`[cron] family ${id}: ${e.message}`); }
  }
  await DB.prepare('DELETE FROM alerts_sent WHERE at < ?').bind(at - 7 * 864e5).run();
  // Retention runs on the clock too, so a family that stops opening the app still has old locations deleted.
  if (hourly) await pruneOld(DB, env);
  return report;
}

async function lateAlerts(env, DB, familyId, family, now) {
  if (!family.parent?.phone || smsMode(env) === 'off' || family.alerts?.late === false) return 0;
  const events = await familyEvents(DB, familyId, family, now - 6 * 3600e3, now + 3600e3);
  if (!events.length) return 0;
  const signals = (await DB.prepare('SELECT kid_id, at, text, confidence, place_id FROM signals WHERE family_id = ? AND at > ?').bind(familyId, now - 10 * 3600e3).all())
    .results.map((s) => ({kidId: s.kid_id, at: s.at, text: s.text, confidence: s.confidence, placeId: s.place_id}));
  let sent = 0;
  for (const kid of family.kids) {
    if ((ageOf(kid.birthday) ?? 10) >= 18) continue;
    const ex = kidExpectation(kid.id, events, signals, now);
    if (!['late', 'elsewhere'].includes(ex.state) || now - ex.event.start > 60 * 60e3) continue;
    const key = `late:${kid.id}:${ex.event.start}`;
    const done = await DB.prepare('INSERT OR IGNORE INTO alerts_sent (family_id, key, at) VALUES (?, ?, ?)').bind(familyId, key, now).run();
    if (!done.meta?.changes) continue;
    const p = tzParts(ex.event.start, family.timezone || DEFAULT_TZ);
    const when = `${((p.h + 11) % 12) + 1}:${String(p.mi).padStart(2, '0')}${p.h < 12 ? 'am' : 'pm'}`;
    const where = family.places.find((x) => x.id === ex.event.placeId)?.name || ex.event.title;
    const link = env.PUBLIC_URL ? ` ${env.PUBLIC_URL.replace(/\/$/, '')}/#kid-${kid.id}` : '';
    const body = ex.state === 'late'
      ? `FamGenie: ${kid.name} isn't confirmed at ${where} yet (${ex.event.title}, started ${when}).${link}`
      : `FamGenie: ${kid.name} should be at ${where} (${ex.event.title}, ${when}) but was last seen elsewhere.${link}`;
    try { await sendSms(env, family.parent.phone, body); sent++; } catch (e) { console.log(`[cron] alert failed: ${e.message}`); }
  }
  return sent;
}
