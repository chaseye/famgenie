/* POST /api/ai/draft {threadId, hint} — drafts a reply in the parent's voice. The parent edits and sends it. */
import {parentContext, jsonRes, allow} from '../../../lib/server.js';
import {aiMode, claude, SYSTEM} from '../../../lib/ai.js';
import {threadKey} from '../../../public/assets/shared.js';

export async function onRequestPost({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family} = ctx;
  if (aiMode(env) === 'off') return jsonRes({error: 'AI isn’t turned on yet (add ANTHROPIC_API_KEY).'}, 503);
  let b = {};
  try { b = await request.json(); } catch (e) { return jsonRes({error: 'Send JSON.'}, 400); }
  const tid = String(b.threadId || '');
  const contact = tid.startsWith('c-') ? family.contacts.find((c) => c.id === tid.slice(2)) : null;
  const kid = tid.startsWith('k-') ? family.kids.find((k) => k.id === tid.slice(2)) : null;
  if (!contact && !kid) return jsonRes({error: 'Pick a conversation.'}, 404);
  if (!(await allow(DB, `draft:${familyId}`, 40, 60 * 60e3))) return jsonRes({error: 'Too many drafts this hour.'}, 429);
  const rows = (await DB.prepare('SELECT dir, phone, thread_id, body, at FROM messages WHERE family_id = ? AND at > ? ORDER BY at ASC').bind(familyId, Date.now() - 14 * 864e5).all()).results;
  const msgs = rows.map((m) => ({dir: m.dir, phone: m.phone, threadId: m.thread_id, body: m.body})).filter((m) => threadKey(m, family) === tid).slice(-10);
  const who = contact ? `${contact.name} (${contact.role} for ${contact.kidIds.map((id) => family.kids.find((k) => k.id === id)?.name).filter(Boolean).join(', ') || 'the family'})` : `${kid.name}, the parent's child`;
  const parent = family.parent.name.split(/\s+/)[0] || 'the parent';
  try {
    const draft = await claude(env, {system: SYSTEM, maxTokens: 250, user: `<data>${JSON.stringify(msgs.map((m) => `${m.dir === 'out' ? parent : 'Them'}: ${m.body}`))}</data>
Write the next text message from ${parent} to ${who}.${b.hint ? ` ${parent} wants to say: ${String(b.hint).slice(0, 200)}.` : ''} Under 45 words, friendly and clear, no greeting line if the conversation is ongoing. Return only the message text.`});
    return jsonRes({draft: draft.replace(/^"|"$/g, '').slice(0, 600)});
  } catch (e) { return jsonRes({error: e.message}, 502); }
}
