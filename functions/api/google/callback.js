/* GET /api/google/callback — Google sends the parent back here; we keep an encrypted refresh token and sync. */
import {parentContext} from '../../../lib/server.js';
import {finishAuth} from '../../../lib/google.js';
import {syncFamilyCalendars} from '../../../lib/calendars.js';

export async function onRequestGet({request, env, waitUntil}) {
  const url = new URL(request.url);
  const back = (status) => Response.redirect(`${url.origin}/?google=${status}#family`, 302);
  const ctx = await parentContext(request, env);
  if (ctx instanceof Response) return back('signin');
  if (url.searchParams.get('error') || !url.searchParams.get('code')) return back('cancelled');
  try {
    await finishAuth(env, ctx.DB, url.origin, url.searchParams.get('code'), url.searchParams.get('state'), ctx.user.id);
  } catch (e) { return back('failed'); }
  const sync = syncFamilyCalendars(env, ctx.DB, ctx.familyId, ctx.family).catch(() => null);
  if (waitUntil) waitUntil(sync); else await sync;
  return back('ok');
}
