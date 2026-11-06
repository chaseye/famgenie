/* POST /api/messages {threadId, body} — text a contact, a parents group or a child from the family inbox.
 * threadId is "c-<contactId>" or "k-<kidId>". Groups go out as individual texts. */
import {parentContext, jsonRes, newId, allow} from '../../lib/server.js';
import {sendSms} from '../../lib/sms.js';
import {EXTERNAL_APPS} from '../../public/assets/shared.js';

export async function onRequestPost({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family} = ctx;
  let b = {};
  try { b = await request.json(); } catch (e) { return jsonRes({error: 'Send JSON.'}, 400); }
  const text = String(b.body || '').trim().slice(0, 600);
  if (!text) return jsonRes({error: 'Write a message first.'}, 400);
  const tid = String(b.threadId || '');
  let targets = [];
  if (tid.startsWith('c-')) {
    const c = family.contacts.find((x) => x.id === tid.slice(2));
    if (!c) return jsonRes({error: 'That contact isn’t in your family.'}, 404);
    if (c.route === 'external') return jsonRes({error: `Messages with ${c.name} happen in ${EXTERNAL_APPS[c.externalApp]?.name || 'their app'}. Open it there.`}, 409);
    targets = c.kind === 'group' ? c.members.map((m) => m.phone) : [c.phone];
  } else if (tid.startsWith('k-')) {
    const k = family.kids.find((x) => x.id === tid.slice(2));
    if (!k) return jsonRes({error: 'That child isn’t in your family.'}, 404);
    targets = [k.phone];
  } else return jsonRes({error: 'Pick who to message.'}, 400);
  targets = [...new Set(targets.filter(Boolean))];
  if (!targets.length) return jsonRes({error: 'Add a phone number for them first.'}, 400);
  if (!(await allow(DB, `msg:${familyId}`, 120, 60 * 60 * 1000))) return jsonRes({error: 'You’ve sent a lot of texts this hour. Try again soon.'}, 429);
  const results = await Promise.allSettled(targets.map((t) => sendSms(env, t, text)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length === targets.length) return jsonRes({error: failed[0].reason.message}, 502);
  const msg = {id: newId(), dir: 'out', threadId: tid, body: text, at: Date.now(), status: failed.length ? `sent to ${targets.length - failed.length} of ${targets.length}` : results[0].value.status};
  await DB.prepare('INSERT INTO messages (id, family_id, dir, phone, thread_id, body, at, status) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)')
    .bind(msg.id, familyId, msg.dir, msg.threadId, msg.body, msg.at, msg.status).run();
  return jsonRes(msg);
}
