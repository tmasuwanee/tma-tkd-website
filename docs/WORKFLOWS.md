# TMA n8n Workflows

Running log of all active n8n workflows. Updated by Claude every time a workflow is created or changed.
Claude's n8n instance: https://n8n.arfaconsults.com

**Important URL gotcha:** The deployed Manus build mounts tRPC at `/api/trpc/`, NOT `/trpc/`. Hitting `/trpc/` returns the SPA HTML with status 200 — silent failure. Always use `/api/trpc/<procedure>` for tRPC calls. REST routes live at `/api/leads/...`, `/api/ads/...`.

---

## Active Workflows

### TMA — Lead Intake v2
- **ID:** `9jcQQpZGvrYMdi8B`
- **Status:** Active (Published)
- **Trigger:** Webhook — `https://n8n.arfaconsults.com/webhook/tma-lead` — fires when a new lead submits the form on tmatkd.com
- **What it does:**
  1. Sends staff alert email to `tmasuwanee@gmail.com` (via Gmail)
  2. Waits 48 hours
  3. **Pre-send checks** (added 2026-05-18):
     - Calls `GET /api/leads/:leadId/status` — skip if stage in `[enrolled, lost, no_show_final, trial_paid, trial_attended]`
     - Calls `GET /api/trpc/leads.getActivity` — skip if any activity in last 48h where `sentBy` does NOT start with `n8n_` (meaning a human or other system touched the lead)
  4. If checks pass: sends Day 2 follow-up email via Resend
  5. Logs activity to `/api/trpc/leads.logActivity` with `status='sent'` or `status='skipped'` + reason
  6. Waits 48 more hours
  7. Repeats pre-send checks → sends Day 4 follow-up → logs
- **Email provider:** Resend (from: hello@tmatkd.com)
- **Connected to website via:** `N8N_WEBHOOK_URL` env var → `ENV.n8nWebhookUrl` → `fireN8nWebhook()` in `server/routers.ts`
- **Last updated:** 2026-05-18 — added stage + staff-activity pre-send checks; fixed log URLs from `/trpc/` to `/api/trpc/`

---

### TMA — Trial No-Show Recovery
- **ID:** `NilRfiqzUOBGRbU2`
- **Status:** Active (Published)
- **Trigger:** Schedule — daily at 9:00 AM
- **What it does:**
  1. **Day 1 node:** Calls `GET /api/leads?stages=new_lead,contacted&hasTrialDate=true`, filters for leads whose `trialClassDate` was yesterday → sends "We missed you at Top Martial Arts!" email → PATCHes stage to `no_show`
  2. **Day 3 node:** Calls same endpoint filtered for `stage=no_show`, finds leads whose trial was 3 days ago → sends "Still want to try a class?" email → PATCHes stage to `no_show_final`
- **Email provider:** Resend (from: hello@tmatkd.com)
- **REST endpoints used:**
  - `GET https://www.tmatkd.com/api/leads?stages=...&hasTrialDate=true`
  - `PATCH https://www.tmatkd.com/api/leads/:leadId/stage`
- **Last updated:** 2026-05-12 — initial build and publish

---

### TMA — Weekly Ad Intelligence
- **ID:** `MNRiKau55C4S0RHp`
- **Status:** Active (Published)
- **Trigger:** Schedule — every Monday at 8:00 AM
- **What it does:**
  1. Pulls TMA's last 7 days of ad performance from `GET /api/ads/insights?days=7`
  2. Searches Facebook Ad Library API for competitor ads across 5 keywords: "taekwondo", "martial arts for kids", "bjj kids", "karate kids", "kids martial arts"
  3. Filters to ads running 30+ days (proven profitable creatives), deduplicates, caps at 20
  4. Feeds both TMA performance + competitor data to GPT-4o
  5. GPT-4o outputs: top 3 competitor angles + 3 TMA-specific creative briefs (hook, body, CTA, why it works)
  6. Emails full report to tmasuwanee@gmail.com via Resend
- **Email provider:** Resend (from: hello@tmatkd.com)
- **AI model:** OpenAI GPT-4o
- **APIs used:** Facebook Ad Library (`/v19.0/ads_archive`), OpenAI Chat Completions, TMA `/api/ads/insights`
- **Last updated:** 2026-05-13 — initial build

---

