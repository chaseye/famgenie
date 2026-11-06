---
name: growth-week
description: Runs this app's weekly growth loop end to end at no cost - plan the week's promotion, make the ads and videos, check every claim, build the review queue, and open a pull request for the owner to approve. Merging the pull request is the approval; approved Facebook and Instagram posts then go out on schedule. Use for "run the growth week", "this week's marketing", "make and queue the posts", or from the weekly scheduled task.
---

# Growth week

Everything here is additive: it never changes app code, only `marketing/` (and the approved images under the public `m/` folder).

1. **Start**: `git checkout -b growth/<monday-date>` from an up-to-date `main`. Run `node scripts/marketing/studio.mjs new <monday-date>` (next Monday if not given).
2. **Refresh screens** if the app changed since the last run: `node scripts/marketing/studio.mjs screens`.
3. **Plan the week** with the `promoter` agent (posts, schedule, channels, theme, goal).
4. **Make the creatives** with the `ad-maker` agent (ads and a video for TikTok/Reels).
5. **Check**: `node scripts/marketing/studio.mjs lint marketing/campaigns/<week>.json`. No errors allowed.
6. **Build**: `node scripts/marketing/studio.mjs build marketing/campaigns/<week>.json`. Open every image in `marketing/queue/<week>/ads/` and look at it; fix and rebuild anything cut off or hard to read.
7. **Review queue**: commit `marketing/` and `public/m/<week>/` (or the app's publicDir), push the branch, and open a pull request titled `Growth: week of <week> (<theme>)`. Body: the theme, goal and why; a table of every post (channel, time, auto or by hand); "Merge to approve. Facebook and Instagram post automatically; the rest are drafts in marketing/queue/<week>/README.md."
8. **Never** merge it yourself, post anything by hand, or spend money.

If the app has no `marketing/brand.json`, stop and say so.
