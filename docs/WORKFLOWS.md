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
