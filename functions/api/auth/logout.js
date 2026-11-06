/* POST /api/auth/logout — ends this session. */
import {db, readCookie, sha256, sessionCookie, jsonRes, sameOrigin, SESSION_COOKIE} from '../../../lib/server.js';

export async function onRequestPost({request, env}) {
  if (!sameOrigin(request)) return jsonRes({error: 'Bad origin.'}, 403);
  const DB = await db(env);
  const token = readCookie(request, SESSION_COOKIE);
  if (DB && token) await DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(token)).run();
  return jsonRes({ok: true}, 200, {'Set-Cookie': sessionCookie('', 0)});
}
