/* POST /api/google/disconnect — revoke Google access and delete what was pulled from it. */
import {parentContext, jsonRes} from '../../../lib/server.js';
import {disconnectGoogle} from '../../../lib/google.js';

export async function onRequestPost({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  await disconnectGoogle(env, ctx.DB, ctx.familyId);
  return jsonRes({ok: true});
}
