/* PUT /api/family — save the family profile (parent, kids, contacts, places). Returns the cleaned record. */
import {parentContext, jsonRes} from '../../lib/server.js';
import {sanitizeFamily, reindexFamily} from '../../lib/family.js';

export async function onRequestPut({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family: prev} = ctx;
  let input;
  try { input = await request.json(); } catch (e) { return jsonRes({error: 'Send JSON.'}, 400); }
  const family = sanitizeFamily(input, prev);
  const json = JSON.stringify(family);
  if (json.length > 3_000_000) return jsonRes({error: 'That’s too much to save at once. Try smaller photos.'}, 413);
  await DB.prepare('UPDATE families SET data_json = ?, updated_at = ? WHERE id = ?').bind(json, Date.now(), familyId).run();
  await reindexFamily(DB, familyId, family);
  return jsonRes(family);
}
