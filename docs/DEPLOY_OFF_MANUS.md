# Stand up the TMA site off Manus (emergency continuity)

Use this if Manus takes the deployment down during its Aug 23-25 transition and you
need tmatkd.com back up. Everything the app needs already survives Manus:
- Code: GitHub `tmasuwanee/tma-tkd-website` (`main`)
- Database: TiDB Cloud (external, stays up) — the app now forces TLS so it connects
  from any host, not just Manus.
- Secrets: the values you saved (DATABASE_URL, Stripe, OpenAI, Resend, Telegram, etc.)

No data migration — the new host talks to the SAME TiDB database.

## Option A — Render (simplest, ~10 min)
1. Go to render.com, sign in, **New -> Blueprint**.
2. Connect the GitHub repo `tmasuwanee/tma-tkd-website`. It reads `render.yaml`.
3. It creates one web service. Open it -> **Environment** -> paste the values for every
   `sync:false` key (DATABASE_URL, TMA_STRIPE_SECRET_KEY, TMA_STRIPE_WEBHOOK_SECRET,
   OPENAI_API_KEY, RESEND_API_KEY, TMA_TELEGRAM_*, ADMIN_PASSWORD, etc.).
   Keep `ADMIN_AUTH_ENFORCE=true`. Do NOT set the billing switches yet.
4. Deploy. When it's live you get a URL like `https://tma-tkd-website.onrender.com`.
   Test it: the homepage loads, and `/admin` logs in with ADMIN_PASSWORD.
5. **Point the domain:** in your DNS provider, change tmatkd.com's record to Render
   (Render -> Settings -> Custom Domain gives the exact CNAME/A record). DNS can take
   up to an hour to propagate.

## Option B — Railway (alternative)
1. railway.app -> New Project -> Deploy from GitHub -> the repo.
2. Set build `npm install && npm run build`, start `npm run start`.
3. Add the same env vars (Variables tab). Railway sets PORT automatically.
4. Add the custom domain and repoint DNS as above.

## Known limits of an off-Manus copy (fine for continuity)
- **Waiver / photo PDF storage** (Forge) is Manus-only. New file uploads (a freshly
  signed waiver PDF, a student photo) will fail on Render until you swap storage for
  S3/R2. Everything else (site, admin, members, payments read, assistant) works. The
  DB already holds all existing records.
- **Scheduled crons** (charge sweep, reminders) ran on Manus Heartbeat. On Render use
  a Render Cron Job (or cron-job.org) to POST the `/api/scheduled/*` endpoints. Not
  urgent while billing is off.
- **Stripe webhook**: if you cut over long-term, add the Render URL as the webhook
  endpoint in Stripe too.

## When Manus comes back (after Aug 25)
Restore from your exports if you want to keep using Manus, OR keep running on Render
and retire the Manus deployment. Either way the data is the one TiDB database.
