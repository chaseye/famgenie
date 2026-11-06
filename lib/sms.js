/* Texting through Twilio's REST API (no SDK, works in Cloudflare Functions).
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (secrets), TWILIO_FROM (variable, e.g. +13125550100)
 *   DEV_SMS_LOG=1 prints texts to the console instead of sending (local testing only). */

export function smsMode(env) {
  if (env.DEV_SMS_LOG === '1') return 'dry-run';
  return env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM ? 'live' : 'off';
}

export async function sendSms(env, to, body) {
  const mode = smsMode(env);
  if (mode === 'dry-run') { console.log(`[dev sms] to=${to}\n${body}`); return {status: 'dry-run'}; }
  if (mode === 'off') throw new Error('Texting isn’t set up yet (add the Twilio settings).');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({To: to, From: env.TWILIO_FROM, Body: body}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`The text didn’t send (${res.status}${j.message ? ': ' + j.message : ''}).`);
  return {status: j.status || 'queued'};
}

/* Twilio signs each webhook: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)). */
export async function twilioSignature(authToken, url, params) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), {name: 'HMAC', hash: 'SHA-1'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export const twiml = (message) => new Response(
  `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${String(message).replace(/[<>&]/g, (c) => ({'<': '&lt;', '>': '&gt;', '&': '&amp;'}[c]))}</Message>` : ''}</Response>`,
  {headers: {'Content-Type': 'text/xml; charset=utf-8'}});
