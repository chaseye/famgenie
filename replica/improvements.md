# FamGenie improvements

Newest run first. Each run: ranked ideas, then what was built, then "Needs your call" (not built; the owner decides).

## 2026-11-11

Inputs: `CLAUDE.md`, `README.md`, `DEPLOY.md`, `git log` (5 commits), tests (`npm test`, `npm run test:e2e` both passed on
`main`), `replica/feedback.md` (new this run: 14 competitor quotes from 9 pages), growth queue `marketing/queue/2026-11-09/`
on `origin/growth/2026-11-09` (drafts only, no audience feedback yet), a code read of the API, kid pages and scheduler, and the
demo build at 390px wide (Home and Money). Missing: `replica/fixes.md`, `marketing/results.md`, `marketing/posted.json`, and
`DEPLOY.md` has no "What's next" section.

| Rank | Idea | Evidence | Impact | Effort | Additive? |
|---|---|---|---|---|---|
| 1 | **Budget line in the parent's money-request text.** "Maya asked for $40.00 to Priya Shah (Tutoring)... After this: $110.00 left of $150.00 this month." or "This would be $10.00 over this month's $150.00 budget." Same math as the app's "After this". | Greenlight review: "Greenlight needs to add low balance alert on child's account that is texted to parent." ([Trustpilot](https://www.trustpilot.com/review/greenlight.com?page=5), feedback.md #13). The app already shows "After this" on the Money card (`app.js` ~line 628) but the text (`lib/kid.js`) didn't, so a parent deciding from the text was missing it. | H | S | yes. **Built** |
| 2 | **Fix: monthly budgets use the family's time zone.** `monthKey` used UTC, so a payment at 7pm on Oct 31 in Chicago counted toward November, and "left this month" reset early on the last evening of each month (US families, every month). | Code: `shared.js` `monthKey = (ts) => new Date(ts).toISOString().slice(0, 7)`; new unit test shows Oct 31 7pm CDT → `2026-11` before the fix. | M | S | yes. **Built** (optional `tz` parameter; old calls behave the same) |
| 3 | **Fix: check-in page shows expiry on the family's clock.** "This link works once and expires at 5:15 PM" was always Chicago time, so 6:15 PM in New York showed as 5:15 PM. | Code: `lib/pages.js` hard-coded `timeZone: 'America/Chicago'`; new `test/pages.test.mjs`. | M | S | yes. **Built** |
| 4 | Make failed alert texts visible: if the late alert or the "replied 2: needs help" text to the parent fails (Twilio error), show it in the brief so it isn't silently lost. Today the failure is only a log line (`lib/cron.js`, `hooks/sms.js`). | Life360: "never notified!" (feedback.md #6); ClassDojo: notifications "don't come through" (#9); Remind: "hard to tell ... who all received a message" (#11). | H | M | yes (needs a small new table or a status column on `alerts_sent`; new data only, old data still reads) |
| 5 | Accept "yes", "y", "ok" as a "1" reply to a text check-in (keep "1"/"2" as the documented answers). Today "Yes" lands in the inbox and the check-in stays open. | Code: `hooks/sms.js` accepts only the digits 1 or 2. No user report yet; a guess about how kids reply. | M | S | yes |
| 6 | "Close to budget" item in the brief when a child has spent 90%+ of their monthly budget (the Money meter already turns "hot" at 90%). Rules decide; the AI only words it. | Greenlight quote #13 (low-balance alert); `app.js` meter `pct >= 90 ? 'hot'`. | M | S | yes |
| 7 | Per-member delivery list for group texts ("sent to 7 of 8: Jen failed"). Today the status is a count only. | Remind: "It is hard to tell sometimes who all received a message." (#11) | M | M | yes |
| 8 | Quiet hours for late alerts (e.g. no texts 9pm to 7am except "needs help"). | Bark: "alerts ... just ridiculous" (#8), "ridiculously wrong" (#7). | M | M | yes (new optional setting; old families default to today's behaviour) |
| 9 | Snooze a single date from a synced calendar (e.g. a cancelled practice) so it doesn't trigger a late alert. | FamilyWall: "Is there anyway to snooze specific dates on the calendar that are syncing" (feedback.md, Also seen). | M | M | yes |
| 10 | Growth copy: "works by plain text, no app for coaches" and "FamGenie never holds your money" as tested angles. | Remind dropped SMS (#10); Greenlight held funds (#14). | M | S | needs your call (add to `brand.json` facts first; marketing, not app) |

### Built on `improve/2026-11-11`

1. Budget line in the parent's request text (`lib/kid.js` `budgetLine`, `shared.js` `budgetAfter`). Only when the child has a
   monthly budget; if the lookup fails, the text goes out as before. Uses plain `'` so texts stay in one SMS encoding.
2. `monthKey(ts, tz)` and `tally(entries, kids, month, tz)` take an optional time zone. The app, the kid page and the new text
   pass the family's time zone. Without `tz` both behave exactly as before.
3. `checkinPage({..., tz})`: `/c/<token>` passes the family's time zone; default stays `America/Chicago`.

Tests: `test/shared.test.mjs` (monthKey and tally across a month boundary in three zones; `budgetAfter` under, at and over budget,
and with no budget), new `test/pages.test.mjs` (expiry time in New York, Los Angeles and the default), `test/e2e.test.mjs`
(the parent's text after a `PAY 40` shows "$110.00 left of $150.00"; after paying, the kid page shows $110.00 left and a $120
request texts "This would be $10.00 over this month's $150.00 budget").
No new routes, tables, settings or stored fields. No location or phone data goes anywhere new; the AI is not involved.

### Needs your call (not built)

- **Brand facts for ads** (#10): add "never holds or moves money" and "works by plain text" to `marketing/brand.json` facts so
  growth posts can use them.
- **Forward-to-address for school email** instead of Gmail read-only (DEPLOY.md already notes Gmail is a "restricted" scope
  with a yearly security assessment). New intake path and new privacy surface: owner decision.
- **Translated kid pages and texts** (Spanish first). A ClassDojo reviewer noted some parents and nannies "might not be so good
  at understanding English" ([Capterra](https://capterra.com/p/124446/ClassDojo/reviews/)). Additive but L effort and changes copy
  in every text; worth a decision on languages and who reviews translations.
- **COPPA before launch**: verifiable parental consent and a written retention policy for under-13s (README). Needs counsel,
  not code.
- **Add a "What's next" section to `DEPLOY.md`** so monthly runs can read the owner's own priorities.
