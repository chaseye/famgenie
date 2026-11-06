import assert from 'node:assert/strict';
import {lintCampaign, utm, fillLinks, neededFormats, buildQueue, CHANNELS} from '../scripts/marketing/lib.mjs';
import {duePosts} from '../scripts/marketing/post-meta.mjs';
import {readFileSync} from 'node:fs';

const brand = JSON.parse(readFileSync(new URL('../marketing/brand.json', import.meta.url), 'utf8'));
const shot = brand.screens.shots[0].name;
const good = {
  week: '2026-11-09', theme: 'Know they got there', goal: 'sign-ups', ads: [
    {id: 'arrive', layout: 'phone', headline: 'Know they **got there**', sub: 'One tap tells you.', cta: 'Try it free', screen: shot, theme: 'dark'},
    {id: 'big', layout: 'statement', headline: 'One inbox for every coach', theme: 'light'},
  ],
  posts: [
    {id: 'fb1', channel: 'facebook', when: '2026-11-09T19:30:00-06:00', ad: 'arrive', text: 'New this week. {link}'},
    {id: 'ig1', channel: 'instagram', when: '2026-11-10T19:30:00-06:00', ad: 'arrive', text: 'Link in bio. #parenting'},
    {id: 'rd1', channel: 'reddit', when: '2026-11-11T12:00:00-06:00', title: 'I built a thing', where: 'r/SideProject', text: 'I made this for my family. {link}'},
    {id: 'li1', channel: 'linkedin', when: '2026-11-12T08:30:00-06:00', ad: 'big', text: 'What I learned building it. {link:/}'},
  ],
};
const now = Date.parse('2026-11-08T00:00:00Z');
assert.deepEqual(lintCampaign({...good, posts: [{...good.posts[0], text: 'Kids lose track. Parents become the router. {link}'}]}, brand, {now}).errors, [], 'a period before a word is not a number');
assert.deepEqual(lintCampaign(good, brand, {now}).errors, [], 'a clean campaign passes');

const bad = structuredClone(good);
bad.ads[0].headline = 'Trusted by 10,000 families, the #1 app';
bad.ads[1].headline = 'x'.repeat(60);
bad.posts[0].text = 'Go to https://example.com now';
bad.posts[2].text = 'Check out this app {link}';
bad.posts[1].ad = undefined;
bad.posts.push({id: 'tt1', channel: 'tiktok', when: '2026-11-13T19:00:00-06:00', text: 'watch'});
bad.posts.push({id: 'fb1', channel: 'facebook', when: '2026-11-13T19:00:00-06:00', text: '“This changed our mornings completely” - Jessica'});
const errs = lintCampaign(bad, brand, {now}).errors.join('\n');
for (const re of [/10,000 families/, /ranking or guarantee/, /headline is 60 characters/, /raw URL/, /must say you made it/, /instagram needs an image/, /TikTok needs/, /unique id/, /testimonial/]) assert.match(errs, re);

const u = new URL(utm('https://app.example/?a=1', {channel: 'facebook', campaign: '2026-11-09 Know They!', content: 'fb1'}));
assert.equal(u.searchParams.get('utm_source'), 'facebook');
assert.equal(u.searchParams.get('utm_medium'), 'social');
assert.equal(u.searchParams.get('utm_campaign'), '2026-11-09-know-they');
assert.equal(u.searchParams.get('a'), '1');
assert.equal(new URL(utm('https://app.example/', {channel: 'reddit', campaign: 'x'})).searchParams.get('utm_medium'), 'community');
assert.match(fillLinks('Hi {link:/pricing}', {url: 'https://app.example'}, {channel: 'linkedin', id: 'li1'}, {week: 'w', theme: 't'}), /^Hi https:\/\/app\.example\/pricing\?utm_source=linkedin/);

const need = neededFormats(good);
assert.deepEqual([...need.get('arrive')].sort(), ['portrait']);
assert.deepEqual([...need.get('big')], ['landscape']);

const q = buildQueue(good, {...brand, url: 'https://app.example'});
const fb = q.find((p) => p.id === 'fb1');
assert.equal(fb.auto, true);
assert.equal(fb.image, 'ads/arrive-portrait.jpg');
assert.equal(fb.publicImage, '/m/2026-11-09/arrive-portrait.jpg');
assert.match(fb.text, /utm_source=facebook/);
assert.equal(q.find((p) => p.id === 'li1').publicImage, null, 'manual channels are not published to the site');
assert.equal(q.find((p) => p.id === 'rd1').auto, false);

const queues = [{week: '2026-11-09', posts: q}];
const at = Date.parse('2026-11-10T02:00:00Z'); // after fb1 (01:30Z), before ig1
assert.deepEqual(duePosts(queues, {}, at, ['facebook', 'instagram']).map((p) => p.id), ['fb1']);
assert.deepEqual(duePosts(queues, {[queues[0].week + ':fb1:facebook']: {}}, at, ['facebook', 'instagram']).map((p) => p.id), [], 'never posts twice');
assert.deepEqual(duePosts(queues, {['1999-01-04:fb1:facebook']: {}}, at, ['facebook']).map((p) => p.id), ['fb1'], 'same post id in another week still posts');
assert.deepEqual(duePosts(queues, {}, at + 3 * 864e5, ['facebook', 'instagram']).map((p) => p.id), [], 'too late: skipped, not posted days late');
assert.deepEqual(duePosts([{week: 'w', posts: q.map((p) => ({...p, skip: true}))}], {}, at, ['facebook']).length, 0, 'skipped posts stay skipped');
assert.deepEqual(duePosts(queues, {}, Date.parse('2026-11-11T02:00:00Z'), ['facebook']).map((p) => p.id), ['fb1'], 'Instagram waits until it is connected');
assert.ok(Object.values(CHANNELS).every((c) => c.format));
console.log('marketing: all tests passed');
