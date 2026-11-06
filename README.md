# FamGenie

Your family's AI assistant. FamGenie keeps busy parents on top of where their kids are, who's trying to reach them, and what the kids are spending, for children from age 4 to 22.

## What it does

- **Know they got there.** Each child's status comes from whichever signals the family turns on: a one-time check-in link (one location reading, only when the child taps), a "reply 1 or 2" text that works on basic phones, the child's own kid page, iPhone Shortcuts or Android automations on arrive/leave, school attendance, and parent-confirmed sightings from AirTag/SmartTag/Tile or kids' GPS watches. Options are filtered by age and device; at 18+ sharing is the young adult's choice.
- **One inbox for everyone.** Tutors, teachers, coaches, sitters and school parent groups text one family number. Parents choose who can reach them (others wait in Held), and mark groups that only use ClassDojo, Remind, GroupMe or WhatsApp so FamGenie opens that app instead.
- **Kids ask, parents approve.** A child asks from their kid page or by texting `PAY 40 Priya tutoring`. The parent gets a text, approves, and pays in their own Venmo, PayPal or Cash App (amount pre-filled), Zelle (details to copy), the child's card app, or cash, then marks it paid. Monthly budgets, card top-ups, allowances and a per-category tally keep spending visible. **FamGenie never holds or moves money.**
- **Profiles with photos.** Parents set up each child (photo, birthday, school, grade, phone type, budget, card) and the people around them (role, which kids, phone, email, payment handles).

## How it works

```
public/                   static app (Cloudflare Pages)
  index.html              app shell
  assets/app.js           parent app (live API, or a demo stored in the browser)
  assets/shared.js        location options, phone numbers, place matching, money math (shared with the API)
  assets/style.css
functions/                Cloudflare Pages Functions
  api/auth/*              one-time email sign-in links (Resend)
  api/state.js            everything the app shows
  api/family.js           save parent, kids, contacts, places
  api/checkins.js         text a child a check-in link or a "reply 1/2" question
  api/signals.js          parent logs a tag/watch/in-person sighting
  api/messages.js         text a contact, group or child from the inbox
  api/money.js            record, approve, decline, mark paid
  c/[token].js            the one-time check-in page a child opens (15 minutes, single use)
  k/[token].js            a child's private page: check in, ask for money, see requests
  hooks/sms.js            Twilio inbound texts: replies, PAY requests, inbox
  hooks/arrive/[token].js phone automations (arrive / leave a saved place)
lib/                      server helpers: D1, sessions, Twilio, kid pages
```

Data lives in Cloudflare D1 (tables are created on first use). Location readings and check-ins are deleted after 30 days (`RETENTION_DAYS`).

Without accounts or texting set up, the app runs as a clearly labeled **demo** in the browser, with a sample family.

## Local development

```sh
cp .dev.vars.example .dev.vars   # set DEV_EMAIL_LOG=1 and DEV_SMS_LOG=1 to print instead of send
npm install
npm run dev                      # http://localhost:8788
npm test                         # unit tests
npm run test:e2e                 # full API test on a throwaway local database
npm run build:demo               # dist/famgenie-demo.html, a single-file demo
```

## Safety and privacy

- Children's location is shared only when they act (tap, reply, or an automation they keep on). No background tracking, and no covert tracking of anyone 18+.
- Kid links are server-issued random tokens stored hashed; check-in links work once and expire in 15 minutes.
- Twilio webhooks are signature-checked; numbers that aren't in a family are never attached to one.
- Every write checks the parent's session and same-origin; families can't see each other's data (covered by the e2e test).
- Children under 13: before launch, review the FTC's amended COPPA Rule (full compliance required since April 22, 2026) with counsel, including verifiable parental consent and the written data-retention policy.

Deploy steps: see [DEPLOY.md](DEPLOY.md).
