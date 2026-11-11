import assert from 'node:assert/strict';
import {normPhone, ageOf, methodBlocked, defaultMethods, METHODS, matchPlace, toCents, fmtMoney, parseMoneyText, guessRequest, payLink, tally, monthKey, budgetAfter} from '../public/assets/shared.js';

const m = (id) => METHODS.find((x) => x.id === id);
const y = new Date().getFullYear();

assert.equal(normPhone('(312) 555-0142'), '+13125550142');
assert.equal(normPhone('1 312 555 0142'), '+13125550142');
assert.equal(normPhone('+44 20 7946 0958'), '+442079460958');
assert.equal(normPhone(''), '');

assert.equal(ageOf('2010-12-31', new Date(2026, 11, 30)), 15);
assert.equal(ageOf('2010-12-31', new Date(2026, 11, 31)), 16);
assert.equal(ageOf('bad'), null);

const leo = {birthday: `${y - 7}-01-01`, device: 'watch'};
const maya = {birthday: `${y - 14}-01-01`, device: 'iphone'};
const sam = {birthday: `${y - 19}-01-01`, device: 'android'};
const basic = {birthday: `${y - 11}-01-01`, device: 'basic'};
assert.equal(methodBlocked(m('link'), leo), 'For ages 10–22');
assert.equal(methodBlocked(m('reply'), basic), '');
assert.equal(methodBlocked(m('link'), basic), 'Needs a smartphone');
assert.equal(methodBlocked(m('carrier'), maya), 'Coming soon');
assert.deepEqual(defaultMethods(leo), ['school', 'tag', 'watch']);
assert.deepEqual(defaultMethods(maya), ['link', 'reply', 'hub', 'shortcut', 'school']);
assert.deepEqual(defaultMethods(sam), ['link', 'hub', 'share'], 'adults get consent-only options');

const places = [{id: 'a', name: 'Lincoln High', lat: 41.918, lon: -87.644, radius: 200}, {id: 'b', name: 'Home', lat: 41.9214, lon: -87.6513, radius: 120}];
assert.equal(matchPlace(places, 41.9181, -87.6441, 10)?.name, 'Lincoln High');
assert.equal(matchPlace(places, 41.95, -87.7, 10), null);

assert.equal(toCents('40'), 4000);
assert.equal(toCents('$1,250.50'), 125050);
assert.equal(toCents('-5'), 0);
assert.equal(toCents('abc'), 0);
assert.equal(fmtMoney(125050), '$1,250.50');

assert.deepEqual(parseMoneyText('PAY 40 Priya tutoring'), {cents: 4000, rest: 'Priya tutoring'});
assert.deepEqual(parseMoneyText('need $25.50 for field trip'), {cents: 2550, rest: 'field trip'});
assert.equal(parseMoneyText('hey mom'), null);
assert.equal(parseMoneyText('pay 0 nobody'), null);

const contacts = [{id: 'p1', name: 'Priya Shah', role: 'Tutor', kind: 'person'}, {id: 'c1', name: 'Coach Rivera', role: 'Coach', kind: 'person'}];
assert.deepEqual(guessRequest('Priya tutoring', contacts), {contactId: 'p1', payee: 'Priya Shah', category: 'Tutoring'});
assert.equal(guessRequest('field trip', contacts).category, 'School fees');
assert.equal(guessRequest('uber home', contacts).category, 'Transport');

assert.equal(payLink('venmo', '@PriyaShah-Tutor', 4000, 'Maya: tutoring'), 'https://venmo.com/PriyaShah-Tutor?txn=pay&amount=40.00&note=Maya%3A%20tutoring');
assert.equal(payLink('cashapp', '$priya', 4000, ''), 'https://cash.app/$priya/40.00');
assert.equal(payLink('paypal', 'https://paypal.me/priya', 1999, ''), 'https://paypal.me/priya/19.99USD');
assert.equal(payLink('zelle', 'priya@example.com', 4000, ''), '');

const now = Date.UTC(2026, 10, 5);
const kids = [{id: 'k1', monthlyBudget: 15000}, {id: 'k2', monthlyBudget: 0}];
const t = tally([
  {kidId: 'k1', kind: 'payment', status: 'paid', amountCents: 4000, category: 'Tutoring', paidAt: now},
  {kidId: 'k1', kind: 'request', status: 'pending', amountCents: 2500, createdAt: now},
  {kidId: 'k1', kind: 'request', status: 'paid', amountCents: 1000, category: 'Food', paidAt: now},
  {kidId: 'k1', kind: 'request', status: 'declined', amountCents: 9999, createdAt: now},
  {kidId: 'k1', kind: 'topup', status: 'paid', amountCents: 2000, paidAt: now},
  {kidId: 'k1', kind: 'payment', status: 'paid', amountCents: 7777, paidAt: Date.UTC(2026, 9, 5)},
  {kidId: 'k2', kind: 'payment', status: 'paid', amountCents: 500, category: 'Other', paidAt: now},
], kids, '2026-11');
assert.deepEqual(t.k1, {spent: 5000, topups: 2000, pending: 2500, pendingCount: 1, budget: 15000, byCategory: {Tutoring: 4000, Food: 1000}, left: 10000});
assert.equal(t.k2.left, null);

// Months follow the family's time zone: 7pm on Oct 31 in Chicago is already Nov 1 in UTC.
const halloweenEvening = Date.UTC(2026, 10, 1, 0, 0); // Oct 31, 7:00pm CDT
assert.equal(monthKey(halloweenEvening), '2026-11', 'without a time zone it stays UTC, as before');
assert.equal(monthKey(halloweenEvening, 'America/Chicago'), '2026-10');
assert.equal(monthKey(Date.UTC(2026, 11, 1, 5, 30), 'America/Los_Angeles'), '2026-11');
assert.equal(monthKey(Date.UTC(2026, 11, 1, 5, 30), 'America/New_York'), '2026-12');
const late = [{kidId: 'k1', kind: 'payment', status: 'paid', amountCents: 3000, category: 'Food', paidAt: halloweenEvening}];
assert.equal(tally(late, kids, '2026-10', 'America/Chicago').k1.spent, 3000, 'counted in October for a Chicago family');
assert.equal(tally(late, kids, '2026-11', 'America/Chicago').k1.spent, 0, 'and not in November');

// The budget line in the parent's text matches the app's "After this".
assert.equal(budgetAfter(t.k1, 4000), 'After this: $60.00 left of $150.00 this month.');
assert.equal(budgetAfter(t.k1, 10000), 'After this: $0.00 left of $150.00 this month.');
assert.equal(budgetAfter(t.k1, 12500), "This would be $25.00 over this month's $150.00 budget.");
assert.equal(budgetAfter(t.k2, 500), '', 'no budget, no line');
assert.equal(budgetAfter(undefined, 500), '');
console.log('shared: all tests passed');
