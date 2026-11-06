/* Worker entry: serves the app from public/ and routes API calls to the same handlers
 * Cloudflare Pages would run from functions/. Lets FamGenie deploy as a Worker or as Pages. */
import * as authStart from '../functions/api/auth/start.js';
import * as authVerify from '../functions/api/auth/verify.js';
import * as authLogout from '../functions/api/auth/logout.js';
import * as me from '../functions/api/me.js';
import * as state from '../functions/api/state.js';
import * as family from '../functions/api/family.js';
import * as checkins from '../functions/api/checkins.js';
import * as signals from '../functions/api/signals.js';
import * as messages from '../functions/api/messages.js';
import * as money from '../functions/api/money.js';
import * as checkinPage from '../functions/c/[token].js';
import * as kidPage from '../functions/k/[token].js';
import * as smsHook from '../functions/hooks/sms.js';
import * as arriveHook from '../functions/hooks/arrive/[token].js';
import * as brief from '../functions/api/brief.js';
import * as aiAsk from '../functions/api/ai/ask.js';
import * as aiDraft from '../functions/api/ai/draft.js';
import * as calSync from '../functions/api/calendars/sync.js';
import * as mail from '../functions/api/mail.js';
import * as gStart from '../functions/api/google/start.js';
import * as gCallback from '../functions/api/google/callback.js';
import * as gDisconnect from '../functions/api/google/disconnect.js';
import {runCron} from '../lib/cron.js';

const ROUTES = [
  ['/api/auth/start', authStart], ['/api/auth/verify', authVerify], ['/api/auth/logout', authLogout],
  ['/api/me', me], ['/api/state', state], ['/api/family', family], ['/api/checkins', checkins],
  ['/api/signals', signals], ['/api/messages', messages], ['/api/money', money], ['/hooks/sms', smsHook],
  ['/api/brief', brief], ['/api/ai/ask', aiAsk], ['/api/ai/draft', aiDraft], ['/api/calendars/sync', calSync], ['/api/mail', mail],
  ['/api/google/start', gStart], ['/api/google/callback', gCallback], ['/api/google/disconnect', gDisconnect],
  [/^\/c\/([A-Za-z0-9_-]+)$/, checkinPage], [/^\/k\/([A-Za-z0-9_-]+)$/, kidPage], [/^\/hooks\/arrive\/([A-Za-z0-9_-]+)$/, arriveHook],
];
const METHOD = {GET: 'onRequestGet', POST: 'onRequestPost', PUT: 'onRequestPut', DELETE: 'onRequestDelete', HEAD: 'onRequestGet'};

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    for (const [pattern, mod] of ROUTES) {
      const m = typeof pattern === 'string' ? (path === pattern ? [path] : null) : pattern.exec(path);
      if (!m) continue;
      const handler = mod[METHOD[request.method]] || mod.onRequest;
      if (!handler) return new Response('Method not allowed', {status: 405, headers: {Allow: Object.entries(METHOD).filter(([, f]) => mod[f]).map(([v]) => v).join(', ')}});
      return handler({request, env, params: m[1] ? {token: m[1]} : {}, waitUntil: (p) => ctx.waitUntil(p)});
    }
    if (/^\/(api|hooks|c|k)\//.test(path)) return new Response(JSON.stringify({error: 'Not found'}), {status: 404, headers: {'Content-Type': 'application/json'}});
    return env.ASSETS.fetch(request);
  },
  /* Every 10 minutes: late alerts; at the top of each hour, calendar and Google refresh. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env, event.scheduledTime).then((r) => console.log('[cron]', JSON.stringify(r))));
  },
};
