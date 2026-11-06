/* POST /api/calendars/sync — refresh school/activity calendars and Google now. */
import {parentContext, jsonRes, allow} from '../../../lib/server.js';
import {syncFamilyCalendars} from '../../../lib/calendars.js';

export async function onRequestPost({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family} = ctx;
  if (!(await allow(DB, `sync:${familyId}`, 12, 60 * 60e3))) return jsonRes({error: 'Calendars were just synced. Try again in a few minutes.'}, 429);
  return jsonRes(await syncFamilyCalendars(env, DB, familyId, family));
}
