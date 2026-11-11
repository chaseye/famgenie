import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {perConversion, programMonth, estimate, actuals} from '../scripts/monetize/income.mjs';

const registry = JSON.parse(readFileSync(new URL('../marketing/affiliates.json', import.meta.url), 'utf8'));

// Payout kinds
assert.equal(perConversion({kind: 'perLead', usd: 52}), 52);
assert.equal(perConversion({kind: 'percent', rate: 0.16, assumedOrderUsd: 150}), 24);
assert.throws(() => perConversion({kind: 'mystery'}));

// One program: 1,000 families × 1% clicks × 10% conversion × $52 = $52
const gl = programMonth({id: 'g', fit: 'ok', status: 'not applied', payout: {kind: 'perLead', usd: 52}, assume: {clickRate: 0.01, convRate: 0.1}}, 1000);
assert.equal(gl.clicks, 10);
assert.ok(Math.abs(gl.usd - 52) < 1e-9);

// Excluded or conflicting programs never count
assert.equal(programMonth({id: 'x', fit: 'conflict', status: 'excluded', payout: {kind: 'perLead', usd: 99}, assume: {clickRate: 1, convRate: 1}}, 1000).usd, 0);
const bark = registry.programs.find((p) => p.id === 'bark');
assert.equal(bark.status, 'excluded', 'message-reading monitoring stays out unless the owner decides otherwise');

// Scenarios scale linearly and sponsors count only once signed
const a = estimate(registry, 1000), b = estimate(registry, 10000);
assert.ok(a.total > 0);
assert.ok(Math.abs(b.total - a.total * 10) < 1e-6);
assert.equal(a.sponsors, 0);
const withDeal = estimate({...registry, sponsors: {deals: [{status: 'signed', usdPerMonth: 300}, {status: 'talking', usdPerMonth: 900}]}}, 1000);
assert.equal(withDeal.sponsors, 300);

// Registry rules: every counted program has a source link, a parent-facing placement and sane assumptions
for (const p of registry.programs) {
  assert.match(p.source, /^https:\/\//, `${p.id} needs a source link`);
  assert.ok(p.assume.clickRate >= 0 && p.assume.clickRate < 0.2 && p.assume.convRate >= 0 && p.assume.convRate < 0.5, `${p.id} assumptions look off`);
  assert.doesNotMatch(p.placement, /\/c\/|\/k\/|kid page|text to (a )?child/i, `${p.id} must not be placed on a child's page or text`);
}

// Actuals from a network export
const csv = 'date,program,usd\n2026-12-03,kiwico,20\n2026-12-15,greenlight,52\n2027-01-02,kiwico,20\nbad,row,x\n';
const act = actuals(csv);
assert.equal(act['2026-12'].total, 72);
assert.equal(act['2026-12'].byProgram.kiwico, 20);
assert.equal(act['2027-01'].total, 20);
assert.throws(() => actuals('when,who\n1,2'));

console.log('monetize: all tests passed');
