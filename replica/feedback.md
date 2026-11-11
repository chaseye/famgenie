# Competitor feedback · 2026-11-11

Focused pass on public reviews of the competitors named in `CLAUDE.md`, looking for complaints FamGenie can answer.

**Method and sample.** 9 public review pages fetched on 2026-11-11 (Trustpilot, Apple App Store, Capterra). Across them, about 40
reviews were scanned, and **14 quotes** were kept below. Pages were read with a web-fetch tool that returns short excerpts
(about 125 characters at most), so most quotes are **excerpts of longer reviews**, copied exactly, typos included. A direct
download to double-check each one was blocked by the network proxy, so each quote rests on one fetch of the linked page.
Review pages reorder over time; the date and reviewer let you find each one again. This is a small, hand-picked sample of
complaints, not a measure of how common they are. No quote here is made up or reworded.

Not covered this run: Cozi and FamilyWall pages showed mostly positive reviews (each 4.8 stars on the App Store: Cozi 403K
ratings, FamilyWall 25K), so they add one quote each. Reddit and Google Play were not used.

## 1. Location trackers: inaccurate, laggy, and they feel like surveillance

| # | Quote | Who / when | Source |
|---|---|---|---|
| 1 | "What’s the point of an app that claims to keep your family safe if It’s not accurate and extremely laggy?" | RSM, 2 stars, Nov 15, 2025 | [Life360 on Trustpilot, page 6](https://www.trustpilot.com/review/life360.com?page=6) |
| 2 | "locations were usually off by over one hundred feet under clear sky." | thosely, 1 star, Nov 8, 2025 | [Life360 on Trustpilot, page 6](https://www.trustpilot.com/review/life360.com?page=6) |
| 3 | "The tracking wasn't accurate, it would take hours to update" | Lynda Coulson (GB), 1 star, Jul 5, 2026 | [Life360 on Trustpilot UK, page 2](https://uk.trustpilot.com/review/life360.com?page=2) |
| 4 | "stalking other family members including myself and asking where are you going? What are you doing?" | Lynda Coulson (GB), 1 star, Jul 5, 2026 (same review as 3) | [Life360 on Trustpilot UK, page 2](https://uk.trustpilot.com/review/life360.com?page=2) |
| 5 | "I’ve read negetive reviews about Life 360, concerning privacy and the trust issues it can create." | "Love it!" by Los My Uit, 29/12/2021 (a positive review) | [Life360 on the App Store (ZA)](https://apps.apple.com/za/app/id384830320) |

**FamGenie already answers this:** location only when the child acts, every status labeled by source and confidence.

## 2. Alerts that don't arrive, or arrive wrong

| # | Quote | Who / when | Source |
|---|---|---|---|
| 6 | "We PAY for Gold Membership for the purpose of crash detection, and were never notified!" | Jody Brownfield (US), 1 star, Aug 18, 2026 | [Life360 on Trustpilot UK, page 2](https://uk.trustpilot.com/review/life360.com?page=2) |
| 7 | "The alerta are ridiculously wrong every single time." | name not shown, 1 star, Mar 12, 2026 | [Bark on Trustpilot (AT), 63 reviews](https://at.trustpilot.com/review/bark.us) |
| 8 | "There were alerts I was receiveing that were just ridiculous." | name not shown, 1 star, Aug 20, 2025 | [Bark on Trustpilot (AT)](https://at.trustpilot.com/review/bark.us) |
| 9 | "Sometimes the push notifications don't come through and i might get information later than I would have liked." | Assistant Property Manager, Aug 22, 2023 | [ClassDojo on Capterra](https://capterra.com/p/124446/ClassDojo/reviews/) |

## 3. School and team messaging: missed messages, SMS dropped

| # | Quote | Who / when | Source |
|---|---|---|---|
| 10 | "Remind changed several months ago when it agreed that they will no longer do SMS texting on their platform." | Kelsan W., Minister of Youth and Discipleship, Jul 31, 2025 | [Remind on Capterra](https://www.capterra.com/p/234436/Remind/reviews/) |
| 11 | "It is hard to tell sometimes who all received a message." | Angie T., Director of Business Affairs, Mar 27, 2025 | [Remind on Capterra](https://www.capterra.com/p/234436/Remind/reviews/) |
| 12 | "I did not like how it does not let parents message other parents." | Office Manager, Sep 23, 2026 | [ClassDojo on Capterra](https://capterra.com/p/124446/ClassDojo/reviews/) |

## 4. Kids' money: fees, held funds, and a parent asking for a texted alert

| # | Quote | Who / when | Source |
|---|---|---|---|
| 13 | "Greenlight needs to add low balance alert on child's account that is texted to parent." | Dave, 2 stars, Jan 17, 2026 | [Greenlight on Trustpilot, page 5](https://www.trustpilot.com/review/greenlight.com?page=5) |
| 14 | "Used to work great. Now they hold your funds for up to a week, even though it instantly comes out of your banking account." | Garry Hall, 2 stars, Jan 10, 2026 | [Greenlight on Trustpilot, page 5](https://www.trustpilot.com/review/greenlight.com?page=5) |

## Also seen (family organizers)

- Cozi: "The older version was way better. This new layout doesn’t work well on smaller screens." (cockpitjockey, 05/17/2024,
  [Cozi on the App Store](https://apps.apple.com/app/407108860)). A reason to keep checking FamGenie at phone width.
- FamilyWall: "First suggestion: Is there anyway to snooze specific dates on the calendar that are syncing from the timetable ?"
  (JennicaRachelle, 08/21/2022, [FamilyWall on the App Store](https://apps.apple.com/us/app/id496889629)).

## What this suggests for FamGenie

- Quote 13: parents want **budget context in a text**. FamGenie already shows "After this: $X left" in the app, but not in the
  text the parent gets when a child asks. (Built 2026-11-11.)
- Quotes 6 to 9: alerts have to be **right and few**. FamGenie's late alert fires once per event; keep it that way, and make
  failures visible (see `improvements.md`).
- Quotes 10 to 12: plain SMS still matters to families. FamGenie's inbox works by text with no app, and parent groups are
  supported. These are honest marketing angles; they are claims about real features.
- Quote 14: FamGenie never holds money (a `CLAUDE.md` rule and README copy), so it can never "hold" a family's funds. A marketing
  angle; `brand.json` "facts" currently list only "free to start" and "free plan", so the owner would add it there first.
