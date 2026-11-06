/* POST /api/ai/ask {question} — answers a parent's question from the family's own schedule, messages, money and email. */
import {parentContext, jsonRes, allow} from '../../../lib/server.js';
import {snapshot} from '../../../lib/brief.js';
import {aiMode, claude, factsFor, SYSTEM} from '../../../lib/ai.js';
import {fmtMoney} from '../../../public/assets/shared.js';

export async function onRequestPost({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family} = ctx;
  if (aiMode(env) === 'off') return jsonRes({error: 'AI isn’t turned on yet (add ANTHROPIC_API_KEY).'}, 503);
  let b = {};
  try { b = await request.json(); } catch (e) { return jsonRes({error: 'Send JSON.'}, 400); }
  const q = String(b.question || '').trim().slice(0, 400);
  if (!q) return jsonRes({error: 'Ask a question first.'}, 400);
  if (!(await allow(DB, `ask:${familyId}`, 30, 60 * 60e3))) return jsonRes({error: 'That’s a lot of questions this hour. Try again soon.'}, 429);
  const s = await snapshot(DB, familyId, family);
  const facts = {...factsFor(s), weekSchedule: s.events.slice(0, 60).map((e) => `${new Date(e.start).toLocaleString('en-US', {timeZone: family.timezone || 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})} ${e.kidIds.map((id) => family.kids.find((k) => k.id === id)?.name).filter(Boolean).join(' & ') || 'Family'}: ${e.title}`),
    budgets: family.kids.map((k) => `${k.name}: ${k.monthlyBudget ? fmtMoney(k.monthlyBudget) + ' a month' : 'no budget'}`)};
  try {
    const answer = await claude(env, {system: SYSTEM, maxTokens: 400, user: `<data>${JSON.stringify(facts)}</data>\nThe parent asks: ${q}\nAnswer in at most 4 short sentences, using only the data. If the data doesn't say, say so and suggest what to add (a calendar, a contact, a check-in).`});
    return jsonRes({answer});
  } catch (e) { return jsonRes({error: e.message}, 502); }
}
