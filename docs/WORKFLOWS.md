# TMA Automations — Source of Truth

Every automated job in the TMA system, across BOTH brains that run them:
1. The app's own scheduled jobs (Heartbeat crons hitting `/api/scheduled/*`) and the Retell voice webhook.
2. The n8n workflows on `https://n8n.arfaconsults.com`.

Last rewritten 2026-07-25 (previously listed only 5 of the 11 n8n workflows). Update this file whenever a job is added, changed, or retired, in either system.

**URL gotcha:** the deployed Manus build mounts tRPC at `/api/trpc/`, NOT `/trpc/`. Hitting `/trpc/` returns the SPA HTML with status 200 (silent failure). REST routes live at `/api/leads/...`, `/api/ads/...`.

**Ownership rule (target):** real-time + staff-facing + voice = the app; customer-facing email sequences + external syncs = n8n. See "Known overlaps" for where this is not yet clean.

---

## A. App scheduled jobs (Heartbeat crons)

Registered in `server/_core/index.ts`; each callback path starts with `/api/scheduled/`. Times are America/New_York.

| Job | Endpoint | Schedule | What it does |
|---|---|---|---|
| Morning report | `/api/scheduled/morning-report` | ~11:30 AM daily | Blast-health / ops summary to staff (Telegram). |
| Trial reminders (AM) | `/api/scheduled/trial-reminders-am` | ~8:00 AM daily | Staff Telegram: today's trials + 7/3/2/1-day trial-ending reminders. |
| Trial check-in (PM) | `/api/scheduled/trial-checkin-pm` | ~8:30 PM daily | Staff Telegram "did they show?" prompt for today's trials. |
| Daily call queue | `/api/scheduled/daily-call-queue` | ~8:00 AM daily | Scored top-N call list to Telegram. Prospects/trials only (recordType filter, 2026-07-25). |
| Outbound: speed-to-lead | `/api/scheduled/outbound-speed-to-lead` | frequent | Retell outbound call to brand-new leads. Gated by the `voice_agent_outbound` kill switch + calling hours (8am-9pm ET) + `noOutboundCalls`. |
| Outbound: no-show | `/api/scheduled/outbound-noshow` | daily | Retell outbound call to trial no-shows. |
| Outbound: post-trial | `/api/scheduled/outbound-posttrial` | daily | Retell outbound call after an attended trial to close. |
| Outbound: afterschool tour | `/api/scheduled/outbound-afterschool-tour` | daily | Retell outbound call to afterschool tour requests. |
| FB ad-insights sync | `/api/scheduled/sync-fb-ads` | daily | Pulls TMA ad performance into the dashboard (Ad Performance view). |

Plus the Retell voice webhook (not a cron): `POST /api/voice/retell-webhook` (secured by `?secret=VOICE_AGENT_SHARED_SECRET`) acts on `call_analyzed`, Telegrams every call, upserts `callLogs` (idempotent by callId), matches the lead by phone, applies a program tag, and auto-transitions to `trial_scheduled` if the agent booked. Inbound agent tools live at `/api/voice/resolve-date | check-availability | book-trial | route-to-human | notify-pickup` and outbound tools at `/api/voice/lead-context | log-call-outcome | schedule-retry | request-human-followup`.

---

## B. n8n workflows (11)

### 1. TMA — Lead Intake v3 (Lifecycle) — ACTIVE
- **ID:** `xFSKbA4gxDckbQOT`
- **Trigger:** Webhook `https://n8n.arfaconsults.com/webhook/tma-lead`, fired by the website on lead submit (`N8N_WEBHOOK_URL` -> `fireN8nWebhook()` in `server/routers.ts`).
- **Does:** routes the inbound lead via `rules.route` -> either sends a booking confirmation immediately, alerts staff if unsegmented, or fans out to `leadSequenceQueue` via `sequence.enqueueSequence`. Supersedes v2.

### 2. TMA — Lead Intake v2 — INACTIVE (retired, replaced by v3)
- **ID:** `9jcQQpZGvrYMdi8B`
- **Was:** webhook -> staff alert email -> 48h waits -> Day 2 + Day 4 nurture with pre-send checks (`GET /api/leads/:leadId/status`, `GET /api/trpc/leads.getActivity`). Kept for reference; not running.

### 3. TMA - Sequence Dispatcher — ACTIVE
- **ID:** `1tW0c9L9y65TYuAR`
- **Trigger:** Schedule, every 5 minutes.
- **Does:** fetches due touches from `leadSequenceQueue`, claims, evaluates pre-send checks, sends/skips/fails, logs to `leadActivities`.

### 4. TMA - Trial No-Show Recovery — ACTIVE
- **ID:** `NilRfiqzUOBGRbU2`
- **Trigger:** Schedule, daily 9:00 AM.
- **Does:** Day 1 - finds yesterday's trial no-shows, sends "We missed you" email, PATCHes stage to `no_show`. Day 3 - finds `no_show` leads 3 days out, sends "Still want to try?" email, PATCHes to `no_show_final`.
- **Endpoints:** `GET /api/leads?stages=...&hasTrialDate=true`, `PATCH /api/leads/:leadId/stage`.

