/* POST /hooks/arrive/<token> — called by a child's iPhone Shortcuts or Android automation.
 * Body (JSON or form): {event: "arrive"|"leave", place: "Lincoln High"} and optionally lat/lon. */
import {db, jsonRes, loadFamily, addSignal, allow} from '../../../lib/server.js';
import {kidForToken} from '../../../lib/family.js';
import {matchPlace} from '../../../public/assets/shared.js';

export async function onRequestPost({params, request, env}) {
  const DB = await db(env);
  if (!DB) return jsonRes({error: 'Not set up.'}, 503);
  const who = await kidForToken(DB, params.token, 'hook');
  if (!who) return jsonRes({error: 'Unknown link.'}, 404);
  if (!(await allow(DB, `hook:${who.familyId}:${who.kidId}`, 60, 60 * 60 * 1000))) return jsonRes({error: 'Too many updates.'}, 429);
  const family = await loadFamily(DB, who.familyId);
  const kid = family?.kids.find((k) => k.id === who.kidId);
  if (!kid || !kid.methods.includes('shortcut')) return jsonRes({error: 'Phone automation is off for this child.'}, 403);
  let b = {};
  const type = request.headers.get('Content-Type') || '';
  try { b = type.includes('json') ? await request.json() : Object.fromEntries(await request.formData()); } catch (e) { b = {}; }
  const event = String(b.event || 'arrive').toLowerCase() === 'leave' ? 'leave' : 'arrive';
  const name = String(b.place || '').trim().slice(0, 60);
  let place = family.places.find((p) => p.name.toLowerCase() === name.toLowerCase()) || null;
  const lat = Number(b.lat), lon = Number(b.lon);
  if (!place && Number.isFinite(lat) && Number.isFinite(lon)) place = matchPlace(family.places, lat, lon, 0);
  const where = place?.name || name || 'a saved place';
  await addSignal(DB, who.familyId, {kidId: kid.id, text: event === 'leave' ? `Left ${where}` : `Arrived at ${where}`, source: 'Phone automation', confidence: 'automation', placeId: place?.id || null});
  return jsonRes({ok: true});
}
