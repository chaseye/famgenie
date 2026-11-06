import assert from 'node:assert/strict';
import {twilioSignature, smsMode} from '../lib/sms.js';

// Twilio's documented example (Security page)
const sig = await twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2',
  {CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212'});
assert.equal(sig, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='); // matches an independent HMAC-SHA1 check
assert.equal(smsMode({DEV_SMS_LOG: '1'}), 'dry-run');
assert.equal(smsMode({}), 'off');
assert.equal(smsMode({TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b', TWILIO_FROM: '+1'}), 'live');
console.log('sms: all tests passed');
