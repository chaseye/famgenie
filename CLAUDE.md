# FamGenie

Your family's AI assistant for parents of kids aged 4 to 22: check-ins, one inbox for tutors, teachers and coaches,
kids' money requests with parent approval, schedules with late alerts, and an AI brief. Live at
https://famgenie.chase-51e.workers.dev. Every push to `main` deploys.

## Stack (keep it)
- Cloudflare **Worker**: `src/worker.js` serves `public/` and routes the API. Config in `wrangler.jsonc` (D1 binding `DB`, cron every 10 min).
- API handlers in `functions/` use the Pages Functions shape (`onRequestGet` etc.) so the app also runs as Pages. New routes must be added to `src/worker.js` too.
- D1 (SQLite). Tables are created in code on first use (`lib/server.js`, `lib/calendars.js`, `lib/google.js`); there are no migration files.
- Plain JS, no framework or build step. `public/assets/shared.js` is shared by the browser and the server.
- Email: Resend. Texts: Twilio. AI: Claude Messages API (`lib/ai.js`). Google Calendar + Gmail read-only (`lib/google.js`).
- Settings and secrets are listed in `DEPLOY.md` and `.dev.vars.example`.

## Commands
- `npm test`: unit tests. `npm run test:e2e`: full backend on local Wrangler + D1 (Worker); `npm run test:e2e:pages` for Pages.
- `npm run dev`: local Worker. `npm run build:demo`: single-file demo in `dist/`.

## Rules that matter here
- FamGenie never holds or moves money; parents pay in their own apps.
- A child's location is shared only when the child acts (tap, reply, automation). No covert tracking; at 18+ sharing is their choice.
- Rules decide what needs a parent; the AI only words it. No phone numbers or locations go to the AI, and message text is passed as data.
- Children under 13: COPPA applies. Get counsel before launch.

## Replica skills (`.claude/skills/replica-*`)
FamGenie is an original app, not a clone. When using these skills:
- Use the stack above. Don't switch to Next.js, Vercel, Supabase or Stripe unless asked.
- `replica-architect`, `replica-backend`: review and extend the design here (D1 tables in code, Worker routes), not a new plan from scratch.
- `replica-design`: tokens live in `public/assets/style.css` (`:root`). To use `contrast.py`, write them to `replica/design/tokens.json` first.
- `replica-test`: plans go in `replica/`; add automated cases to `test/` in the existing style (node:assert, Wrangler e2e), not Playwright unless asked.
- `replica-entrepreneur`: research competitors' public reviews (Life360, Greenlight, Bark, Cozi, FamilyWall, ClassDojo, Remind). Every quote real and linked.
- `replica-launch`: landing page, pricing (Free / Family / Family Plus are drafts in Settings) and store listing.
- `replica-deploy`: skip the parity (`parity.py`) and rebrand sweep (`sweep.py`) gates; they are for clones. Use `npm test` and `npm run test:e2e` instead. Hosting is Cloudflare, not Vercel.
- Write working files to `replica/` at the repo root. It is not deployed (only `public/` is).

## Enhance, never replace
Improvements build on what's here. Don't remove, rename or rewrite existing features, copy or flows unless the owner
asks; propose those under "Needs your call" in `replica/improvements.md` instead. New work goes on a branch with a PR;
never merge your own PR.

## Growth kit (`MARKETING.md`)
- Weekly: the `growth-week` skill with the `promoter` and `ad-maker` agents builds `marketing/queue/<week>/` and opens a
  `growth/<monday>` PR. Merging it is the owner's approval; `.github/workflows/post-social.yml` then posts Facebook and Instagram.
- Monthly: the `app-improver` agent proposes and builds additive improvements on `improve/<date>`.
- Ads claim only `marketing/brand.json` facts and real features; `npm run growth:lint -- <campaign>` must pass.
- No paid ads, no automated posting to Reddit, LinkedIn, TikTok or groups (drafts only), no fake reviews or numbers.
