/* /c/<token> — the one-time check-in page a child opens from a text. Works once, for 15 minutes. */
import {db, jsonRes, htmlRes, sha256, loadFamily, askerLabel, addSignal} from '../../lib/server.js';
import {checkinPage, notice} from '../../lib/pages.js';
import {recordLocation} from '../../lib/kid.js';

async function find(env, token) {
  const DB = await db(env);
  if (!DB || typeof token !== 'string' || token.length < 12 || token.length > 64) return {DB};
  const c = await DB.prepare('SELECT * FROM checkins WHERE token_hash = ?').bind(await sha256(token)).first();
  const live = c && !c.used_at && c.expires_at > Date.now();
  return {DB, c: live ? c : null};
}
const gone = () => notice('This link has expired', 'Check-in links work once and only for 15 minutes. Ask for a new one if you need it.');

export async function onRequestGet({params, env}) {
  const {DB, c} = await find(env, params.token);
  if (!c) return htmlRes(gone(), 410);
  const family = await loadFamily(DB, c.family_id);
  const kid = family?.kids.find((k) => k.id === c.kid_id);
  if (!kid) return htmlRes(gone(), 410);
  return htmlRes(checkinPage({token: params.token, kidName: kid.name, asker: askerLabel(family), reason: c.reason, expiresAt: c.expires_at}));
}

export async function onRequestPost({params, request, env}) {
  const {DB, c} = await find(env, params.token);
  if (!c) return jsonRes({message: 'This link has expired. Ask for a new one if you need it.'}, 410);
  let b = {};
  try { b = await request.json(); } catch (e) { return jsonRes({message: 'Something went wrong. Try again.'}, 400); }
  if (!['share', 'here', 'no'].includes(b.action)) return jsonRes({message: 'Something went wrong. Try again.'}, 400);
  // Claim the link first so a double tap can't record twice.
  const claimed = await DB.prepare('UPDATE checkins SET used_at = ?, result = ? WHERE id = ? AND used_at IS NULL').bind(Date.now(), b.action, c.id).run();
  if (!claimed.meta?.changes) return jsonRes({message: 'This link was already used.'}, 410);
  const family = await loadFamily(DB, c.family_id);
  const kid = family.kids.find((k) => k.id === c.kid_id);
  const asker = askerLabel(family);
  if (b.action === 'share') {
    const sig = await recordLocation(DB, c.family_id, family, kid, b, 'Check-in link');
    if (!sig) return jsonRes({message: 'We couldn’t read your location. Tap "I’m here" instead.'}, 400);
    return jsonRes({message: sig.placeId ? `Sent. ${asker} can see you're ${sig.text.replace(/^At/, 'at')}.` : `Sent. ${asker} can see where you are.`});
  }
  if (b.action === 'here') {
    await addSignal(DB, c.family_id, {kidId: kid.id, text: `Says they made it${c.reason ? ' to ' + c.reason : ''}`, source: 'Check-in link', confidence: 'self'});
    return jsonRes({message: `Sent. ${asker} knows you're there.`});
  }
  await addSignal(DB, c.family_id, {kidId: kid.id, text: 'Chose "not now"', source: 'Check-in link', confidence: 'declined'});
  return jsonRes({message: `OK. ${asker} will see you said not now.`});
}
