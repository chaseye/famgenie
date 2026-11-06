/* End-to-end test against the real Pages Functions and a throwaway local D1 database.
 * npm run test:e2e   (texts and emails are printed, never sent) */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const PORT = 8799, BASE = `http://127.0.0.1:${PORT}`;
const persist = mkdtempSync(join(tmpdir(), 'famgenie-e2e-'));
let logs = '';
// E2E_MODE=pages runs it as Cloudflare Pages; the default runs it as the Worker in wrangler.jsonc.
const PAGES = process.env.E2E_MODE === 'pages';
const args = PAGES
  ? ['wrangler', 'pages', 'dev', 'public', '--port', String(PORT), '--ip', '127.0.0.1', '--d1', 'DB=famgenie',
    '--binding', 'DEV_EMAIL_LOG=1', '--binding', 'DEV_SMS_LOG=1', '--compatibility-date=2026-10-01', '--persist-to', persist]
  : ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--var', 'DEV_EMAIL_LOG:1', '--var', 'DEV_SMS_LOG:1', '--persist-to', persist];
const wr = spawn('npx', args,
  {cwd: new URL('..', import.meta.url).pathname, detached: true, env: {...process.env, NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false'}});
wr.stdout.on('data', (d) => { logs += d; });
wr.stderr.on('data', (d) => { logs += d; });
let stopped = false;
const stop = () => {
  if (stopped) return; stopped = true;
  try { process.kill(-wr.pid, 'SIGTERM'); } catch (e) { /* already gone */ }
  rmSync(persist, {recursive: true, force: true});
};
process.on('exit', stop);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(BASE + '/api/me'); if (r.status < 500) return; } catch (e) { /* not yet */ }
    await sleep(1000);
  }
  throw new Error('wrangler did not start:\n' + logs.slice(-2000));
}
async function waitLog(re, from) {
  for (let i = 0; i < 40; i++) { const m = re.exec(logs.slice(from)); if (m) return m; await sleep(250); }
  throw new Error('log line not found: ' + re + '\n' + logs.slice(-1500));
}
function client() {
  let cookie = '';
  const f = async (path, {method = 'GET', json, form, headers = {}} = {}) => {
    const h = {...headers};
    if (cookie) h.Cookie = cookie;
    let body;
    if (json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form); }
    const r = await fetch(BASE + path, {method, headers: h, body, redirect: 'manual'});
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* html */ }
    return {status: r.status, j, text, headers: r.headers};
  };
  return f;
}
async function signIn(api, email) {
  const at = logs.length;
  const s = await api('/api/auth/start', {method: 'POST', json: {email}});
  assert.equal(s.status, 200, JSON.stringify(s.j));
  const m = await waitLog(/\/api\/auth\/verify\?token=([A-Za-z0-9_-]+)/, at);
  const v = await api(`/api/auth/verify?token=${m[1]}`);
  assert.equal(v.status, 302);
  assert.match(v.headers.get('location'), /signin=ok/);
  const again = await api(`/api/auth/verify?token=${m[1]}`);
  assert.match(again.headers.get('location'), /signin=expired/, 'sign-in links work once');
}
const sms = (api, from, body) => api('/hooks/sms', {method: 'POST', form: {From: from, Body: body, To: '+13125550100'}});

