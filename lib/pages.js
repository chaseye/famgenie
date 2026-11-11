/* The small pages a child opens from a text: a one-time check-in, and their own kid page. No app needed. */
import {esc, APP_NAME} from './server.js';
import {CATEGORIES, fmtMoney, DEFAULT_TZ} from '../public/assets/shared.js';

const shell = (title, body, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>
:root{--bg:#F4F6F8;--card:#fff;--ink:#15202B;--muted:#586676;--line:#D9DFE6;--gold:#F2B53A;--good:#1D7F55;--warn:#B5531A;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0E1217;--card:#161C23;--ink:#E5EAF0;--muted:#96A3B2;--line:#29323D;--good:#4FC48E;--warn:#F08A4B;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px max(16px,env(safe-area-inset-left)) 40px max(16px,env(safe-area-inset-right))}
main{max-width:440px;margin:0 auto;display:grid;gap:16px}.brand{font-weight:800;color:var(--muted);font-size:14px;letter-spacing:.04em}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;display:grid;gap:12px}
h1{font-size:22px;margin:0;line-height:1.25}h2{font-size:17px;margin:0}p{margin:0}.muted{color:var(--muted);font-size:14px}
button{font:inherit;font-weight:700;width:100%;padding:13px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
button.primary{background:var(--gold);border-color:var(--gold);color:#2A1D00}button:disabled{opacity:.55}
label{display:grid;gap:4px;font-size:14px;font-weight:600}input,select,textarea{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);width:100%}
#out{font-weight:700}#out.good{color:var(--good)}#out.warn{color:var(--warn)}ul{margin:0;padding-left:18px;display:grid;gap:4px;font-size:14px}
</style></head><body><main><div class="brand">${APP_NAME}</div>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;

export const notice = (title, text) => shell(title, `<div class="card"><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p></div>`);

/* Shared browser code: ask for one location reading, then post it. */
const locate = `
function locate(){return new Promise(function(ok,fail){if(!navigator.geolocation)return fail(new Error('none'));
navigator.geolocation.getCurrentPosition(function(p){ok({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy})},fail,{enableHighAccuracy:true,timeout:15000,maximumAge:0})})}
function say(t,cls){var o=document.getElementById('out');o.textContent=t;o.className=cls||''}
async function post(url,body){var r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var j={};try{j=await r.json()}catch(e){}return {ok:r.ok,j:j}}`;

export function checkinPage({token, kidName, asker, reason, expiresAt, tz}) {
  // The child's own clock: the family's time zone, not a fixed one.
  const until = new Date(expiresAt).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', timeZone: tz || DEFAULT_TZ});
  return shell(`Check in for ${asker}`, `<div class="card">
    <h1>${esc(asker)} is asking if you made it${reason ? ' to ' + esc(reason) : ''}</h1>
    <p class="muted">Tapping share sends your location one time. Nothing keeps running after this.</p>
    <button class="primary" id="share">Share my location once</button>
    <button id="here">I'm here, skip location</button>
    <button id="no">Not now</button>
    <p id="out" role="status"></p>
    <p class="muted">This link works once and expires at ${esc(until)}.</p></div>`,
  `${locate}
var URL_='/c/'+${JSON.stringify(token)};
function done(r){if(r.ok){say(r.j.message||'Sent.','good');document.querySelectorAll('button').forEach(function(b){b.disabled=true})}else say(r.j.message||'Something went wrong. Try again.','warn')}
document.getElementById('share').onclick=async function(){say('Getting your location…');try{var p=await locate();done(await post(URL_,Object.assign({action:'share'},p)))}catch(e){say('Location is blocked on this phone. You can still tap "I\\'m here".','warn')}};
document.getElementById('here').onclick=async function(){done(await post(URL_,{action:'here'}))};
document.getElementById('no').onclick=async function(){done(await post(URL_,{action:'no'}))};`);
}

export function hubPage({token, kid, asker, payees, left, budget, recent}) {
  const opts = payees.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.role)})</option>`).join('');
  const cats = CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
  const status = {pending: 'waiting', approved: 'approved', paid: 'paid', declined: 'declined'};
  const list = recent.length ? `<ul>${recent.map((r) => `<li>${fmtMoney(r.amountCents)} ${r.payee ? 'to ' + esc(r.payee) : ''} · ${esc(r.category)} · <strong>${status[r.status] || esc(r.status)}</strong></li>`).join('')}</ul>` : '<p class="muted">No requests yet.</p>';
  return shell(`${kid.name}'s page`, `
    <h1>Hi ${esc(kid.name)}</h1>
    <div class="card"><h2>Check in</h2><p class="muted">Let ${esc(asker)} know where you are. Shares one reading, only when you tap.</p>
      <button class="primary" id="share">Share my location once</button><button id="here">I'm safe, skip location</button></div>
    <form class="card" id="ask"><h2>Ask for money</h2>
      ${budget ? `<p class="muted">Left this month: <strong>${fmtMoney(left)}</strong> of ${fmtMoney(budget)}</p>` : ''}
      <label>Amount<input id="amount" inputmode="decimal" placeholder="40.00" required></label>
      <label>Who gets paid<select id="payee"><option value="">Someone else / me</option>${opts}</select></label>
      <label id="otherWrap">Name (if someone else)<input id="other" maxlength="60" placeholder="e.g. Field trip, Uber"></label>
      <label>What for<select id="category">${cats}</select></label>
      <label>Note<textarea id="note" rows="2" maxlength="140" placeholder="Thursday tutoring session"></textarea></label>
      <button class="primary" type="submit">Send to ${esc(asker)}</button></form>
    <p id="out" role="status"></p>
    <div class="card"><h2>Your recent requests</h2>${list}</div>
    <p class="muted">Save this page to your home screen. It's private to you; don't share the link.</p>`,
  `${locate}
var URL_='/k/'+${JSON.stringify(token)};
function done(r){if(r.ok){say(r.j.message||'Sent.','good')}else say(r.j.message||'Something went wrong. Try again.','warn')}
document.getElementById('share').onclick=async function(){say('Getting your location…');try{var p=await locate();done(await post(URL_,Object.assign({action:'checkin'},p)))}catch(e){say('Location is blocked on this phone. Tap "I\\'m safe" instead.','warn')}};
document.getElementById('here').onclick=async function(){done(await post(URL_,{action:'safe'}))};
document.getElementById('ask').onsubmit=async function(e){e.preventDefault();var b=this.querySelector('button');b.disabled=true;
var r=await post(URL_,{action:'ask',amount:document.getElementById('amount').value,contactId:document.getElementById('payee').value,payee:document.getElementById('other').value,category:document.getElementById('category').value,note:document.getElementById('note').value});
done(r);b.disabled=false;if(r.ok){this.reset();setTimeout(function(){location.reload()},1500)}};`);
}
