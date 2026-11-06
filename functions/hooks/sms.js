/* POST /hooks/sms — Twilio calls this for every text sent to the family number.
 * A child's text can answer a check-in ("1" / "2") or ask for money ("PAY 40 Priya tutoring").
 * Everything else lands in the family inbox. Unknown numbers are never attached to a family. */
import {db, newId, addSignal, loadFamily, allow, askerLabel} from '../../lib/server.js';
import {twilioSignature, twiml, sendSms} from '../../lib/sms.js';
import {createMoneyRequest} from '../../lib/kid.js';
import {normPhone, parseMoneyText, guessRequest, fmtMoney} from '../../public/assets/shared.js';
import {safeEqual} from '../../lib/server.js';

export async function onRequestPost({request, env}) {
  const DB = await db(env);
  if (!DB) return twiml();
  const form = Object.fromEntries(await request.formData());
  if (env.DEV_SMS_LOG !== '1') {
    if (!env.TWILIO_AUTH_TOKEN) return new Response('Not set up', {status: 503});
    const url = (env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/$/, '') + '/hooks/sms' : request.url);
    const expected = await twilioSignature(env.TWILIO_AUTH_TOKEN, url, form);
    if (!safeEqual(expected, request.headers.get('X-Twilio-Signature') || '')) return new Response('Bad signature', {status: 403});
  }
  const from = normPhone(form.From);
  const body = String(form.Body || '').trim().slice(0, 1000);
  if (!from || !body) return twiml();
  if (!(await allow(DB, `sms:${from}`, 40, 60 * 60 * 1000))) return twiml();
  const rows = (await DB.prepare('SELECT family_id, kind, ref_id FROM phones WHERE phone = ?').bind(from).all()).results;
  if (!rows.length) return twiml('This number is for FamGenie families. Ask the family to add you as a contact.');

  let reply = '';
  for (const familyId of [...new Set(rows.map((r) => r.family_id))]) {
    const family = await loadFamily(DB, familyId);
    if (!family) continue;
    const kidRow = rows.find((r) => r.family_id === familyId && r.kind === 'kid');
    const kid = kidRow && family.kids.find((k) => k.id === kidRow.ref_id);
    if (kid) {
      const ans = body.replace(/[^\d]/g, '');
      const pending = await DB.prepare(`SELECT id FROM checkins WHERE family_id = ? AND kid_id = ? AND how = 'reply' AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
        .bind(familyId, kid.id, Date.now()).first();
      if (pending && (ans === '1' || ans === '2') && body.length <= 4) {
        await DB.prepare('UPDATE checkins SET used_at = ?, result = ? WHERE id = ?').bind(Date.now(), ans, pending.id).run();
        if (ans === '1') {
          await addSignal(DB, familyId, {kidId: kid.id, text: 'Replied 1: made it', source: 'Text reply', confidence: 'self'});
          reply = 'Got it, thanks!';
        } else {
          await addSignal(DB, familyId, {kidId: kid.id, text: 'Replied 2: needs a ride or help', source: 'Text reply', confidence: 'help'});
          if (family.parent?.phone) { try { await sendSms(env, family.parent.phone, `${kid.name} replied 2: needs a ride or help. Call them now.`); } catch (e) { /* still logged */ } }
          reply = `Got it. ${askerLabel(family)} has been told right away.`;
        }
        continue;
      }
      const ask = parseMoneyText(body);
      if (ask && kid.methods.includes('hub')) {
        const g = guessRequest(ask.rest, family.contacts.filter((c) => c.kidIds.includes(kid.id)));
        const r = await createMoneyRequest(env, DB, familyId, family, kid, {amount: ask.cents, contactId: g.contactId, payee: g.payee, category: g.category, note: ask.rest}, 'kid-text');
        reply = r.error || `Asked ${askerLabel(family)} for ${fmtMoney(ask.cents)}${g.payee ? ' to ' + g.payee : ''} (${g.category}). You'll get a text when they decide.`;
        continue;
      }
    }
    await DB.prepare('INSERT INTO messages (id, family_id, dir, phone, thread_id, body, at, status) VALUES (?, ?, \'in\', ?, NULL, ?, ?, \'received\')')
      .bind(newId(), familyId, from, body, Date.now()).run();
  }
  return twiml(reply);
}