try {
  await waitUp(); console.log('server up');
  const parent = client();
  assert.deepEqual((await parent('/api/me')).j, {available: true, email: null, sms: 'dry-run'});
  assert.equal((await parent('/api/state')).status, 401, 'state needs sign-in');
  await signIn(parent, 'dana@example.com');

  let st = (await parent('/api/state')).j;
  assert.equal(st.email, 'dana@example.com');
  assert.equal(st.family.kids.length, 0);

  // Cross-site writes are refused.
  assert.equal((await parent('/api/family', {method: 'PUT', json: {}, headers: {Origin: 'https://evil.example'}})).status, 403);

  // Save a family.
  const fam = (await parent('/api/family', {method: 'PUT', json: {
    parent: {name: 'Dana Reyes', relationship: 'Mom', phone: '(312) 555-0100'},
    kids: [{id: 'kid_maya1', name: 'Maya', birthday: '2012-01-22', device: 'iphone', phone: '312-555-0142', methods: ['link', 'reply', 'hub', 'shortcut', 'bogus'],
      monthlyBudget: 15000, photo: 'data:image/jpeg;base64,AAAA', hubToken: 'attacker-chosen-token-xxxx'}],
    contacts: [
      {id: 'con_priya1', kidIds: ['kid_maya1', 'nope'], role: 'Tutor', name: 'Priya Shah', phone: '3125550164', allow: true, pay: {venmo: 'PriyaShah-Tutor'}},
      {id: 'con_room12', kidIds: ['kid_maya1'], role: 'School parents group', kind: 'group', name: 'Room 12 parents', members: [{name: 'Jen', phone: '3125550171'}]},
      {id: 'con_swim01', kidIds: ['kid_maya1'], role: 'Coach', name: 'Swim club', phone: '3125550199', allow: false},
    ],
    places: [{id: 'pl_lhs001', name: 'Lincoln High', lat: 41.918, lon: -87.644, radius: 200}, {name: 'Broken', lat: 'x', lon: 1}],
  }})).j;
  const maya = fam.kids[0];
  assert.equal(maya.phone, '+13125550142');
  assert.deepEqual(maya.methods, ['link', 'reply', 'hub', 'shortcut'], 'unknown methods dropped');
  assert.notEqual(maya.hubToken, 'attacker-chosen-token-xxxx', 'kid links are server-issued');
  assert.deepEqual(fam.contacts[0].kidIds, ['kid_maya1']);
  assert.equal(fam.places.length, 1, 'invalid places dropped');

  // Check-in link: one-time, GPS matched to a saved place.
  let at = logs.length;
  const ci = (await parent('/api/checkins', {method: 'POST', json: {kidId: maya.id, how: 'link', reason: 'school'}})).j;
  assert.equal(ci.sms, 'dry-run');
  await waitLog(/\[dev sms\] to=\+13125550142/, at);
  const path = new URL(ci.url).pathname;
  const kidPhone = client();
  const page = await kidPhone(path);
  assert.equal(page.status, 200);
  assert.match(page.text, /Mom is asking if you made it to school/);
  const shared = await kidPhone(path, {method: 'POST', json: {action: 'share', lat: 41.9181, lon: -87.6441, accuracy: 12}});
  assert.equal(shared.status, 200);
  assert.match(shared.j.message, /at Lincoln High/);
  assert.equal((await kidPhone(path, {method: 'POST', json: {action: 'here'}})).status, 410, 'link works once');
  assert.equal((await kidPhone(path)).status, 410);

  // Text-reply check-in.
  await parent('/api/checkins', {method: 'POST', json: {kidId: maya.id, how: 'reply', reason: 'practice'}});
  const r1 = await sms(kidPhone, '+13125550142', '1');
  assert.match(r1.text, /Got it, thanks/);

  // Money request by text, matched to the tutor.
  at = logs.length;
  const r2 = await sms(kidPhone, '+13125550142', 'PAY 40 Priya tutoring Thursday');
  assert.match(r2.text, /Asked Mom for \$40\.00 to Priya Shah \(Tutoring\)/);
  await waitLog(/\[dev sms\] to=\+13125550100\nMaya asked for \$40\.00/, at);

  // Inbox: contact, group member, held contact, unknown number.
  await sms(kidPhone, '+13125550164', 'Running 5 minutes late today.');
  await sms(kidPhone, '+13125550171', 'Who can drive Saturday?');
  await sms(kidPhone, '+13125550199', 'Registration is open!');
  const unknown = await sms(kidPhone, '+13125550999', 'hello?');
  assert.match(unknown.text, /Ask the family to add you/);

  // Kid page: ask for money.
  const hub = await kidPhone(`/k/${maya.hubToken}`);
  assert.equal(hub.status, 200);
  assert.match(hub.text, /Left this month: <strong>\$150\.00<\/strong>/);
  const ask = await kidPhone(`/k/${maya.hubToken}`, {method: 'POST', json: {action: 'ask', amount: '12.50', category: 'Food', payee: 'Lunch', note: 'Forgot lunch'}});
  assert.equal(ask.status, 200, JSON.stringify(ask.j));
  assert.equal((await kidPhone('/k/not-a-real-token-at-all')).status, 404);

  // Phone automation.
  const hook = await kidPhone(`/hooks/arrive/${maya.hookToken}`, {method: 'POST', json: {event: 'arrive', place: 'lincoln high'}});
  assert.equal(hook.status, 200);

  // Parent sees it all.
  st = (await parent('/api/state')).j;
  const texts = st.signals.map((s) => s.text);
  for (const t of ['At Lincoln High', 'Replied 1: made it', 'Arrived at Lincoln High', 'Check-in link sent']) assert.ok(texts.includes(t), `signal "${t}" missing: ${texts}`);
  assert.equal(st.messages.filter((m) => m.dir === 'in').length, 3, 'unknown number is not stored');
  const reqs = st.money.filter((m) => m.kind === 'request');
  assert.equal(reqs.length, 2);
  const tutor = reqs.find((m) => m.payee === 'Priya Shah');
  assert.equal(tutor.category, 'Tutoring');
  assert.equal(tutor.contactId, 'con_priya1');

  // Approve, pay, decline, record.
  at = logs.length;
  assert.equal((await parent('/api/money', {method: 'POST', json: {op: 'approve', id: tutor.id, method: 'venmo'}})).j.status, 'approved');
  await waitLog(/Mom approved \$40\.00 for Priya Shah/, at);
  assert.equal((await parent('/api/money', {method: 'POST', json: {op: 'paid', id: tutor.id, method: 'venmo'}})).j.status, 'paid');
  assert.equal((await parent('/api/money', {method: 'POST', json: {op: 'paid', id: tutor.id}})).status, 409, 'cannot pay twice');
  const lunch = reqs.find((m) => m.payee === 'Lunch');
  assert.equal((await parent('/api/money', {method: 'POST', json: {op: 'decline', id: lunch.id, note: 'Pack one tomorrow'}})).j.status, 'declined');
  const top = (await parent('/api/money', {method: 'POST', json: {op: 'record', kidId: maya.id, kind: 'topup', amount: '25', method: 'card'}})).j;
  assert.equal(top.amountCents, 2500);
  assert.equal(top.category, 'Card top-up');

  // Messages out.
  const out = await parent('/api/messages', {method: 'POST', json: {threadId: 'c-con_room12', body: 'I can drive!'}});
  assert.equal(out.status, 200);
  assert.equal(out.j.status, 'dry-run');
  assert.equal((await parent('/api/messages', {method: 'POST', json: {threadId: 'c-nope', body: 'x'}})).status, 404);

  // Another parent can't see or touch this family.
  const stranger = client();
  await signIn(stranger, 'someone@example.com');
  const theirs = (await stranger('/api/state')).j;
  assert.equal(theirs.family.kids.length, 0);
  assert.equal(theirs.money.length, 0);
  assert.equal((await stranger('/api/money', {method: 'POST', json: {op: 'paid', id: lunch.id}})).status, 404);
  assert.equal((await stranger('/api/checkins', {method: 'POST', json: {kidId: maya.id}})).status, 404);

  // The app page itself.
  const home = await parent('/');
  assert.equal(home.status, 200);
  assert.match(home.text, /<title>FamGenie<\/title>/);
  console.log('e2e: all tests passed');
} catch (e) {
  console.error(e);
  console.error('--- wrangler log tail ---\n' + logs.slice(-3000));
  process.exitCode = 1;
} finally {
  stop();
  process.exit(process.exitCode || 0);
}
