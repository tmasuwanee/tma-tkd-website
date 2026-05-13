# TMA n8n Workflows

Running log of all active n8n workflows. Updated by Claude every time a workflow is created or changed.
Claude's n8n instance: https://n8n.arfaconsults.com

---

## Active Workflows

### TMA — Lead Intake v2
- **ID:** `9jcQQpZGvrYMdi8B`
- **Status:** Active (Published)
- **Trigger:** Webhook — fires when a new lead submits the form on tmatkd.com
- **What it does:**
  1. Sends staff alert email to `tmasuwanee@gmail.com` with lead details
  2. Waits 48 hours
  3. Sends Day 2 follow-up email to the lead
  4. Waits 48 hours
  5. Sends Day 4 follow-up email to the lead
- **Email provider:** Resend (from: hello@tmatkd.com)
- **Connected to website via:** `N8N_WEBHOOK_URL` env var → `ENV.n8nWebhookUrl` → `fireN8nWebhook()` in `server/routers.ts`
- **Last updated:** 2026-05-12 — removed em dashes, sign-off changed to "Top Martial Arts Suwanee"

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

## Retired / Inactive Workflows

None yet.

---

## Endpoint Reference

All REST endpoints the n8n workflows call on the website:

| Endpoint | Workflow | Notes |
|---|---|---|
| `POST /webhook/tma-lead` (n8n) | Lead Intake v2 | Website fires this on form submit |
| `GET /api/leads?stages=...&hasTrialDate=true` | No-Show Recovery | Bulk lead query |
| `GET /api/leads/:leadId/status` | (available, not yet used) | Stage check before sending |
| `PATCH /api/leads/:leadId/stage` | No-Show Recovery | Stage update after no-show |

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
