/* Things a child can do without an account: check in, and ask for money. Used by the kid page and by texts. */
import {newId, addSignal, moneyRow} from './server.js';
import {sendSms} from './sms.js';
import {matchPlace, toCents, fmtMoney, CATEGORIES, tally, monthKey, budgetAfter, DEFAULT_TZ} from '../public/assets/shared.js';

/* One location reading → a signal, matched to a saved place when it falls inside one. */
export async function recordLocation(DB, familyId, family, kid, {lat, lon, accuracy}, source) {
  if (![lat, lon].every((v) => typeof v === 'number' && Number.isFinite(v)) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const acc = typeof accuracy === 'number' && accuracy > 0 ? Math.round(Math.min(accuracy, 100000)) : null;
  const place = matchPlace(family.places, lat, lon, acc || 0);
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  return addSignal(DB, familyId, {
    kidId: kid.id, text: place ? `At ${place.name}` : 'Shared a location (not a saved place)', source, confidence: 'gps',
    lat: r5(lat), lon: r5(lon), accuracy: acc, placeId: place?.id || null,
  });
}

/* A child's money request. Texts the parent so they can decide right away. */
export async function createMoneyRequest(env, DB, familyId, family, kid, {amount, contactId, payee, category, note}, source) {
  const cents = typeof amount === 'number' ? amount : toCents(amount);
  if (!cents) return {error: 'Enter an amount, like 25 or 25.50.'};
  if (cents > 200000) return {error: 'That’s more than $2,000. Talk to your parent directly.'};
  const kidContacts = family.contacts.filter((c) => c.kidIds.includes(kid.id));
  const contact = kidContacts.find((c) => c.id === contactId);
  const row = {id: newId(), payee: contact?.name || String(payee || '').trim().slice(0, 60), contactId: contact?.id || null,
    category: CATEGORIES.includes(category) ? category : 'Other', note: String(note || '').trim().slice(0, 140)};
  await DB.prepare(`INSERT INTO money (id, family_id, kid_id, kind, status, amount_cents, payee, contact_id, category, note, source, created_at)
    VALUES (?, ?, ?, 'request', 'pending', ?, ?, ?, ?, ?, ?, ?)`).bind(row.id, familyId, kid.id, cents, row.payee, row.contactId, row.category, row.note, source, Date.now()).run();
  if (family.parent?.phone) {
    const budget = await budgetLine(DB, familyId, family, kid, cents);
    try { await sendSms(env, family.parent.phone, `${kid.name} asked for ${fmtMoney(cents)}${row.payee ? ' to ' + row.payee : ''} (${row.category})${row.note ? ': ' + row.note : ''}.${budget ? ' ' + budget : ''} Open FamGenie to approve.`); } catch (e) { /* shown in the app regardless */ }
  }
  return {ok: true, cents, payee: row.payee, category: row.category};
}

/* "After this: $110.00 left of $150.00 this month." for the parent's text, so they can decide from the text alone. */
async function budgetLine(DB, familyId, family, kid, cents) {
  if (!kid.monthlyBudget) return '';
  try {
    const tz = family.timezone || DEFAULT_TZ, now = Date.now();
    const rows = (await DB.prepare('SELECT * FROM money WHERE family_id = ? AND kid_id = ? AND status = \'paid\' AND COALESCE(paid_at, created_at) > ?')
      .bind(familyId, kid.id, now - 32 * 864e5).all()).results.map(moneyRow);
    return budgetAfter(tally(rows, [kid], monthKey(now, tz), tz)[kid.id], cents);
  } catch (e) { return ''; /* the request matters more than the budget line */ }
}
