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
- [ ] Set LEAD_NOTIFICATION_EMAIL in Settings → Secrets
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
