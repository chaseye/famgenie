import assert from 'node:assert/strict';
import {parseIcs, parseIcsDate} from '../lib/ics.js';
import {zonedToUtc, tzParts, expandSchedule, kidExpectation, findConflicts, ruleBrief} from '../public/assets/shared.js';

const TZ = 'America/Chicago';
// Time zones: 4:30pm Chicago is 22:30Z in November (CST) and 21:30Z in October (CDT).
assert.equal(new Date(zonedToUtc(2026, 11, 10, 16, 30, TZ)).toISOString(), '2026-11-10T22:30:00.000Z');
assert.equal(new Date(zonedToUtc(2026, 10, 20, 16, 30, TZ)).toISOString(), '2026-10-20T21:30:00.000Z');
assert.deepEqual(tzParts(Date.parse('2026-11-10T22:30:00Z'), TZ), {y: 2026, m: 11, d: 10, h: 16, mi: 30, wd: 2});

const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:soccer@x
DTSTART;TZID=America/Chicago:20261027T163000
DTEND;TZID=America/Chicago:20261027T180000
RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261231T000000Z
EXDATE;TZID=America/Chicago:20261112T163000
SUMMARY:Soccer practice\\, U14
LOCATION:Lincoln Park field 3
END:VEVENT
BEGIN:VEVENT
UID:soccer@x
RECURRENCE-ID;TZID=America/Chicago:20261110T163000
DTSTART;TZID=America/Chicago:20261110T170000
DTEND;TZID=America/Chicago:20261110T183000
SUMMARY:Soccer practice (late start)
END:VEVENT
BEGIN:VEVENT
UID:trip@x
DTSTART;VALUE=DATE:20261113
DTEND;VALUE=DATE:20261114
SUMMARY:Zoo field trip
END:VEVENT
BEGIN:VEVENT
UID:conf@x
DTSTART:20261111T230000Z
DURATION:PT20M
SUMMARY:Parent-teacher
 conference
END:VEVENT
BEGIN:VEVENT
UID:gone@x
DTSTART:20261111T150000Z
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
END:VCALENDAR`;
const ev = parseIcs(ics, {fromMs: Date.parse('2026-11-09T00:00:00Z'), toMs: Date.parse('2026-11-16T00:00:00Z'), tz: TZ});
const titles = ev.map((e) => `${new Date(e.start).toISOString()} ${e.title}`);
assert.deepEqual(titles, [
  '2026-11-10T23:00:00.000Z Soccer practice (late start)',
  '2026-11-11T23:00:00.000Z Parent-teacherconference',
  '2026-11-13T06:00:00.000Z Zoo field trip',
], titles.join('\n'));
assert.equal(ev.find((e) => e.title.startsWith('Parent')).end - ev.find((e) => e.title.startsWith('Parent')).start, 20 * 60e3);
assert.equal(ev.find((e) => e.title === 'Zoo field trip').allDay, true);
const later = parseIcs(ics, {fromMs: Date.parse('2026-11-16T00:00:00Z'), toMs: Date.parse('2026-11-21T00:00:00Z'), tz: TZ});
assert.deepEqual(later.map((e) => e.title), ['Soccer practice, U14', 'Soccer practice, U14']);
assert.equal(parseIcsDate('20261106', {}, TZ).allDay, true);
assert.equal(parseIcs('garbage', {fromMs: 0, toMs: Date.now()}).length, 0);

// Weekly activities and expectations.
const sched = [{id: 's1', kidIds: ['maya'], title: 'Soccer', days: [2, 4], start: '16:30', end: '18:00', placeId: 'field'},
  {id: 's2', kidIds: ['leo'], title: 'Swim', days: [2, 4], start: '16:30', end: '17:15', placeId: 'ymca'}];
const from = Date.parse('2026-11-09T06:00:00Z'), to = Date.parse('2026-11-16T06:00:00Z');
const events = expandSchedule(sched, from, to, TZ);
assert.equal(events.length, 4);
assert.equal(new Date(events[0].start).toISOString(), '2026-11-10T22:30:00.000Z');
const at = (iso) => Date.parse(iso);
assert.equal(kidExpectation('maya', events, [], at('2026-11-10T22:35:00Z')).state, 'due');
assert.equal(kidExpectation('maya', events, [], at('2026-11-10T22:45:00Z')).state, 'late');
assert.equal(kidExpectation('maya', events, [{kidId: 'maya', at: at('2026-11-10T22:40:00Z'), confidence: 'gps', placeId: 'field', text: 'At field'}], at('2026-11-10T22:45:00Z')).state, 'confirmed');
assert.equal(kidExpectation('maya', events, [{kidId: 'maya', at: at('2026-11-10T22:40:00Z'), confidence: 'gps', placeId: 'home', text: 'At Home'}], at('2026-11-10T22:45:00Z')).state, 'elsewhere');
assert.equal(kidExpectation('maya', events, [], at('2026-11-10T20:00:00Z')).state, 'upcoming');
const y = new Date().getFullYear();
const kids = [{id: 'maya', name: 'Maya', birthday: `${y - 14}-01-01`}, {id: 'leo', name: 'Leo', birthday: `${y - 7}-01-01`}];
assert.equal(findConflicts(events, kids, from, to).length, 2, 'Tue and Thu: swim and soccer at the same time');

// The brief.
const family = {timezone: TZ, kids, contacts: [{id: 'p', name: 'Priya', allow: true, phone: '+1555', kind: 'person'}], places: [{id: 'field', name: 'Lincoln Park field 3'}, {id: 'ymca', name: 'Westside Y'}]};
const items = ruleBrief({family, events, signals: [], money: [{kind: 'request', status: 'pending', kidId: 'maya', amountCents: 4000, payee: 'Priya', category: 'Tutoring', id: 'r1'}],
  messages: [{dir: 'in', phone: '+1555', body: 'Can we move Thursday?', at: at('2026-11-10T21:00:00Z')}], now: at('2026-11-10T22:45:00Z')});
const kinds = items.map((i) => i.kind);
assert.deepEqual(kinds.slice(0, 3), ['late', 'late', 'money']);
assert.match(items[0].text, /isn’t confirmed at (Lincoln Park field 3|Westside Y) \((Soccer|Swim), started 4:30pm\)/);
assert.ok(kinds.includes('reply'));
console.log('ics + schedule: all tests passed');
