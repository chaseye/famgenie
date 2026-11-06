import assert from 'node:assert/strict';
import {seal, unseal, schoolMailQuery, googleReady} from '../lib/google.js';

const env = {TOKEN_KEY: 'k'.repeat(40)};
const sealed = await seal(env, '1//refresh-token-abc');
assert.notEqual(sealed, '1//refresh-token-abc');
assert.ok(!sealed.includes('refresh'));
assert.equal(await unseal(env, sealed), '1//refresh-token-abc');
await assert.rejects(unseal({TOKEN_KEY: 'other'}, sealed), 'a different key cannot read it');
assert.notEqual(await seal(env, 'x'), await seal(env, 'x'), 'fresh IV each time');

const q = schoolMailQuery({contacts: [{role: 'Teacher', email: 'alvarez@school.org'}, {role: 'Family', email: 'grandma@example.com'}, {role: 'Coach', email: ''}]});
assert.match(q, /newer_than:14d/);
assert.match(q, /from:alvarez@school\.org/);
assert.ok(!q.includes('grandma'), 'only school-related contacts');
assert.equal(googleReady({GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b'}), false);
assert.equal(googleReady({GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', TOKEN_KEY: 'c'}), true);
console.log('google: all tests passed');
