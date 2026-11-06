/* POST /api/money — the parent's side of kids' spending.
 *   {op:'record', kidId, kind:'payment'|'topup'|'allowance', amount, payee, contactId, category, method, note}
 *   {op:'approve'|'decline'|'paid', id, method?, note?}
 * FamGenie never moves money. Parents pay in their own Venmo, Zelle, PayPal, Cash App or card app,
 * and this keeps the record and the monthly tally. */
import {parentContext, jsonRes, newId, moneyRow, askerLabel} from '../../lib/server.js';
import {sendSms} from '../../lib/sms.js';
import {CATEGORIES, PAY_METHODS, toCents, fmtMoney} from '../../public/assets/shared.js';

export async function onRequestPost({request, env}) {
  const ctx = await parentContext(request, env, {write: true});
  if (ctx instanceof Response) return ctx;
  const {DB, familyId, family} = ctx;
  let b = {};
  try { b = await request.json(); } catch (e) { return jsonRes({error: 'Send JSON.'}, 400); }
  const method = b.method in PAY_METHODS ? b.method : '';
  const now = Date.now();

  if (b.op === 'record') {
    const kid = family.kids.find((k) => k.id === b.kidId);
    if (!kid) return jsonRes({error: 'Pick a child.'}, 400);
    const cents = toCents(b.amount);
    if (!cents) return jsonRes({error: 'Enter an amount, like 25 or 25.50.'}, 400);
    const kind = ['payment', 'topup', 'allowance'].includes(b.kind) ? b.kind : 'payment';
    const contact = family.contacts.find((c) => c.id === b.contactId);
    const row = {id: newId(), kind, payee: contact?.name || String(b.payee || '').trim().slice(0, 60), contactId: contact?.id || null,
      category: kind === 'payment' ? (CATEGORIES.includes(b.category) ? b.category : 'Other') : (kind === 'topup' ? 'Card top-up' : 'Allowance'),
      note: String(b.note || '').trim().slice(0, 140)};
    await DB.prepare(`INSERT INTO money (id, family_id, kid_id, kind, status, amount_cents, payee, contact_id, category, method, note, source, created_at, decided_at, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, 'parent', ?, ?, ?)`).bind(row.id, familyId, kid.id, kind, cents, row.payee, row.contactId, row.category, method, row.note, now, now, now).run();
    return jsonRes(moneyRow(await DB.prepare('SELECT * FROM money WHERE id = ?').bind(row.id).first()));
  }

  const row = await DB.prepare('SELECT * FROM money WHERE id = ? AND family_id = ?').bind(String(b.id || ''), familyId).first();
  if (!row) return jsonRes({error: 'That request wasn’t found.'}, 404);
  const kid = family.kids.find((k) => k.id === row.kid_id);
  const asker = askerLabel(family);
  let tell = '';
  if (b.op === 'approve') {
    if (row.status !== 'pending') return jsonRes({error: 'That request was already decided.'}, 409);
    await DB.prepare('UPDATE money SET status = \'approved\', decided_at = ?, method = ? WHERE id = ?').bind(now, method || row.method, row.id).run();
    tell = `${asker} approved ${fmtMoney(row.amount_cents)}${row.payee ? ' for ' + row.payee : ''}. You'll get a text when it's paid.`;
  } else if (b.op === 'decline') {
    if (!['pending', 'approved'].includes(row.status)) return jsonRes({error: 'That request was already decided.'}, 409);
    const note = String(b.note || '').trim().slice(0, 140);
    await DB.prepare('UPDATE money SET status = \'declined\', decided_at = ?, note = ? WHERE id = ?').bind(now, note ? `${row.note ? row.note + ' · ' : ''}${asker}: ${note}` : row.note, row.id).run();
    tell = `${asker} said no to ${fmtMoney(row.amount_cents)}${row.payee ? ' for ' + row.payee : ''}${note ? `: ${note}` : '.'}`;
  } else if (b.op === 'paid') {
    if (!['pending', 'approved'].includes(row.status)) return jsonRes({error: 'That request was already decided.'}, 409);
    await DB.prepare('UPDATE money SET status = \'paid\', decided_at = COALESCE(decided_at, ?), paid_at = ?, method = ? WHERE id = ?').bind(now, now, method || row.method || 'other', row.id).run();
    tell = `Paid: ${fmtMoney(row.amount_cents)}${row.payee ? ' to ' + row.payee : ''}${method ? ` by ${PAY_METHODS[method]}` : ''}.`;
  } else return jsonRes({error: 'Unknown action.'}, 400);

  if (tell && kid?.phone && row.source !== 'parent') { try { await sendSms(env, kid.phone, tell); } catch (e) { /* the record matters more than the text */ } }
  return jsonRes(moneyRow(await DB.prepare('SELECT * FROM money WHERE id = ?').bind(row.id).first()));
}
