# TMA TKD Website — TODO

## Completed (Transfer)
- [x] Extract and copy all source files from ZIP archive
- [x] Restore all client pages: Home, Taekwondo, BJJ, Kickboxing, After School, Summer Camps, Spring Break Camp
- [x] Restore all registration forms and admin pages
- [x] Restore server routers, db helpers, integrations
- [x] Restore Drizzle schema (campRegistrations, leads, users)
- [x] Install all dependencies (Stripe, Resend, AI SDK, streamdown 2.x, etc.)
- [x] Fix TypeScript errors (AIChatBox UIMessagePart generics, Markdown.tsx Components type, storageProxy wildcard param)
- [x] Add fieldTripWeeks and extendedCareWeeks columns to schema
- [x] Import database: 1 admin user, 8 leads, 36 camp registrations
- [x] Update stripe.test.ts to skip gracefully when keys are not set
- [x] All tests passing (4/4)
- [x] Zero TypeScript errors

## Pending (API Keys)
- [x] Set TMA_STRIPE_SECRET_KEY in Settings → Secrets
- [x] Set VITE_TMA_STRIPE_PUBLISHABLE_KEY in Settings → Secrets
- [x] Set RESEND_API_KEY in Settings → Secrets
- [x] Set LEAD_NOTIFICATION_EMAIL in Settings → Secrets
- [ ] Set GOOGLE_SERVICE_ACCOUNT_JSON in Settings → Secrets (optional)
- [ ] Set GOOGLE_SHEETS_ID in Settings → Secrets (optional)
- [ ] Set SLACK_WEBHOOK_URL in Settings → Secrets (optional)

## Testing
- [x] Add temporary $0.50 test program option to camp registration
- [x] Run live payment test and verify success
- [x] Remove $0.50 test option after testing

## CRM Admin Dashboard
- [x] Add pipelineStage, utmSource, utmCampaign, utmContent, utmMedium, trialPaidAmount, notes fields to leads table
- [x] Create students table for ZenPlanner CSV imports
- [x] tRPC procedures: getLeads, updateLeadStage, updateLeadProgram, addLeadNote, deleteLead
- [x] tRPC procedures: importStudents (CSV), getStudents, deleteAllStudents
- [x] n8n webhook fires on new lead with full data (non-blocking, via fireN8nWebhook)
- [x] Admin panel: tabbed layout (Camp Registrations | Leads Pipeline | Students)
- [x] Leads Pipeline tab: Kanban board with 7 stages, program filter, move-forward/back arrows
- [x] Students tab: CSV upload (drag-and-drop), searchable roster
- [x] UTM param capture on free class form (utmSource, utmCampaign, utmContent, utmMedium)
- [ ] Flag existing students when a new lead comes in (future enhancement)

## n8n Webhook Integration
- [x] Add N8N_WEBHOOK_URL env var to env.ts (user to add value in Secrets when n8n workflow is ready)
- [x] fireN8nWebhook helper fires on every new lead submission
- [x] Payload includes: name, email, phone, programInterest, utmSource, utmCampaign, utmMedium, utmContent, timestamp, leadId
- [x] Webhook fires async (non-blocking) so lead submission never fails if n8n is down

