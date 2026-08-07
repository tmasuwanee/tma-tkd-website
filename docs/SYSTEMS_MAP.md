# TMA Systems & Automations Map

Every automation across the four surfaces and how they work together. Current as of 2026-08-05.
Companion doc: [WORKFLOWS.md](./WORKFLOWS.md) has the n8n + cron detail; this doc is the channel-by-channel view.

The four surfaces:
- **Website** (tmatkd.com) — public forms and checkout pages.
- **Server** (the app) — the brain: writes the database, sends email, pings Telegram, calls Stripe/Retell/n8n.
- **Telegram** — the staff group chat: real-time operational alerts.
- **Email** (Resend) — customer receipts/confirmations + staff notifications.
- **Admin dashboard** (/admin) — where staff read and act on everything.
- Plus two external engines: **n8n** (email sequences + syncs) and **Retell** (voice agent).

---

## 1. Website forms → what each one fires

| Form (URL) | Writes | Telegram | Email | Other |
|---|---|---|---|---|
| Free class / inquiry (`/free-class`) | lead (prospect) | — | **Staff** inquiry email + Slack | Meta CAPI lead event, n8n intake webhook, Google Sheets |
| Open House RSVP (`/open-house`) | lead (prospect, tagged open_house) | — | Staff inquiry email + Slack | Meta, n8n (same path as inquiry) |
| Afterschool tour (`/afterschooltour`) | lead (prospect) | — | Staff inquiry email + Slack | Meta, n8n |
| Walk-in waiver (`/enroll`) | lead + waiver (form_only) | **New in-person sign-up** | **Staff** waiver email (new) | — |
| Afterschool waiver only (`/afterschool-waiver`) | waiver (form_only) + PDF | **After-school waiver signed** | **Staff** waiver email (new) | stored PDF |
| Transportation form (`/transportation`) | waiver + PDF | **Transportation form signed** | **Parent + staff** (PDF attached) | stored PDF |
| Afterschool registration (`/afterschool-register`) | lead (enrolled) + waiver + PDF, then payment | **enrollment signed**, then **registration paid** | **Parent + staff** intake PDF, then parent confirmation | Stripe, Meta purchase |
| Supply fee (`/supply-fee`) | Stripe payment only | **Supply fee paid** | Stripe receipt | Stripe |
| Back-to-School $49 (`/back-to-school`) | lead (trial), then payment | **$49 PAID** | Stripe receipt | Stripe, Meta purchase |
| Pro-shop / Christmas (`/christmas-in-july`) | lead (order), then payment | **order PAID** | **Staff** order email | Stripe |
| Camp registration (`/camp-registration`) | campRegistrations, then payment | **Camp registration PAID** (+ **email FAILED** alert) | **Parent** confirmation + camp waiver email | Stripe |
| Camp field trip (`/field-trip`) | Stripe payment only | **Field trip paid** | **Parent** confirmation | Stripe |
| $99 trial (staff-initiated, Students tab) | trialEnrollments + lead trial_paid, then payment | **New $99 trial** | **Parent** receipt | Stripe |

Key: an **inquiry** (someone curious) uses email + Slack + Meta + n8n but **no Telegram**. A **payment or a signed form** uses **Telegram** (real-time "money/paperwork just happened") + a matching email.

---

## 2. Telegram — every alert and what triggers it

Telegram is the **real-time staff feed**. One helper (`sendTelegramMessage`) fires to the staff chat. 26 triggers, in three groups.

**A. Payments & signed forms (from the website/checkout):**
Camp registration paid · Camp email-send failed · Camp waiver submitted · Walk-in sign-up (waiver) · Transportation form signed · Field trip paid · Supply fee paid · After-school waiver signed · $99 trial paid · Back-to-School $49 paid · Christmas/pro-shop order paid · After-school enrollment signed · After-school registration paid.

**B. Voice agent (Retell → server):**
Every inbound call summary · New trial booked by the voice agent · Trial booked for a returning parent / 2nd child · Booking-save-failed alert · Callback requested (caller asked for a human) · **PICKUP — send the child down now** · Outbound call outcome · Callback requested (outbound) · "Wants a human" follow-up.

**C. Scheduled (the daily crons, see §4):**
Morning report · Trials happening today (~8am) · "Did they show?" check-in prompt (~8:30pm) · Daily prioritized call list (~8am) · 3-week trial ending in 7/3/2/1 days.

Telegram never *collects* anything — it's outbound alerts only. Staff act on them inside the dashboard.

---

## 3. Email (Resend) — every email and who gets it

Sender: `Top Martial Arts <hello@tmatkd.com>`. Staff notifications go to `LEAD_NOTIFICATION_EMAIL`, falling back to `tmasuwanee@gmail.com`.

**To STAFF (someone needs to act):**
- New inquiry (free-class / tour / open house) — `sendEmailNotification`, titled by the real source.
- New signed waiver (walk-in + after-school) — `sendWaiverNotification` (added 2026-08-05; previously waivers had no email).
- Pro-shop / sale order — `sendProShopOrderNotification`.
- Transportation form + after-school enrollment — staff get a copy of the PDF.
- (Slack gets a parallel copy of new inquiries.)