### TMA - Facebook Lead Ads Sync
- **ID:** `lJwUNK9XpYbPDBBn`
- **Status:** Active (Published) — 2026-05-18
- **Trigger:** Schedule — every 15 minutes
- **What it does:**
  1. Reads last sync timestamp from workflow static data (defaults to 90 days ago on first run if not bootstrapped)
  2. Calls `GET https://graph.facebook.com/v19.0/1636738774021598/leads?since=...&fields=id,created_time,field_data` (form ID hardcoded; access token is a Meta Business System User token, never-expires)
  3. **Two-layer idempotency:**
     - `lastSyncTimestamp` advances after every successful batch — FB API filters out anything older
     - `seenFbLeadIds` Set in static data filters out any lead ID already processed (5000-entry FIFO cap)
     - On first activation, the 75 existing FB lead IDs were pre-seeded via bootstrap — they will never trigger emails
  4. Maps each lead's `field_data` array (full_name, email, phone, date_of_birth) to the TMA lead schema. Missing fields default to `kidName='TBD'`, `kidAge='Unknown'`, `programInterest='Summer Camp 2026'`
  5. Sets `utmSource=facebook`, `utmMedium=lead_ad`, `utmCampaign=summer_camp_2026`
  6. Sets `tags=["facebook_lead", "summer_camp_2026"]` on each lead
  7. POSTs each lead to `POST https://tmatkd.com/api/trpc/leads.upsertFromFacebook` — email-based upsert, never overwrites notes/stage/existing tags
  8. After each successful upsert, adds the FB lead ID to `seenFbLeadIds` static data
  9. After all batches done, advances `lastSyncTimestamp` to now
- **tRPC endpoint used:** `leads.upsertFromFacebook` (in `server/routers.ts`)
- **Meta credentials:** System user "Conversions API System User" in TMA Top Martial Arts Business Portfolio. Token has assets: Ad Account `1008273610146745` (Full Control) + Facebook Page `474607123330465` (Tmasuwanee, Full Control). Permissions: `ads_management`, `ads_read`, `leads_retrieval`, `pages_read_engagement`, `pages_show_list`, `pages_manage_ads`.
- **Last updated:** 2026-05-18 — initial build, fixed tRPC URL prefix (`/trpc/` → `/api/trpc/`), added two-layer idempotency, bootstrapped with 75 existing lead IDs

---

### TMA - Enrollment Auto-Reconciler
- **ID:** `XfMkEGETzimiEmwN`
- **Status:** Active (Published) — 2026-05-18
- **Trigger:** Schedule — daily at 8:00 AM
- **What it does:**
  1. Calls `GET /api/trpc/leads.getAll` and `GET /api/trpc/students.getAll`
  2. Builds normalized sets of student emails (lowercased) and phones (digits-only, leading-1 stripped, must be 10+ digits)
  3. Iterates leads where `pipelineStage !== 'enrolled'`, matching on `email` OR `phone`
  4. For each match: PATCHes lead to `stage='enrolled'` via `/api/leads/:leadId/stage`, then logs activity to `/api/trpc/leads.logActivity` with `sentBy=n8n_enrollment_reconciler` and a body explaining match type
  5. First-run result (2026-05-18): 3 leads auto-enrolled (2 email+phone match, 1 phone-only)
- **Why it exists:** Closes the loop between manual student onboarding (Manus dashboard) and the lead pipeline. Without this, a lead who enrolled via in-person walk-in (added to Students by staff) would remain in `new_lead` stage and keep receiving nurture emails. The `enrolled` stage stop is honored by Lead Intake v2's pre-send check.
- **Last updated:** 2026-05-18 — initial build

---

## Retired / Inactive Workflows

None yet.

---

## Endpoint Reference

All endpoints n8n workflows call on the website. tRPC URL prefix is `/api/trpc/`, REST is `/api/`.

| Endpoint | Workflow(s) | Notes |
|---|---|---|
| `POST /webhook/tma-lead` (on n8n) | (incoming from website) Lead Intake v2 | Website fires this on form submit |
| `GET /api/leads?stages=...&hasTrialDate=true` | No-Show Recovery | Bulk lead query (filtered) |
| `GET /api/leads/:leadId/status` | Lead Intake v2 | Stage check before sending nurture emails |
| `PATCH /api/leads/:leadId/stage` | No-Show Recovery, Enrollment Reconciler | Stage updates |
| `GET /api/ads/insights?days=N` | Ad Intelligence | TMA's own ad performance |
| `GET /api/trpc/leads.getAll` | Enrollment Reconciler | Full lead list |
| `GET /api/trpc/leads.getActivity?input=...` | Lead Intake v2 | Recent activity check (staff-pause logic) |
| `POST /api/trpc/leads.upsertFromFacebook` | FB Lead Ads Sync | Email-based upsert, idempotent |
| `POST /api/trpc/leads.logActivity` | Lead Intake v2, Enrollment Reconciler | Activity log entry |
| `GET /api/trpc/students.getAll` | Enrollment Reconciler | Full student list for cross-ref |
