/* /k/<token> — a child's private page: check in any time, ask for money, see their requests. */
import {db, jsonRes, htmlRes, loadFamily, askerLabel, addSignal, allow, moneyRow} from '../../lib/server.js';
import {kidForToken} from '../../lib/family.js';
import {hubPage, notice} from '../../lib/pages.js';
import {recordLocation, createMoneyRequest} from '../../lib/kid.js';
import {tally, monthKey} from '../../public/assets/shared.js';

async function load(env, token) {
  const DB = await db(env);
  if (!DB) return {};
  const who = await kidForToken(DB, token, 'hub');
  if (!who) return {DB};
  const family = await loadFamily(DB, who.familyId);
  const kid = family?.kids.find((k) => k.id === who.kidId);
  return kid && kid.methods.includes('hub') ? {DB, family, kid, familyId: who.familyId} : {DB};
}
const off = () => notice('This page isn’t available', 'Ask your parent to turn on your FamGenie page.');

export async function onRequestGet({params, env}) {
  const {DB, family, kid, familyId} = await load(env, params.token);
  if (!kid) return htmlRes(off(), 404);
  const rows = (await DB.prepare('SELECT * FROM money WHERE family_id = ? AND kid_id = ? ORDER BY created_at DESC LIMIT 60').bind(familyId, kid.id).all()).results.map(moneyRow);
  const t = tally(rows, [kid], monthKey(Date.now()))[kid.id];
  const payees = family.contacts.filter((c) => c.kind !== 'group' && c.kidIds.includes(kid.id));
  return htmlRes(hubPage({token: params.token, kid, asker: askerLabel(family), payees, left: t.left, budget: t.budget,
    recent: rows.filter((r) => r.kind === 'request').slice(0, 8)}));
}

export async function onRequestPost({params, request, env}) {
  const {DB, family, kid, familyId} = await load(env, params.token);
  if (!kid) return jsonRes({message: 'This page isn’t available.'}, 404);
  if (!(await allow(DB, `hub:${familyId}:${kid.id}`, 20, 60 * 60 * 1000))) return jsonRes({message: 'Too many tries. Wait a bit, or call your parent.'}, 429);
  let b = {};
  try { b = await request.json(); } catch (e) { return jsonRes({message: 'Something went wrong. Try again.'}, 400); }
  const asker = askerLabel(family);
  if (b.action === 'checkin') {
    const sig = await recordLocation(DB, familyId, family, kid, b, 'Kid page');
    if (!sig) return jsonRes({message: 'We couldn’t read your location. Tap "I’m safe" instead.'}, 400);
    return jsonRes({message: `Sent. ${asker} can see ${sig.placeId ? 'you’re ' + sig.text.replace(/^At/, 'at') : 'where you are'}.`});
  }
  if (b.action === 'safe') {
    await addSignal(DB, familyId, {kidId: kid.id, text: 'Checked in: safe', source: 'Kid page', confidence: 'self'});
    return jsonRes({message: `Sent. ${asker} knows you’re safe.`});
  }
  if (b.action === 'ask') {
    const r = await createMoneyRequest(env, DB, familyId, family, kid, b, 'kid-page');
    if (r.error) return jsonRes({message: r.error}, 400);
    return jsonRes({message: `Sent to ${asker}. You’ll get a text when they decide.`});
  }
  return jsonRes({message: 'Something went wrong. Try again.'}, 400);
}
