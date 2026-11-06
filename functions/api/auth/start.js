/* POST /api/auth/start {email} — emails a one-time sign-in link (valid 15 minutes).
 * Always answers the same way so nobody can probe which emails have accounts. */
import {db, allow, sha256, randomToken, sendEmail, emailLayout, esc, jsonRes, sameOrigin, clientIp, validEmail, APP_NAME} from '../../../lib/server.js';

export async function onRequestPost({request, env}) {
  if (!sameOrigin(request)) return jsonRes({error: 'Bad origin.'}, 403);
  const DB = await db(env);
  if (!DB || (!env.RESEND_API_KEY && env.DEV_EMAIL_LOG !== '1')) return jsonRes({error: 'Sign-in isn’t set up yet.'}, 503);
  let body = {};
  try { body = await request.json(); } catch (e) { return jsonRes({error: 'Send JSON.'}, 400); }
  if (body.website) return jsonRes({ok: true}); // honeypot field filled = bot
  const email = String(body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return jsonRes({error: 'Enter a valid email address.'}, 400);
  const ip = clientIp(request);
  if (!(await allow(DB, `ip:${ip}`, 10, 60 * 60 * 1000)) || !(await allow(DB, `em:${email}`, 3, 15 * 60 * 1000))) {
    return jsonRes({error: 'Too many requests. Try again in a few minutes.'}, 429);
  }
  const token = randomToken(32);
  await DB.prepare('INSERT INTO login_tokens (token_hash, email, expires_at, ip) VALUES (?, ?, ?, ?)').bind(await sha256(token), email, Date.now() + 15 * 60 * 1000, ip).run();
  const link = `${new URL(request.url).origin}/api/auth/verify?token=${token}`;
  try {
    await sendEmail(env, {to: email, subject: `Your ${APP_NAME} sign-in link`,
      text: `Sign in to ${APP_NAME}: ${link}\n\nThis link works once and expires in 15 minutes.`,
      html: emailLayout('Confirm your email to sign in', `<p>Click below to sign in. The link works once and expires in 15 minutes.</p>
        <p><a href="${esc(link)}" style="display:inline-block;background:#F2B53A;color:#2A1D00;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Sign in to ${APP_NAME}</a></p>`)});
  } catch (e) {
    return jsonRes({error: 'We couldn’t send the email. Try again later.'}, 502);
  }
  return jsonRes({ok: true});
}