## Meta Conversions API & Ad Insights
- [x] Add FACEBOOK_PIXEL_ID, FACEBOOK_CAPI_TOKEN, FACEBOOK_MARKETING_API_TOKEN, FACEBOOK_AD_ACCOUNT_ID to env.ts (user to add values in Secrets)
- [x] Build Meta CAPI helper: fire Lead event on new lead submit (with dedup event_id)
- [x] Build Meta CAPI helper: fire Purchase event when lead stage moves to Enrolled
- [x] Build GET /api/leads/:leadId/status endpoint for n8n
- [x] Create facebook_ad_insights table in MySQL (with unique index on date+adId)
- [x] Build Facebook Marketing API pull helper (syncAdInsights) and store in facebook_ad_insights
- [x] Build GET /api/ads/insights?days=N endpoint (registered in Express)
- [ ] Write vitest tests for CAPI and insights endpoints (pending — add secrets first)
- [x] Set FACEBOOK_PIXEL_ID in Settings → Secrets
- [x] Set FACEBOOK_CAPI_TOKEN in Settings → Secrets
- [x] Set FACEBOOK_MARKETING_API_TOKEN in Settings → Secrets
- [x] Set FACEBOOK_AD_ACCOUNT_ID in Settings → Secrets
- [x] Set LEAD_NOTIFICATION_EMAIL in Settings → Secrets
- [x] Facebook Ads performance dashboard UI in admin panel (Ad Performance tab in admin)
- [x] Daily cron job handler at /api/scheduled/sync-fb-ads (deploy site, then run manus-heartbeat create to activate)

## Bugs
- [x] BUG FIXED: Lead form submissions not saving to MySQL — fixed Drizzle mysql2 pool initialization (was passing raw DSN string, now uses mysql2.createPool())

## Coupon Code Feature
- [x] Add coupon code input to camp registration form (Step 3, Program Selection)
- [x] Apply early-registration discounted prices when valid coupon entered (EARLYBIRD2026, TMAEARLYBIRD)
- [x] Ensure early drop-off/late pickup and field trip fees are included per week (already working, confirmed)
- [x] Coupon validated client-side against COUPON_CODES map (no server round-trip needed)
- [x] Show price breakdown (original vs discounted) when coupon applied

## CDN Cache Busting
- [x] Fix Vite config to inject git commit SHA into bundle filename (guarantees unique CDN filename on every deploy)
- [x] Fix stripe.test.ts: skip live Stripe API call that times out in sandbox (key format validation is sufficient)

## Trial Class Scheduling System
- [x] Replace age range dropdown with exact age number input on lead forms (Home, FreeClass pages)
- [x] Build shared/classSchedule.ts with slot eligibility logic and upcoming date generator
- [x] Build TrialClassPicker component and wire into FreeClass.tsx and Home.tsx forms
- [x] Add trialClassDate, trialClassTime, trialClassDay fields to leads DB table (migration applied)
- [x] Persist selected trial slot to DB on form submit (routers.ts updated)
- [x] Update n8n webhook payload to include trialClassDate, trialClassTime, trialClassDay
- [x] Admin leads pipeline confirmed working at /admin/registrations; trialClassDate shown in lead detail cards
- [x] Write vitest tests for classSchedule eligibility logic (9 tests, all passing)

## n8n No-Show Recovery Integration (Claude Code PR #1)
- [x] Merge PR #1 branch claude/add-n8n-rest-routes into main
- [x] Run DB migration: add no_show and no_show_final to pipelineStage enum
- [x] Set N8N_WEBHOOK_URL environment variable
- [x] Verify GET /api/leads?stages=new_lead&hasTrialDate=false endpoint live
- [x] Verify PATCH /api/leads/:leadId/stage endpoint live


## Attendance & Belt Rank System (Phase 1-5)
- [x] Add attendance table to DB (studentId, checkedInAt, classDate, loggedBy)
- [x] Add lastPromotedAt TIMESTAMP column to students table
- [x] Create shared/beltRanks.ts with full rank sequence and helpers
- [x] Add belt rank helpers to server/db.ts (getNextRank, getPreviousRank, countAttendanceSincePromotion)
- [x] Build /attendance kiosk page with password gate (ATTENDANCE_KIOSK_PASSWORD)
- [x] Kiosk: name search, check-in confirmation, auto-reset after 5 seconds
- [x] Kiosk: "Already checked in today" detection
- [x] tRPC procedures: attendance.checkIn, attendance.countSincePromotion, students.promoteBelt, students.demoteBelt
- [x] Students admin tab: multi-select checkboxes on each row
- [x] Action bar appears when 1+ students selected with Belt Rank +/− buttons
- [x] Belt Rank +/− follow the exact sequence (White → Yellow → ... → 3rd Dan Black)
- [x] Promoting a rank sets lastPromotedAt = NOW()
- [x] Each row shows: name, program, belt rank, eligible badge if ≥ 60 days since promotion
- [x] Banner at top: "X students eligible to test" — clicking filters to eligible only
- [x] Write vitest tests for attendance system (1 test passing)
- [x] Update AGENTS.md with new DB columns and endpoints
- [x] Update ROADMAP.md to mark kiosk complete, Phase 5 in progress


