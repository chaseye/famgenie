/* Monthly affiliate income estimate from marketing/affiliates.json.
 *   node scripts/monetize/income.mjs                 → scenarios at 1,000 / 10,000 / 50,000 active families
 *   node scripts/monetize/income.mjs 2500            → one family count
 *   node scripts/monetize/income.mjs --actual <csv>  → real commissions from a network export (columns: date,program,usd)
 * Estimates use the planning assumptions in the registry; they are guesses until real click and sale numbers replace them.
 * Only parent-facing, signed-off programs count (fit "ok", status not "excluded"). Sponsors count only once a deal is signed. */
import {readFileSync} from 'node:fs';

export const SCENARIOS = [1000, 10000, 50000];

/* Commission for one conversion. */
export function perConversion(payout) {
  if (payout.kind === 'perLead' || payout.kind === 'perSale') return payout.usd;
  if (payout.kind === 'percent') return payout.rate * (payout.assumedOrderUsd || 0);
  throw new Error(`unknown payout kind: ${payout.kind}`);
}

/* One program's month at a family count: clicks → conversions → dollars (plus any per-sign-up extra). */
export function programMonth(p, families) {
  if (p.fit !== 'ok' || p.status === 'excluded') return {id: p.id, clicks: 0, conversions: 0, usd: 0};
  const clicks = families * p.assume.clickRate;
  const conversions = clicks * p.assume.convRate;
  let usd = conversions * perConversion(p.payout);
  if (p.payout.extraPerLeadUsd) usd += clicks * (p.payout.extraLeadRate || 0) * p.payout.extraPerLeadUsd;
  return {id: p.id, clicks, conversions, usd};
}

export function estimate(registry, families) {
  const rows = registry.programs.map((p) => programMonth(p, families));
  const sponsors = (registry.sponsors?.deals || []).filter((d) => d.status === 'signed').reduce((s, d) => s + (d.usdPerMonth || 0), 0);
  const affiliates = rows.reduce((s, r) => s + r.usd, 0);
  return {families, rows, affiliates, sponsors, total: affiliates + sponsors, perFamily: families ? (affiliates + sponsors) / families : 0};
}

/* Real money: a network CSV export with a header row "date,program,usd". Sums per month and program. */
export function actuals(csv) {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const cols = head.split(',').map((c) => c.trim().toLowerCase());
  const di = cols.indexOf('date'), pi = cols.indexOf('program'), ui = cols.indexOf('usd');
  if (di < 0 || pi < 0 || ui < 0) throw new Error('CSV needs date, program and usd columns');
  const out = {};
  for (const line of lines) {
    const c = line.split(',');
    const month = String(c.at(di)).slice(0, 7), prog = String(c.at(pi)).trim(), usd = Number(c.at(ui));
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(usd)) continue;
    out[month] ??= {total: 0, byProgram: {}};
    out[month].total += usd;
    out[month].byProgram[prog] = (out[month].byProgram[prog] || 0) + usd;
  }
  return out;
}

const usd = (n) => `$${n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const registry = JSON.parse(readFileSync(new URL('../../marketing/affiliates.json', import.meta.url), 'utf8'));
  const args = process.argv.slice(2);
  if (args[0] === '--actual') {
    for (const [m, v] of Object.entries(actuals(readFileSync(args[1], 'utf8'))).sort()) console.log(`${m}  ${usd(v.total)}  ${JSON.stringify(v.byProgram)}`);
  } else {
    for (const n of args.length ? args.map(Number) : SCENARIOS) {
      const e = estimate(registry, n);
      console.log(`\n${n.toLocaleString('en-US')} active families: ${usd(e.total)} a month (estimate, ${usd(e.perFamily)} per family)`);
      for (const r of e.rows.filter((r) => r.usd > 0).sort((a, b) => b.usd - a.usd)) console.log(`  ${r.id.padEnd(16)} ${usd(r.usd).padStart(12)}  (${r.clicks.toFixed(0)} clicks, ${r.conversions.toFixed(1)} sales)`);
    }
  }
}