### 5. TMA - Trial Reminders (24h) — ACTIVE
- **ID:** `IrgfZmEUBAvpnYHr`
- **Trigger:** Schedule, daily 9:00 AM ET.
- **Does:** finds leads with a trial booked for tomorrow, sends the branded reminder email (what to bring + Get Directions). Idempotent via a `leadActivities` check.

### 6. TMA - Enrollment Auto-Reconciler — ACTIVE
- **ID:** `XfMkEGETzimiEmwN`
- **Trigger:** Schedule, daily 8:00 AM.
- **Does:** cross-references `leads.getAll` vs `students.getAll` by normalized email/phone, marks matching leads `enrolled`, logs activity, sends the welcome + referral email.

### 7. TMA - Facebook Lead Ads Sync — ACTIVE
- **ID:** `lJwUNK9XpYbPDBBn`
- **Trigger:** Schedule, every 15 minutes.
- **Does:** polls FB Lead Ads, two-layer idempotency (`seenFbLeadIds` + `lastSyncTimestamp`), maps fields, POSTs each to `leads.upsertFromFacebook`.
- **KNOWN ISSUE:** defaults `programInterest='Summer Camp 2026'`, `utmCampaign=summer_camp_2026`, tags `summer_camp_2026` (leftover from the summer campaign), so FB leads look like camp leads. Fix in Phase 3.

### 8. TMA - Duplicate Lead Detector — ACTIVE
- **ID:** `vaJFXIRwQAtIqEBN`
- **Trigger:** Schedule, daily 7:00 AM ET.
- **Does:** counts leads grouped by lowercased email, alerts staff if duplicates exist. This is a safety alarm; the real dedupe now happens at submit time in the app (2026-07-25).

### 9. TMA - Retell Inbound Call Handler — ACTIVE
- **ID:** `LlE5tPSR35lRma2C`
- **Trigger:** Webhook `https://n8n.arfaconsults.com/webhook/tma-retell-call`, Retell `call_ended`.
- **Does:** parses caller data, upserts the lead, logs the transcript, sends an HTML staff alert.
- **NO overlap (verified 2026-08-03 via the Retell API):** the INBOUND agent ("TMA After-Hours Receptionist", `agent_367644...`) points here (n8n). The OUTBOUND agent ("TMA Outbound Agent", `agent_5b972b...`) points at the APP (`https://tmatkd.com/api/voice/retell-webhook`). Each agent has exactly one webhook, so inbound and outbound are cleanly split. Do NOT "consolidate" them.

### 10. TMA - Camp Waiver Capture — ACTIVE
- **ID:** `o7D3nodpRgGTaDJe`
- **Trigger:** Webhook from the camp waiver form.
- **Does:** formats the camp waiver submission into a branded email to `tmasuwanee@gmail.com` via Resend.

### 11. TMA — Weekly Ad Intelligence — ACTIVE
- **ID:** `MNRiKau55C4S0RHp`
- **Trigger:** Schedule, Monday 8:00 AM.
- **Does:** pulls TMA ad performance (`/api/ads/insights?days=7`) + FB Ad Library competitor ads, feeds GPT for angle analysis + 3 creative briefs, emails the report.

---

## C. Known overlaps to resolve (Phase 3)

1. ~~Two Retell inbound handlers~~ **RESOLVED (2026-08-03):** the inbound agent points at n8n, the outbound agent points at the app. Cleanly split by agent, not a conflict. See #9 above.
2. **No-show handled three ways** with no shared owner: app `trial-checkin-pm` Telegram + n8n #4 recovery emails + app `outbound-noshow` Retell call. Consolidate into one coordinated flow.
3. **Two intake alert paths** on a new lead: the app fires Slack + a staff email on `leads.submit`, and n8n #1 also alerts staff. Decide one owner.
4. **Two email sender identities:** the app sends as `Top Martial Arts <hello@tmatkd.com>` (2026-07-25); n8n sends from `hello@tmatkd.com` too but confirm every workflow uses that from-name consistently.

---

## Endpoint reference

tRPC prefix is `/api/trpc/`, REST is `/api/`.

| Endpoint | Used by | Notes |
|---|---|---|
| `POST /webhook/tma-lead` (on n8n) | website -> Lead Intake v3 | fired on form submit via `fireN8nWebhook()` |
| `GET /api/leads?stages=...&hasTrialDate=true` | No-Show Recovery | filtered bulk lead query |
| `GET /api/leads/:leadId/status` | (legacy v2) | stage pre-send check |
| `PATCH /api/leads/:leadId/stage` | No-Show Recovery, Enrollment Reconciler | stage updates |
| `GET /api/ads/insights?days=N` | Ad Intelligence, app ad-sync | TMA ad performance |
| `GET /api/trpc/leads.getAll` | Enrollment Reconciler | full lead list |
| `GET /api/trpc/leads.getActivity?input=...` | (legacy v2) | recent-activity / staff-pause check |
| `POST /api/trpc/leads.upsertFromFacebook` | FB Lead Ads Sync | email-based upsert, idempotent |
| `POST /api/trpc/leads.logActivity` | Sequence Dispatcher, Reconciler | activity log entry |
| `GET /api/trpc/students.getAll` | Enrollment Reconciler | roster cross-ref |
| `GET /api/automation/status` (or controls) | all n8n schedules | kill-switch check before running |