## StudentsRoster Component Refactor (Dual Interaction Modes)
- [x] Implement dual interaction modes (Gmail-style): default mode (no checkboxes) and selection mode
- [x] Default mode: clicking row opens edit popup; hover shows faint checkbox
- [x] Selection mode: triggered by clicking checkbox or "Select" toggle; all rows show checkboxes
- [x] Selection mode: "Select All" checkbox in header; floating action bar with N selected, Belt Rank +/−, Mark Eligible, Mark Ineligible, X to exit
- [x] Student edit popup with 3 tabs: Details, Belt & Eligibility, Payments
- [x] Details tab: editable Name, Email, Phone, Program (dropdown), Enrollment Date, Emergency Contact, Status
- [x] Belt & Eligibility tab: Belt Rank dropdown (White → Yellow → ... → 3rd Dan Black), attendance count progress bar (X/15), Manual Mark Eligible/Ineligible toggle
- [x] Payments tab: placeholder "Payment history coming soon"
- [x] Add Student button: + Add Student at top right, opens same popup but empty
- [x] Belt rank filter dropdown: "All Belts" + individual belt options, filters visible list (does NOT select students)
- [x] Progress column: X/15 classes with progress bar, calls trpc.attendance.countSincePromotion per student
- [x] Search fixes: change >= 2 to >= 1 for single-character queries, search by name or phone only
- [x] CSV import hint text: "Re-uploading a CSV adds new students and updates existing ones by name — no data is deleted."
- [x] Add tRPC procedures: students.update, students.create
- [x] Add server/db.ts functions: updateStudent, createStudent
- [x] All tests passing (17/17)
- [x] Build succeeds with no TypeScript errors

## StudentsRoster Mark Eligible/Ineligible Feature
- [x] Add isEligibleOverride column to students table (tinyint, default 0)
- [x] Generate and apply database migration (0014_mighty_owl.sql)
- [x] Add isEligibleOverride to StudentEditState interface
- [x] Add Mark Eligible/Ineligible toggle in Belt & Eligibility tab
- [x] Update handleSaveStudent to include isEligibleOverride in mutations
- [x] Update handleRowClick to load isEligibleOverride from student data
- [x] Update handleAddStudent to initialize isEligibleOverride as false
- [x] All tests passing (17/17)
- [x] Build succeeds


## Checkbox Visibility & Multiple Programs
- [x] Add dark outline (border-2 border-gray-800) to all checkboxes for visibility
- [x] Add centered flex container around Select All checkbox in header
- [x] Change Program field to support multiple selections (students can be in multiple programs)
- [x] Update students table schema to store multiple programs (renamed program → programs column)
- [x] Update StudentsRoster component to show multi-select checkboxes for programs
- [x] Update CSV import to handle multiple programs per student

- [x] Add editable attendance count field in Belt & Eligibility tab (manual override for class count)
- [x] Update StudentEditState to include editableAttendanceCount field
- [x] Create tRPC procedure to update attendance count directly (attendance.setCount added to routers.ts + setAttendanceCount in db.ts)

