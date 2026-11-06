/* GET /api/auth/verify?token=... — checks the emailed link and starts a 30-day session. */
import {db, sha256, createSession, sessionCookie, newId} from '../../../lib/server.js';

const back = (origin, status) => Response.redirect(`${origin}/?signin=${status}`, 302);

export async function onRequestGet({request, env}) {
  const origin = new URL(request.url).origin;
  const DB = await db(env);
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!DB || token.length < 20) return back(origin, 'invalid');
  const hash = await sha256(token);
  const row = await DB.prepare('SELECT email, expires_at, used_at FROM login_tokens WHERE token_hash = ?').bind(hash).first();
  if (!row || row.used_at || row.expires_at < Date.now()) return back(origin, 'expired');
  await DB.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ?').bind(Date.now(), hash).run();
  let user = await DB.prepare('SELECT id FROM users WHERE email = ?').bind(row.email).first();
  if (!user) {
    user = {id: newId()};
    await DB.prepare('INSERT INTO users (id, email, created_at, verified_at) VALUES (?, ?, ?, ?)').bind(user.id, row.email, Date.now(), Date.now()).run();
  }
  const session = await createSession(DB, user.id);
  return new Response(null, {status: 302, headers: {Location: `${origin}/?signin=ok`, 'Set-Cookie': sessionCookie(session, 30 * 24 * 3600)}});
}
