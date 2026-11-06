# Deploy FamGenie

About 30–45 minutes. Everything below has a free tier or trial.

## 1. Let Claude push the code to GitHub
Done: `chaseye/famgenie` is connected to the Claude GitHub app.

## 2. The Cloudflare Worker (already done)
`famgenie` is a Worker connected to `chaseye/famgenie`: every push to `main` builds and deploys it to
`https://famgenie.chase-51e.workers.dev`. The setup lives in `wrangler.jsonc` (app files from `public/`, API in `src/worker.js`).

## 3. Database (already done)
D1 database `famgenie` is created, and its ID is in `wrangler.jsonc`, so the `DB` binding is applied on every deploy.
Tables are created automatically on first use. There's nothing to bind in the dashboard; bindings added there are replaced by `wrangler.jsonc` on the next deploy.

## 4. Sign-in email (Resend)
1. Sign up at https://resend.com → API Keys → Create.
2. Add it in Cloudflare (Workers & Pages → famgenie → Settings → Variables and Secrets → Add, type **Secret**): `RESEND_API_KEY`.
3. Until you verify your own domain in Resend, emails only go to your own Resend account address (fine for testing).
   To email everyone, verify a domain in Resend and add variable `EMAIL_FROM` = `FamGenie <hello@yourdomain.com>`.

## 5. Texting (Twilio)
1. Sign up at https://www.twilio.com, buy one US number with SMS.
2. **US texting needs A2P 10DLC registration** (brand + campaign) before carriers deliver at volume. Start it early; approval can take days.
   Describe the use case as "parent-initiated check-ins and messages between a family and their children's tutors, teachers and coaches".
3. Add in Cloudflare: Secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`; variables `TWILIO_FROM` (e.g. `+13125550100`) and `PUBLIC_URL` (`https://famgenie.chase-51e.workers.dev`, no trailing slash).
4. In Twilio → Phone Numbers → your number → Messaging → "A message comes in": Webhook, `https://famgenie.chase-51e.workers.dev/hooks/sms`, HTTP POST.

## 6. Redeploy and check
1. Secrets apply right away; if the site doesn't pick them up, open Deployments and redeploy the latest version.
2. Open the site: it should show the sign-in screen. Sign in with your email.
3. Set up your family. Settings shows "Texting: on" when Twilio is configured.
4. Send yourself a check-in (add your own number as a child to try it).

## 7. Optional
- **Custom domain:** Worker → Settings → Domains & Routes → Add custom domain (e.g. `famgenie.app`). Update `PUBLIC_URL` and the Twilio webhook.
- **Retention:** variable `RETENTION_DAYS` (default 30) controls how long location readings are kept.

## What's next (not built yet)
- Co-parent invites (a second parent on the same family; the table already supports it).
- A family number per household (Family Plus), so unknown numbers can reach a family's Held inbox.
- School calendar feeds (ICS) and learning systems (Google Classroom, Canvas) for the "where should they be" baseline.
- The AI layer: daily brief, conflict detection, drafting replies, and a homework helper that guides instead of answering.
- In-app payouts would need a licensed payments partner; until then parents pay in their own apps.