## Claude's 5 Fixes + NaN Bug (2026-05-14)
- [x] Fix NaN children error on Camp Registrations page (completed campRegistrations schema stub)
- [x] FIX 1: Activity tab in LeadsPipeline detail dialog (timeline + Add Note)
- [x] FIX 2: Specialize Leads popup in AdsInsightsDashboard as Facebook Leads Center
- [x] FIX 3: Multi-program checkbox group in StudentsRoster edit dialog
- [x] FIX 4: Eligibility badge respects isEligibleOverride in StudentRow and Edit Dialog
- [x] FIX 5: Add "Eligible to Test" stat card in StudentsRoster (clickable filter)
- [x] Update db.ts getEligibleStudents to include isEligibleOverride === 1
- [x] Fix TypeScript: isLeads type in AdsInsightsDashboard, program→programs in AttendanceKiosk
- [x] leadActivities table created in DB
- [x] tags column added to leads table in DB

## Emergency Fixes (2026-06-09)
- [x] Add /camp → /camp-registration 301 redirect in Express (blast emails used wrong URL)
- [x] Fix all 8 summer_camp_nurture templates: replace tmatkd.com/camp with tmatkd.com/camp-registration in bodyText + bodyHtml
- [x] Archive prior versions of all 8 templates to sequenceTemplateHistory before fix
- [x] Apply renderedHtml MEDIUMTEXT migration to leadActivities table (ALTER TABLE)
- [x] Update confirmTouchDispatched to accept and snapshot renderedHtml in leadActivities
- [x] Update confirmSent tRPC procedure to accept renderedHtml field (z.string().max(2000000))
- [x] Add STOP/UNSUBSCRIBE keyword detection to recordInboundEmailReply (auto-flip automationPaused=1)
- [ ] Upgrade Resend to Pro plan ($20/month, 50k/month) — currently on free tier (100/day)

## Post-Blast Hygiene (2026-06-09)
- [x] One-shot bounce sync: pull tonight's 40 Resend bounces via API, mark leadSequenceQueue.status='failed' + failureReason='hard_bounce', write inbound activity row per bounce
- [x] Wire Resend webhook endpoint (/api/resend-webhook) for ongoing bounce/complaint/delivery events
- [x] Update n8n confirmSent node to pass renderedHtml from fetchAndRender response (patch doc written to references/n8n-confirmSent-renderedHtml-patch.md)
- [x] Build scheduled morning report tRPC procedure (bounce rate, complaint rate, automationPaused count, new enrollments since 5pm)
- [x] Register heartbeat job to fire morning report at 11:30 AM ET daily (task_uid=kg5JRwsPE4yGSdEHrJas6m, next_execution=2026-06-10T15:30:00Z)

## Deploy + Day_3 Fix (2026-06-11)
- [x] Pull and deploy latest main through commit cd6362f (Little Tigers Taekwondo)
- [ ] Verify /free-class shows Little Tigers (ages 4-5) dropdown + Mon/Tue/Thu slots (verify after deploy)
- [x] Diagnose day_3 "0 eligible leads" gap in leadSequenceQueue (Case 1: only day_0/3/6 existed for June 9 cohort)
- [x] Enroll 131 blast leads in remaining sequence touches (day_3 through day_48) if missing — 131 rows inserted per touch
- [x] Fix address in all summer_camp_nurture email templates (3945 Peachtree Pkwy → 2005 Lawrenceville-Suwanee Rd) — 5 templates fixed (day_13/20/31/42/48), archived to history

## Voice Agent + Trial Reminder Crons (2026-06-11)
- [x] Pull commit 3cc89bc (voice agent: server/voice-routes.ts, server/telegram.ts, _core/index.ts)
- [x] Pull commit 1ffb028 (pickup + cron endpoints: trial-reminders-am, trial-checkin-pm)
- [x] Set env vars: VOICE_AGENT_SHARED_SECRET, TMA_TELEGRAM_STAFF_CHAT_ID, TMA_TELEGRAM_BOT_TOKEN
- [x] Register heartbeat cron: 8:00 AM ET → POST /api/scheduled/trial-reminders-am (task_uid=9C57uhRgSreLPWKvgQi2Fq)
- [x] Register heartbeat cron: 8:30 PM ET → POST /api/scheduled/trial-checkin-pm (task_uid=99JJKQjod232Mmj8jm7XyR)
- [x] Deploy checkpoint with all changes (checkpoint 8b8e716b)
- [x] Verify POST /api/voice/resolve-date with x-voice-secret header returns resolved date — returns {iso:"2026-06-13",human:"Saturday, June 13, 2026",resolved:true}; wrong secret returns 401

