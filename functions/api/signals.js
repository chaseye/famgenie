/* POST /api/signals {kidId, text, source} — a parent logs what they saw in a tag or watch app. */
import {parentContext, jsonRes, addSignal} from '../../lib/server.js';

const SOURCES = ['Parent confirmed from tag app', 'Parent confirmed from watch app', 'Parent confirmed in person', 'Parent confirmed from live sharing'];

export async function onRequestPost({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family} = ctx;
  let b = {};
  try { b = await request.json(); } catch (e) { return jsonRes({error: 'Send JSON.'}, 400); }
  const kid = family.kids.find((k) => k.id === b.kidId);
  if (!kid) return jsonRes({error: 'That child isn’t in your family.'}, 404);
  const place = family.places.find((p) => p.id === b.placeId);
  const text = place ? `Seen at ${place.name}` : String(b.text || '').trim().slice(0, 120);
  if (!text) return jsonRes({error: 'Say where they are.'}, 400);
  const sig = await addSignal(DB, familyId, {kidId: kid.id, text, source: SOURCES.includes(b.source) ? b.source : SOURCES[2], confidence: 'parent', placeId: place?.id || null});
  return jsonRes(sig);
}
