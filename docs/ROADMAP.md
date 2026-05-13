# TMA Automation Roadmap

Shared backlog for Claude and Manus. Updated as items are scoped, started, or completed.
Both agents should check this before starting new work — something may already be specced or in progress.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

---

## 1. Student Attendance Tracker + Belt Testing Automation

**Owner: Both (Manus = UI/DB, Claude = automation logic)**
**Priority: High — needed before belt testing cycle**

### What's needed
- Students CSV uploaded to dashboard (user will upload via existing Students tab)
- Attendance tracking system: log class attendance per student per date
- Belt testing eligibility logic: auto-flag students who meet requirements
- Belt testing payment: Stripe checkout for parents to pay testing fee
- Belt testing forms: shareable Google Doc / PDF form for parents to fill

### Nuances (to be scoped in detail before building)
- Belt rank progression varies by program (Taekwondo, BJJ, Kickboxing differ)
- Minimum class count requirements per belt level (user to provide numbers)
- Instructor override: auto-flag is a suggestion, instructor confirms
- Testing cycles happen on a schedule (not continuous) — need to know cadence
- Payment amount varies by belt level potentially
- Form delivery: email to parent after instructor approves student for testing

### Pending from user
- [ ] Belt testing requirements doc (class counts per rank, programs)
- [ ] Belt testing price structure (flat fee or per rank?)
- [ ] Belt testing cycle cadence (monthly? quarterly?)
- [ ] Confirmation of how attendance gets logged (manual staff entry? QR scan? other?)

### Build sequence (once above is provided)
- [ ] Manus: Add `attendance` table to schema (studentId, date, classType, loggedBy)
- [ ] Manus: Attendance logging UI on admin dashboard
- [ ] Manus: Belt testing eligibility view (students who hit class count threshold)
- [ ] Manus: Stripe checkout for belt testing fee
- [ ] Claude: n8n workflow — eligibility detected → email instructor summary weekly
- [ ] Claude: n8n workflow — instructor approves → parent gets payment link + form

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
- [ ] User to share reference video for ad strategy analysis
- [ ] Claude: Analyze video → map to TMA's ad practices → build automation spec
- [ ] Claude: n8n workflow — weekly ad performance report (spend, CPL, leads) → email to tmasuwanee@gmail.com
- [ ] Claude: n8n workflow — CPL threshold alert (if cost per lead exceeds $X → alert)
- [ ] Claude: n8n workflow — auto-pause underperforming ads via FB Marketing API (requires user approval on logic)
- [ ] Claude: n8n workflow — lead volume drop alert (if leads < X in 48h window → alert)
- [ ] Manus: Dashboard enhancements based on what video analysis surfaces

### Pending from user
- [ ] Reference video to analyze
- [ ] CPL threshold (what's too expensive per lead for TMA?)
- [ ] Decision: auto-pause ads or just alert?

---

## 3. SMS Automations via Twilio

**Owner: Claude (n8n + Twilio API)**
**Priority: High — needed for lead follow-up speed**

### What's needed
- Twilio phone number purchase
- A2P 10DLC brand + campaign registration (required for business SMS in US)
- SMS integrated into existing lead follow-up sequences

### A2P Registration steps (user must do most of this)
- [ ] Create Twilio account if not already done
- [ ] Register brand (business name, EIN, address, vertical = Education/Martial Arts)
- [ ] Register campaign (use case = Marketing, sample messages needed)
- [ ] Wait for carrier approval (~1-7 days after submission)
- [ ] Purchase local number (770 area code preferred to match existing TMA number)

### Build sequence (after A2P approved)
- [ ] Claude: Add Twilio credentials to n8n
- [ ] Claude: n8n — new lead form submit → SMS to lead within 2 minutes ("Hey [name], this is TMA Suwanee...")
- [ ] Claude: n8n — missed trial class → SMS same day (no-show recovery, alongside email)
- [ ] Claude: n8n — belt testing approval → SMS to parent with payment link
- [ ] Claude: n8n — 24h before trial class → SMS reminder to lead

### Pending from user
- [ ] Twilio account setup + A2P registration started
- [ ] Confirm SMS copy tone (casual vs formal)
- [ ] Twilio Account SID + Auth Token → add to .env + Manus Secrets once ready

---

## 4. Retell AI Missed Call Agent

**Owner: Claude (Retell + Twilio routing)**
**Priority: High — missed calls = lost leads**

### What's needed
- Retell AI agent configured for TMA (answers questions, captures lead info)
- Call routing: forward missed calls from 770-277-3009 to Retell agent
- Lead data from Retell calls → saved to TMA leads DB + fires n8n intake sequence

### Call routing options (need to evaluate)
- **Option A:** Port 770-277-3009 to Twilio → Twilio handles routing → forward to Retell on no-answer
- **Option B:** Set up call forwarding on existing carrier → forward to Twilio number → Retell picks up
- **Option C:** Keep existing number on carrier, add Twilio as overflow only

### Retell agent scope
- Greet caller, explain it's TMA's virtual assistant
- Answer: hours, location, programs offered, pricing questions
- Capture: name, age of child, program interest, contact info
- End: "We'll have someone call you back shortly" + fires SMS/email to staff

### Build sequence
- [ ] Confirm call routing approach with user (see options above)
- [ ] Set up Retell account + API key → add to .env
- [ ] Claude: Build Retell agent prompt (TMA-specific knowledge base)
- [ ] Claude: Retell webhook → n8n → create lead in DB → fire intake sequence
- [ ] Test end-to-end: call 770-277-3009 → Retell answers → lead appears in dashboard

### Pending from user
- [ ] Retell account created? (retell.ai)
- [ ] Decision on call routing approach (port number vs forward vs overflow)
- [ ] Confirm with carrier (who holds 770-277-3009?) — porting requires carrier info

---

## Completed

- [x] Lead intake form → DB → n8n webhook (Lead Intake v2)
- [x] Staff alert email on new lead
- [x] Day 2 + Day 4 follow-up email sequence (48h wait nodes)
- [x] Trial No-Show Recovery (daily 9 AM, Day 1 + Day 3 emails, stage updates)
- [x] REST endpoints for n8n (/api/leads, /api/leads/:id/stage)
- [x] no_show + no_show_final pipeline stages
- [x] Facebook Marketing API sync + Ad Performance dashboard
- [x] AGENTS.md + WORKFLOWS.md shared docs
