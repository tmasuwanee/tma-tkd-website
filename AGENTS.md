# TMA Website — Agent Handbook

This file is the shared operating bible for all AI agents working on this codebase.
**Read this before making any changes.** Last updated: 2026-05-12.

---

## Who Does What

Use this to know which agent to ask. Wrong agent = wasted time.

### Ask Manus when you need:
- Any **frontend / UI changes** — React components, pages, layout, styles, Tailwind
- **Database schema changes** — adding columns, new tables, enum updates
- **DB migrations** — running `ALTER TABLE` or `webdev_execute_sql`
- **New website features** — new admin pages, new public pages, new forms
- **Secrets / environment variables** — adding to Manus Settings → Secrets
- **Stripe / payments** — camp registration, pricing, checkout flow
- **Deployment** — pushing to production, domain settings, SSL
- **Static assets** — images, fonts, public files
- Things Manus will flag to Claude: anything involving n8n, automation logic, email sequences, or cross-system orchestration

### Ask Claude when you need:
- **n8n workflows** — building, editing, publishing, debugging automations
- **Backend API routes** — new Express endpoints, tRPC procedures
- **Email sequences** — copy, timing, triggers, Resend integration
- **Automation logic** — no-show recovery, follow-up sequences, lead scoring
- **Data analysis** — querying the DB, reading ad insights, building reports
- **Cross-system wiring** — connecting the website to n8n, Resend, Facebook, Twilio
- **GitHub PRs** — Claude pushes branches; Manus merges and redeploys
- Things Claude will flag to Manus: any UI/layout work, schema changes, migration runs

### When you need both:
If a feature touches the **website AND a new automation** (e.g. new form field that also needs an n8n trigger), tell Manus first to update the schema and frontend, then tell Claude to wire the n8n side.

---

## Stack Overview

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| API | tRPC (type-safe) + Express REST routes for n8n |
| Database | MySQL via Drizzle ORM |
| Hosting | Manus (topmaarts-cxp7kemi.manus.space) |
| Emails | Resend (from: hello@tmatkd.com, domain: tmatkd.com) |
| Automation | n8n self-hosted at https://n8n.arfaconsults.com |
| Payments | Stripe (summer camp registrations) |
| Ads | Facebook Marketing API + CAPI (pixel events) |
| Version Control | GitHub — tmasuwanee/tma-tkd-website |

---

## Database — Pipeline Stages

The `leads.pipelineStage` column uses this enum (in order):

```
new_lead → contacted → trial_scheduled → trial_paid → trial_attended → enrolled
                                                    ↘ no_show → no_show_final
                                                    ↘ lost
```

Never insert a stage value not in this list. To add a new stage: update `drizzle/schema.ts` enum + run an ALTER TABLE migration.

---

## n8n Integration Points

The website exposes these REST endpoints for n8n (not tRPC — plain HTTP):

| Method | Endpoint | Used by |
|---|---|---|
| `GET` | `/api/leads?stages=...&hasTrialDate=true` | No-show recovery (daily 9 AM check) |
| `GET` | `/api/leads/:leadId/status` | Pre-send stage check |
| `PATCH` | `/api/leads/:leadId/stage` | Stage updates after no-show detected |
| `GET` | `/api/ads/insights?days=N` | Ad performance queries |
| `POST` | `/api/ads/sync` | Manual FB ad data pull (bearer token required) |
| `POST` | `/api/scheduled/sync-fb-ads` | Heartbeat cron — daily FB sync |

The n8n webhook URL (incoming, from website → n8n): `https://n8n.arfaconsults.com/webhook/tma-lead`
Wired via `ENV.n8nWebhookUrl` → `process.env.N8N_WEBHOOK_URL`.

All active n8n workflows are documented in `docs/WORKFLOWS.md`.

---

## Email Setup

- **Provider:** Resend
- **From address:** `hello@tmatkd.com` (verified sending domain)
- **Staff alert address:** `tmasuwanee@gmail.com`
- All transactional emails go through the Resend API key in Manus Secrets (`RESEND_API_KEY`)
- Email copy lives inside n8n workflow nodes — to edit subject lines or body copy, edit in n8n, not here

---

## Environment Variables (Manus Secrets)

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Transactional email sending |
| `N8N_WEBHOOK_URL` | Fires n8n on new lead form submission |
| `TMA_STRIPE_SECRET_KEY` | Camp registration payments (server) |
| `VITE_TMA_STRIPE_PUBLISHABLE_KEY` | Camp registration payments (client) |
| `FACEBOOK_PIXEL_ID` | Meta pixel tracking |
| `FACEBOOK_CAPI_TOKEN` | Server-side conversion events → Facebook |
| `FACEBOOK_MARKETING_API_TOKEN` | Read ad performance data from Meta |
| `FACEBOOK_AD_ACCOUNT_ID` | Meta ad account (e.g. 1008273610146745) |
| `LEAD_NOTIFICATION_EMAIL` | Staff email for new lead alerts |
| `VITE_FRONTEND_FORGE_API_URL` | Manus internal — do not touch |

---

## GitHub Workflow

- Claude pushes changes as branches (e.g. `claude/feature-name`)
- Manus reviews and merges to `main` → auto-redeploys
- Manus can also push directly to `main` for UI/frontend changes
- Never force-push to `main`

---

## Conventions

- **Date format:** `YYYY-MM-DD` strings (e.g. `2026-05-12`) for all date fields in DB
- **Money:** stored in cents as integers (e.g. `3000` = $30.00)
- **IDs:** auto-increment integers in MySQL
- **Timestamps:** `createdAt` / `updatedAt` managed by Drizzle, do not set manually
- **Pipeline stage updates:** always go through `updateLeadStage()` in `server/db.ts` — never raw SQL updates on the leads table
- **n8n Code nodes:** use `helpers.httpRequest()` for HTTP calls inside the task runner sandbox — never `fetch()` or `axios` directly