**To the PARENT (receipt / confirmation):**
- Camp registration confirmation + camp waiver request.
- $99 trial receipt.
- Field trip confirmation.
- After-school registration confirmation + the signed intake PDF.
- Transportation + after-school waiver PDFs (their signed copy).

**From n8n (customer-facing sequences, not the app):** intake nurture (Day 2 / Day 4), 24-hour trial reminders, no-show recovery, enrollment welcome + referral. See WORKFLOWS.md.

---

## 4. Scheduled jobs (the app's own crons)

Fire on a schedule to `/api/scheduled/*`, gated by the Automation kill switches (dashboard). All America/New_York.

| Job | ~When | Does | Lands in |
|---|---|---|---|
| Morning report | 11:30am | Ops/health summary | Telegram |
| Trial reminders AM | 8:00am | Today's trials + trial-ending 7/3/2/1-day pings | Telegram |
| Trial check-in PM | 8:30pm | "Did they show?" prompt for today's trials | Telegram |
| Daily call queue | 8:00am | Scored top call list (prospects/trials only) | Telegram |
| Outbound: speed-to-lead / no-show / post-trial / afterschool-tour | various | Retell places outbound calls | Phone + Telegram |
| FB ad-insights sync | daily | Pulls ad performance | Dashboard (Ad Performance) |

---

## 5. n8n workflows (external engine — email sequences + syncs)

11 workflows on n8n.arfaconsults.com. Summary (full detail in WORKFLOWS.md):
Lead Intake v3 (website → nurture routing) · Sequence Dispatcher (every 5 min) · Trial No-Show Recovery (email) · Trial Reminders 24h (email) · Enrollment Auto-Reconciler (matches leads↔students, marks enrolled) · Facebook Lead Ads Sync (every 15 min → leads) · Duplicate Lead Detector (daily) · Retell Inbound Call Handler (inbound calls → lead + staff alert) · Camp Waiver Capture · Weekly Ad Intelligence · (Lead Intake v2 retired).

Split confirmed: **inbound** voice → n8n; **outbound** voice → the app.

---

## 6. Admin dashboard — what each view reads and does

**Prospects**
- Today's Calls — scored call board (prospects/trials); mark call outcomes.
- Calendar — scheduled trials; book walk-in/phone trials.
- Leads — the pipeline (record-type filtered: Prospects & Trials by default).
- Trial Check-in — mark showed-up / no-show → sets pipeline stage. (This is what the 8:30pm Telegram prompts.)

**Customers**
- Enrolled Families — enrolled leads + paid after-school registrations.
- Afterschool Roster — weekly attendance sheet (check-in/out per day, now persisted), add/remove schools + students, print.
- Students — class roster (belts, attendance, $99 trials).
- Orders — pro-shop / seasonal purchases.
- Camp Registrations — paid camp signups.
- Invoice Generator — search a customer's Stripe payments, edit/add lines, generate the branded invoice PDF.

**Forms & Calls**
- Waivers — signed waivers, searchable, grouped by source (which waiver).
- Call Log — Retell voice calls + transcripts.
- Voice Test — place a test outbound Retell call.

**Growth**
- Email Sequences — edit the n8n nurture templates.
- Routing Rules — how inbound leads get routed.
- Ad Performance — Facebook ad insights.

**System**
- Front Desk Playbook · Links (every shareable URL + QR) · My Tasks · **Automation** (kill switches that turn the crons/voice on/off) · Studio.

---

## 7. How the surfaces interconnect (the real flows)

**A new lead (inquiry):**
Website form → server writes the lead → **email to staff** + **Slack** + **Meta CAPI** + **n8n** (which starts the email nurture). It appears in the **dashboard** Leads + Today's Calls. The 8am cron puts hot ones on the **Telegram** daily call list. Staff call from Today's Calls and log the outcome.

**A payment (camp / trial / after-school / fees / orders):**
Website checkout → Stripe → `confirm` → **Telegram** ("X paid") + a **customer email receipt** + a **dashboard** record (Camp / Orders / Enrolled / etc.) + Meta purchase event.

**A signed form (waiver / transportation / after-school):**
Website form → server stamps a **PDF**, stores it, files it under **Waivers** (dashboard) → **Telegram** ("signed") + **email** (staff, and the parent gets their PDF copy).

**A trial, end to end:**
Booked (website, voice agent, or manual in the dashboard) → shows on **Calendar** → 8am **Telegram** reminder → 8:30pm **Telegram** "did they show?" → staff mark it in **Trial Check-in** (sets stage) → if no-show, **n8n** sends recovery email + the app places an **outbound Retell call** → converts to enrolled (Meta purchase, welcome email via n8n).

**A phone call:**
Inbound → **Retell** agent → **n8n** handler creates/updates the lead + **Telegram** alert + logs to **Call Log**. The agent can book a trial (→ Calendar + Telegram) or request a pickup (→ **PICKUP** Telegram). Outbound calls run from the app on the crons and log outcomes to Telegram + Call Log.

**Master control:** the **Automation** view (kill switches) gates the crons and the voice agent, so staff can pause any automation without a deploy.
