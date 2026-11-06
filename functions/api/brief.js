/* GET /api/brief — what needs the parent now (rules), plus a short AI-written summary and tasks pulled from school email. */
import {parentContext, jsonRes, sha256} from '../../lib/server.js';
import {snapshot} from '../../lib/brief.js';
import {aiMode, claude, firstJson, factsFor, SYSTEM} from '../../lib/ai.js';

export async function onRequestGet({request, env}) {
  const ctx = await parentContext(request, env);
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family} = ctx;
  const s = await snapshot(DB, familyId, family);
  const out = {items: s.items, ai: aiMode(env), summary: null};
  if (out.ai === 'off' || !family.kids.length) return jsonRes(out);
  await DB.prepare('CREATE TABLE IF NOT EXISTS ai_cache (family_id TEXT NOT NULL, kind TEXT NOT NULL, hash TEXT NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (family_id, kind))').run();
  const facts = factsFor(s);
  const hash = await sha256(JSON.stringify({...facts, now: Math.floor(s.now / (30 * 60e3))}));
  const cached = await DB.prepare('SELECT hash, value FROM ai_cache WHERE family_id = ? AND kind = \'brief\'').bind(familyId).first();
  if (cached?.hash === hash && !new URL(request.url).searchParams.has('refresh')) return jsonRes({...out, summary: cached.value});
  try {
    const text = await claude(env, {system: SYSTEM, maxTokens: 600, user: `<data>${JSON.stringify(facts)}</data>
Reply with JSON only:
{"summary": "2 to 3 short sentences for ${facts.parent}: what matters most in the next few hours, then anything to prepare for tomorrow. If nothing needs attention, say so.",
 "mailTasks": [{"id": "schoolMail id", "task": "one short action for the parent, e.g. Sign and return the zoo field trip form", "due": "the deadline as written, or empty"}]}
Only list mailTasks for emails that ask the parent to do something.`});
    const j = firstJson(text) || {summary: text.slice(0, 500), mailTasks: []};
    const summary = String(j.summary || '').slice(0, 600);
    for (const t of (Array.isArray(j.mailTasks) ? j.mailTasks : []).slice(0, 8)) {
      if (!s.mail.some((m) => m.id === t.id)) continue;
      await DB.prepare('UPDATE school_mail SET task = ?, due = ? WHERE id = ? AND family_id = ?').bind(String(t.task || '').slice(0, 160), String(t.due || '').slice(0, 40), t.id, familyId).run();
    }
    await DB.prepare(`INSERT INTO ai_cache (family_id, kind, hash, value, created_at) VALUES (?, 'brief', ?, ?, ?)
      ON CONFLICT(family_id, kind) DO UPDATE SET hash = excluded.hash, value = excluded.value, created_at = excluded.created_at`).bind(familyId, hash, summary, Date.now()).run();
    return jsonRes({...out, summary});
  } catch (e) {
    return jsonRes({...out, aiError: e.message});
  }
}
