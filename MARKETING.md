# Growth kit: ads, posts and app improvements for FamGenie

Agents that make FamGenie's marketing and help improve the app, at no cost. Nothing posts and no app code changes
without your approval: every week arrives as a pull request, and **merging it is the approval**.

## What's here

| Piece | What it does |
|---|---|
| `.claude/skills/growth-week` | The weekly loop: plan, make ads and a video, check claims, build a review queue, open a PR. |
| `.claude/agents/promoter.md` | Plans the week's posts per channel, follows each community's rules, adds disclosure and tracked links. |
| `.claude/agents/ad-maker.md` | Writes ads and video from real features and real screenshots only (facts in `marketing/brand.json`). |
| `.claude/agents/app-improver.md` | Reads tests, feedback and results, proposes improvements, builds the top 1-3 **additive** ones on a branch and opens a PR. It never removes or rewrites your features; those go under "Needs your call". |
| `scripts/marketing/studio.mjs` | `screens` (app screenshots), `new`, `lint`, `build` (JPEG ads in every size, an MP4 for Reels/TikTok, the review queue). |
| `scripts/marketing/post-meta.mjs` + `.github/workflows/post-social.yml` | Posts approved Facebook and Instagram items at their times (3 checks a day) and records them in `marketing/posted.json`. |
| `marketing/brand.json` | Name, voice, colors, the facts ads may claim, banned phrases, competitors, which screens to capture. |

## The weekly flow

1. A scheduled task (or you: "run the growth week") opens a PR named `Growth: week of <date> (<theme>)`.
2. Open `marketing/queue/<week>/README.md` in the PR: every post with its image, time and text.
3. Change anything by editing `marketing/campaigns/<week>.json` (or ask Claude), set `"skip": true` on a post, or close the PR.
4. **Merge** to approve. Facebook and Instagram then post themselves at the times shown.
5. LinkedIn, Reddit, TikTok, groups and Product Hunt are ready-to-paste drafts in the same README. Those platforms either
   ban automated promotion or limit their APIs, so you post them by hand (about 2 minutes each).

The checker (`lint`) blocks: usage numbers that aren't in `brand.facts`, star ratings, "#1"/"best"/"guaranteed",
made-up testimonials, "trusted by", your banned phrases, raw links, missing disclosure on Reddit and groups, and
posts over each channel's limits. Add a fact to `brand.json` only once it's true (for example "500 families").

## One-time setup for automatic Facebook + Instagram posting

Free. About 20 minutes. Until the secrets exist, the workflow runs as a dry run and posts nothing.

1. **Facebook Page** for FamGenie (facebook.com/pages/create) if you don't have one.
2. **Instagram professional account** (Business or Creator), linked to that Page in Meta Business Suite > Settings > Accounts.
3. **Meta app**: developers.facebook.com > My Apps > Create app > type **Business**. Add the product *Facebook Login for Business* (or use Graph API Explorer).
4. **Page token** with `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`:
   - Graph API Explorer > pick your app > "Get User Access Token" with those permissions.
   - Exchange it for a long-lived user token (Access Token Debugger > "Extend Access Token").
   - Call `GET /me/accounts` with it; copy your Page's `id` and `access_token` (a Page token from a long-lived user token does not expire).
   - Call `GET /<page-id>?fields=instagram_business_account`; copy that `id` (the Instagram user ID).
5. **GitHub** > this repo > Settings > Secrets and variables > Actions > New repository secret:
   - `META_PAGE_ID`, `META_PAGE_TOKEN`, `META_IG_USER_ID`
   - Optional variable `META_API_VERSION` (default `v26.0`).
6. Test: Actions > *Post approved social* > Run workflow. With nothing due it says so and exits.

Never paste the token into a chat, a file or a commit; only into GitHub secrets. If a token leaks, revoke it in the Meta app and make a new one.

Instagram needs a public JPEG, so approved images are copied to `public/m/<week>/` and go live with the next deploy
(the poster waits for them). Posts more than 36 hours late are skipped, not posted out of season.

## Costs

| Item | Cost |
|---|---|
| Ads, video, queue (built locally or in a Claude session) | $0 |
| Facebook/Instagram Graph API | $0 |
| GitHub Actions poster (3 short runs a day, ~1 min each, ~90 min/month) | $0 on public repos; inside the 2,000 free min/month on private ones |
| Cloudflare hosting for the images | $0 (already part of the app) |
| Paid ads | none. The kit never spends money. If you want to boost a post later, do it yourself in Meta Ads Manager. |

## Running it on your own computer

```bash
npm i -D playwright && npx playwright install chromium   # screenshots and ad rendering
brew install ffmpeg        # or apt install ffmpeg; only for the video
npm run growth:screens
npm run growth:new                                     # next Monday's campaign skeleton
npm run growth:lint  -- marketing/campaigns/<week>.json
npm run growth:build -- marketing/campaigns/<week>.json
```
