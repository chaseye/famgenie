import assert from 'node:assert/strict';
import {checkinPage} from '../lib/pages.js';

// The check-in page shows when the link expires on the family's clock, not a fixed time zone.
const expiresAt = Date.UTC(2026, 10, 11, 23, 15); // 5:15pm Chicago, 6:15pm New York, 3:15pm Los Angeles
const page = (tz) => checkinPage({token: 'tok_abcdefghijkl', kidName: 'Maya', asker: 'Mom', reason: 'practice', expiresAt, tz});
assert.match(page('America/New_York'), /expires at 6:15\s?PM\./);
assert.match(page('America/Los_Angeles'), /expires at 3:15\s?PM\./);
assert.match(page(undefined), /expires at 5:15\s?PM\./, 'falls back to the default time zone');
assert.match(page('America/New_York'), /Mom is asking if you made it to practice/);
console.log('pages: all tests passed');
