/* POST /api/mail {id, done} — mark a school email handled. */
import {parentContext, jsonRes} from '../../lib/server.js';
import {ensureCalendarTables} from '../../lib/calendars.js';

export async function onRequestPost({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  let b = {};
  try { b = await request.json(); } catch (e) { return jsonRes({error: 'Send JSON.'}, 400); }
  await ensureCalendarTables(ctx.DB);
  const r = await ctx.DB.prepare('UPDATE school_mail SET done = ? WHERE id = ? AND family_id = ?').bind(b.done === false ? 0 : 1, String(b.id || ''), ctx.familyId).run();
  return r.meta?.changes ? jsonRes({ok: true}) : jsonRes({error: 'Not found.'}, 404);
}
