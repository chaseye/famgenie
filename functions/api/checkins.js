/* POST /api/checkins {kidId, how: 'link'|'reply', reason} — texts a child a one-time check-in. */
import {parentContext, jsonRes, randomToken, sha256, newId, addSignal, askerLabel, allow} from '../../lib/server.js';
import {sendSms} from '../../lib/sms.js';

export async function onRequestPost({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family} = ctx;
  let b = {};
  try { b = await request.json(); } catch (e) { return jsonRes({error: 'Send JSON.'}, 400); }
  const kid = family.kids.find((k) => k.id === b.kidId);
  if (!kid) return jsonRes({error: 'That child isn’t in your family.'}, 404);
  if (!kid.phone) return jsonRes({error: `Add ${kid.name}’s mobile number first.`}, 400);
  const how = b.how === 'reply' ? 'reply' : 'link';
  const reason = String(b.reason || '').trim().slice(0, 60);
  if (!(await allow(DB, `checkin:${familyId}:${kid.id}`, 6, 60 * 60 * 1000))) return jsonRes({error: `That’s a lot of check-ins for ${kid.name} this hour. Try calling instead.`}, 429);
  const asker = askerLabel(family);
  const token = how === 'link' ? randomToken(12) : null;
  const url = token ? `${new URL(request.url).origin}/c/${token}` : null;
  const text = how === 'link'
    ? `Hi ${kid.name}, ${asker} is asking if you made it${reason ? ` to ${reason}` : ''}. Tap to check in (works once, 15 min): ${url}`
    : `Hi ${kid.name}, ${asker} here via FamGenie. Made it${reason ? ` to ${reason}` : ''}? Reply 1 for yes, 2 if you need a ride or help.`;
  let sent;
  try { sent = await sendSms(env, kid.phone, text); } catch (e) { return jsonRes({error: e.message}, 502); }
  const now = Date.now();
  await DB.prepare('INSERT INTO checkins (id, family_id, kid_id, how, reason, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(newId(), familyId, kid.id, how, reason, token ? await sha256(token) : null, now, now + (how === 'link' ? 15 * 60e3 : 2 * 3600e3)).run();
  await addSignal(DB, familyId, {kidId: kid.id, text: how === 'link' ? 'Check-in link sent' : 'Text check-in sent', source: `Sent by ${asker}`, confidence: 'pending'});
  // The link is returned only when texting is in dry-run, so a developer can open it.
  return jsonRes({ok: true, how, sms: sent.status, url: sent.status === 'dry-run' ? url : null});
}
