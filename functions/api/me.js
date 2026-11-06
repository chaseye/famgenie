/* GET /api/me — who is signed in, and what's set up. The app runs in demo mode when accounts aren't available. */
import {db, currentUser, jsonRes} from '../../lib/server.js';
import {smsMode} from '../../lib/sms.js';

export async function onRequestGet({request, env}) {
  const DB = await db(env);
  const available = !!DB && (!!env.RESEND_API_KEY || env.DEV_EMAIL_LOG === '1');
  if (!available) return jsonRes({available: false});
  const user = await currentUser(request, DB);
  return jsonRes({available: true, email: user ? user.email : null, sms: smsMode(env)});
}
