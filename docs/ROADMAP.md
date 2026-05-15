# TMA Automation Roadmap

Shared backlog for Claude, Manus, and Codex. Updated as items are scoped, started, or completed.
Both agents should check this before starting new work — something may already be specced or in progress.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Agent Pipeline Notes

- Source of truth: `https://github.com/tmasuwanee/tma-tkd-website`
- Live site: `https://tmatkd.com`
- Codex can inspect/edit/test/commit/push from this workstation after reading `AGENTS.md`
- Codex local GitHub token location: `C:\Users\tmasuwanee\Desktop\.env` (`TMA_GITHUB_TOKEN`); never commit token values

---

## 1. Student Attendance + Belt Rank System

**Owner: Manus (UI + DB) → Claude (automation)**
**Priority: High**

### Belt Ranks (ordered — this is the progression sequence)
```
White → Yellow → Orange → Green → Purple → Blue → Brown → Red → High-Red → Pre-Black
→ 1st Dan Black → 1st Dan Black Lv.1 → 1st Dan Black Lv.2 → 1st Dan Black Lv.3 → 1st Dan Black Lv.4
→ 2nd Dan Black → 2nd Dan Black Lv.1 → 2nd Dan Black Lv.2 → 2nd Dan Black Lv.3 → 2nd Dan Black Lv.4
→ 3rd Dan Black
```
Store as a varchar on the student record (current `beltRank` column already exists). Rank up/down buttons must follow this exact order — no skipping.

### Eligibility Rule
- **15 classes attended** since last belt promotion = eligible to test
- Same threshold for every rank
- Eligibility is a flag/indicator only — instructor still manually confirms

### DB Changes Needed (Manus)
- [x] Add `attendance` table (created, migration applied)
- [x] Add `lastPromotedAt` timestamp column to `students` table
- [x] Computed `attendanceSincePromotion` on query (no need to store)

### Attendance Kiosk Page (Manus — `/attendance`) ✅ DONE
- [x] Password gate (ATTENDANCE_KIOSK_PASSWORD env var, persists in localStorage)
- [x] Large-touch-friendly UI, tablet-optimized
- [x] Student name search with live filtering
- [x] Check-in confirmation with belt rank display
- [x] Auto-reset to search after 5 seconds
- [x] Duplicate check: "Already checked in today" message
- [x] No undo/edit from kiosk page (staff-only admin functions)

### Students Tab Changes (Manus — admin dashboard) 🔄 IN PROGRESS
- [ ] Checkbox on each student row for multi-select
- [ ] When 1+ students selected: action bar appears at top of list with:
  - **Edit Info** — inline edit or modal: name, phone, email, program, status, emergency contact
  - **Belt Rank +** — promote one rank up (follows ordered list above)
  - **Belt Rank -** — demote one rank down
  - **Mark Eligible** — manual override to flag as eligible regardless of class count
- [ ] Eligibility indicator at top of Students tab: small banner/badge like "3 students eligible to test" — clicking it filters the list to eligible students only
- [ ] Each student row shows: name, program, belt rank, classes since last promotion (e.g. "11/15"), eligibility badge if ≥15

### Claude's Automation (after Manus completes DB + UI)
- [ ] n8n workflow: runs weekly → queries students where attendanceSincePromotion ≥ 15 → sends email to tmasuwanee@gmail.com with list of eligible students
- [ ] n8n workflow (future): instructor approves student → parent gets notification

---

## 2. Facebook Ads Full Automation

**Owner: Claude (n8n + FB API) + Manus (dashboard UI)**
**Priority: Medium**

### What's already done
- FB Marketing API connected (`FACEBOOK_MARKETING_API_TOKEN`, `FACEBOOK_AD_ACCOUNT_ID` in Manus Secrets)
- Ad data syncing to MySQL (`facebook_ad_insights` table)
- Ad Performance tab on admin dashboard (7d / 14d / 30d view)
- Daily auto-sync via Heartbeat cron (`POST /api/scheduled/sync-fb-ads`)

### What's pending
- [!] Facebook Lead Ads Sync workflow `lJwUNK9XpYbPDBBn` is inactive until Meta assets are assigned to the `Conversions API System User`
- [ ] User: Meta Business Manager > Settings > System Users > `Conversions API System User` > Add Assets > assign Ad Account `1008273610146745` (Manage campaigns) + TMA Facebook Page (Manage Page)
- [ ] After assignment: regenerate token, provide it to the agent, find `FB_LEAD_FORM_ID` via `GET /{page_id}/leadgen_forms`, update n8n workflow, activate
- [ ] User to share reference video for ad strategy analysis
- [ ] Claude: Analyze video → map to TMA's ad practices → build automation spec
- [ ] Claude: n8n — weekly ad performance report email (spend, CPL, leads)
- [ ] Claude: n8n — CPL threshold alert
- [ ] Claude: n8n — lead volume drop alert
- [ ] Manus: Dashboard enhancements based on video analysis

### Pending from user
- [ ] Reference video
- [ ] CPL threshold (what's too expensive per lead?)
- [ ] Decision: auto-pause ads or just alert?

---

## 3. SMS Automations via Twilio

**Owner: Claude (n8n + Twilio)**
**Priority: High**

### What's pending
- [ ] User: Create Twilio account + start A2P 10DLC registration (business name, EIN, vertical = Education)
- [ ] User: Register SMS campaign (use case = Marketing, ~3 sample messages needed)
- [ ] User: Purchase local number (770 area code preferred)
- [ ] User: Add Twilio Account SID + Auth Token to .env + Manus Secrets

### Build sequence (after A2P approved)
- [ ] Claude: New lead → SMS within 2 minutes
- [ ] Claude: Missed trial → SMS same day
- [ ] Claude: 24h before trial → SMS reminder
- [ ] Claude: Belt testing approval → SMS to parent with payment link (future)

---

## 4. Retell AI Missed Call Agent

**Owner: Claude (Retell config + n8n webhook)**
**Priority: High**

### Pending decisions
- [ ] Who is the carrier for 770-277-3009? (needed to evaluate porting vs forwarding)
- [ ] Port number to Twilio, or forward missed calls only?
- [ ] User: Create Retell account at retell.ai

### Build sequence (after Twilio + routing decided)
- [ ] Claude: Retell agent prompt (TMA hours, location, programs, pricing, lead capture)
- [ ] Claude: Retell webhook → n8n → create lead in DB → fire intake sequence
- [ ] Test: call 770-277-3009 → Retell answers → lead in dashboard

---

## Completed

- [x] Lead intake form → DB → n8n webhook
- [x] Staff alert email on new lead
- [x] Day 2 + Day 4 follow-up email sequence (48h waits)
- [x] Trial No-Show Recovery (daily 9 AM, Day 1 + Day 3 emails, stage updates)
- [x] REST endpoints for n8n (/api/leads, /api/leads/:id/stage)
- [x] no_show + no_show_final pipeline stages
- [x] Facebook Marketing API sync + Ad Performance dashboard
- [x] AGENTS.md + WORKFLOWS.md + ROADMAP.md shared docs
