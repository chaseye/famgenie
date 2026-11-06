/* GET /api/google/start?gmail=1 — sends the parent to Google to connect Calendar (and optionally Gmail), read-only. */
import {parentContext, jsonRes} from '../../../lib/server.js';
import {authUrl, googleReady} from '../../../lib/google.js';

export async function onRequestGet({request, env}) {
  const ctx = await parentContext(request, env);
  if (ctx instanceof Response) return ctx;
  if (!googleReady(env)) return jsonRes({error: 'Google isn’t set up yet.'}, 503);
  const url = new URL(request.url);
  return Response.redirect(await authUrl(env, ctx.DB, url.origin, ctx.familyId, ctx.user.id, url.searchParams.get('gmail') === '1'), 302);
}