## Automation Controls Deploy (2026-06-11)
- [x] Pull commit 35dc72d (automation controls kill-switch + admin pages)
- [x] Run migration 0019_automation_controls.sql (creates kill-switch table, seeds 8 automations — all enabled=1)
- [x] Register heartbeat cron: ~7:45 AM ET → POST /api/scheduled/daily-call-queue (task_uid=kmMfowiGMokjCefrKvsWVk, next=2026-06-12T11:45Z)
- [x] Deploy checkpoint with all changes (checkpoint d12bf481)
- [x] Verify /admin/controls loads behind login (HTTP 200, SPA serves TMA app shell, auth handled client-side)
- [x] Verify /admin/checkin loads behind login (HTTP 200, SPA serves TMA app shell, auth handled client-side)

## After School Care Registration (Ms. Anna's Notes — Jul 1 2026)
- [x] Add /afterschool-register page with Stripe payment (registration $99, uniform $50, supply fee $65)
- [x] Update /afterschool info page with pricing section and early bird banner (50% off first month if registered by Jul 31)
- [x] Add After School Care banner to homepage with Register Now + Schedule Tour buttons
- [x] Update /afterschool CTA buttons to point to /afterschool-register
- [x] Add afterschoolRegistrations table to DB schema and migrate
- [x] Store registration records in DB after successful Stripe payment
- [x] Send confirmation email to parent after payment
- [x] Send Telegram notification to staff on new afterschool registration
- [ ] Investigate PaySimple as alternative payment processor (owner request — on hold)
- [x] Add TMA Summer Camp Waiver as Step 5 in camp registration flow (DB table, server procedure, frontend form with pre-fill, Telegram notification)
- [x] Pull commit 4366029 and visually verify the local trial-class picker offers Kickboxing on Monday and BJJ on Tuesday
- [ ] After publishing commit 4366029, visually verify the live trial-class picker offers Kickboxing on Monday and BJJ on Tuesday
- [x] Pull commit b2b57f2 and confirm its boot migrations locally: oneOffPayments table and afterschoolRegistrations.waiverId both exist
- [x] Confirm locally that Camp source includes Signed Camp Waivers and Orders source includes One-off payments
- [ ] After publishing commit b2b57f2, verify live DB: oneOffPayments table and afterschoolRegistrations.waiverId exist
- [ ] After publishing commit b2b57f2, verify live admin: Camp shows Signed Camp Waivers and Orders shows One-off payments
- [x] Pull commit da42ad7 and verify locally that all eight new nullable afterschoolRegistrations columns exist and the Stripe webhook route responds
- [ ] After publishing commit da42ad7, verify the eight new afterschoolRegistrations columns exist on the live DB
- [x] Pull commit b301c39 and validate the admin Ctrl-K command search locally: search endpoint returns student and lead results with correct destinations; Ctrl-K and Enter handlers are wired
- [ ] After publishing commit b301c39, verify live Ctrl-K student/lead search results and Enter navigation
- [x] Pull commit 2ab549a and verify locally that Flyer Studio is under Tools and My Tasks is under collapsed Owner tools
- [ ] After publishing commit 2ab549a, verify the live admin navigation grouping and labels
- [ ] Pull commit f9bc715, configure OPENAI_API_KEY securely, and validate additive migrations plus requested dashboard behavior locally
- [ ] After publishing commit f9bc715, verify live DB objects, dashboard navigation, AI assistant tools and approval flow, call disposition, and a public parent-facing flow
