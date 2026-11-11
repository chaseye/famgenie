import assert from 'node:assert/strict';
import {runChecks, aiFactsLeak, findTrackers, findAffiliateHosts, externalScripts} from '../scripts/privacy-guard.mjs';

// The detectors catch what they should
assert.deepEqual(findTrackers('<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>'), ['googletagmanager.com']);
assert.ok(findTrackers('<script>fbq("init","1")</script>').includes('fbq('));
assert.deepEqual(findTrackers('<p>Pick-up is at 3:15</p>'), []);
assert.deepEqual(findAffiliateHosts('Get it at https://www.amazon.com/dp/X?tag=fam-20'), ['amazon.com']);
assert.deepEqual(findAffiliateHosts('Text 1 if you made it to practice'), []);
assert.deepEqual(externalScripts('<script src="https://cdn.example.com/a.js"></script><script src="/assets/app.js"></script>'), ['cdn.example.com']);

// The app as it stands passes every check
for (const r of runChecks()) assert.deepEqual(r.problems, [], r.name);
assert.deepEqual(await aiFactsLeak(), [], 'the AI never sees phone numbers or locations');

console.log('privacy: all tests passed');
