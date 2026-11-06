# Deploy FamGenie

FamGenie runs as a Cloudflare Worker: `https://famgenie.chase-51e.workers.dev`.
Every push to `main` in `chaseye/famgenie` builds and deploys it. The setup lives in `wrangler.jsonc`.

All settings below go in Cloudflare → **Workers & Pages → famgenie → Settings → Variables and secrets → + Add variable**
(Production). Use type **Secret** for keys and passwords, **Text** for the rest. Then click **Deploy**.

| Step | Status |
|---|---|
| 1. GitHub repo connected | Done |
| 2. Worker + database (`DB` → D1 `famgenie`) | Done |
| 3. Sign-in email (Resend) | Done (`RESEND_API_KEY`) |
| 4. AI (Claude) | To do |
| 5. Google Calendar + Gmail | To do |
| 6. Texting (Twilio) | To do |
| 7. Schedules and late alerts | Automatic once 6 is done |

## 3. Sign-in email (Resend)
- Secret `RESEND_API_KEY` from https://resend.com → API Keys.
- Until you verify a domain in Resend (Domains → Add), emails only reach the address on your Resend account.
- After verifying, add Text `EMAIL_FROM` = `FamGenie <hello@yourdomain.com>`.

## 4. AI (Claude)
Turns on the written morning brief, **Ask FamGenie**, drafted replies, and to-dos pulled from school emails.
Without it, FamGenie still shows the same alerts; they just aren't summarized.
1. https://console.anthropic.com → **API keys → Create key**. Add billing credit under Plans & Billing.
2. Secret `ANTHROPIC_API_KEY` = the key.
3. Optional Text `AI_MODEL`: default `claude-haiku-5-5` (fast, low cost); `claude-sonnet-5-5` writes a little better.

What the AI sees: first names, grades, schools, schedules, statuses, money requests, recent message text and school email subjects/snippets.
Never phone numbers, photos or locations. Message and email text is passed as data, and the AI can't take actions; every action still needs a tap.

## 5. Google Calendar + Gmail (read-only)
1. https://console.cloud.google.com → create a project named **FamGenie**.
2. **APIs & Services → Library**: enable **Google Calendar API** and **Gmail API**.
3. **Google Auth Platform** (OAuth consent screen): User type **External**, app name FamGenie, your support email.
   Under **Data access**, add the scopes `.../auth/calendar.readonly` and `.../auth/gmail.readonly`.
   Under **Audience**, add your own Gmail as a **test user**.
4. **Clients → Create client → Web application**. Authorized redirect URI:
   `https://famgenie.chase-51e.workers.dev/api/google/callback`
5. In Cloudflare add Secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `TOKEN_KEY`
   (a long random string that encrypts stored Google tokens; for example run `openssl rand -base64 32`). Never change `TOKEN_KEY` later, or families must reconnect.
6. In FamGenie → **Family → Google → Connect**.

Before other families can connect: while the app is in **Testing**, only listed test users can sign in, and Google expires their access after 7 days.
To publish, Google verifies the app: Calendar read-only is a "sensitive" scope (verification review), and Gmail read-only is a "restricted" scope
(verification plus a yearly third-party security assessment). A cheaper path for email later: let parents forward school emails to a FamGenie address instead of reading Gmail.

## 6. Texting (Twilio)
See "Twilio step by step" in the chat, or:
1. https://www.twilio.com → buy a US number with SMS.
2. Start **A2P 10DLC** registration (brand + campaign) right away; carriers block unregistered app texting and approval takes days.
3. Cloudflare: Secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`; Text `TWILIO_FROM` (e.g. `+13125550100`) and `PUBLIC_URL` = `https://famgenie.chase-51e.workers.dev`.
4. Twilio → your number → Messaging → "A message comes in": Webhook `https://famgenie.chase-51e.workers.dev/hooks/sms`, HTTP POST.

## 7. Schedules and late alerts
Nothing to set up: `wrangler.jsonc` runs a job every 10 minutes. It refreshes calendar links and Google at the top of each hour,
and texts the parent once if a child under 18 isn't confirmed 10 minutes after something on their schedule starts.
Parents can turn alerts off in Settings. Alerts need Twilio (step 6) and the parent's mobile number.

## Check it
- `https://famgenie.chase-51e.workers.dev/api/me` → `"available": true`.
- In the app, **Settings** shows Assistant **On** (AI) and Texting **on** (Twilio).
- **Family → Schedules**: add a weekly activity and a calendar link; Home shows **Today**.
- Logs: Worker → **Observability** shows each request and the scheduled job (`[cron]` lines).

## Optional
- **Custom domain:** Worker → Settings → Domains & Routes → Add custom domain. Then update `PUBLIC_URL`, the Twilio webhook and the Google redirect URI.
- **Retention:** Text `RETENTION_DAYS` (default 30) controls how long location readings, check-ins and school-email summaries are kept.
