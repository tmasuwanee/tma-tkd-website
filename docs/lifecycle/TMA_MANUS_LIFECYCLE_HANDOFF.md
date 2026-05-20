# TMA Lifecycle Architecture v1 — Manus Handoff

**Date:** 2026-05-20
**Prerequisite:** Commit `88331679` (unique email constraint) must be deployed FIRST. See separate handoff.
**Scope:** This adds the foundation for editable email templates, segment-aware intake routing, and lifecycle state-machine tracking.

---

## What changed and where

| File on Desktop | What I added | Where it goes in your repo |
|---|---|---|
| `tma_schema.ts` | 4 new tables + history table | `drizzle/schema.ts` |
| `tma_db.ts` | ~20 new helper functions | `server/db.ts` |
| `tma_routers.ts` | 4 new tRPC routers (`templates`, `rules`, `lifecycle`, `audit`, `dispatcher.preSendCheck`) | `server/routers.ts` |
| `TMA_LIFECYCLE_SEED.sql` | Seed data: 9 intake rules + 17 template skeletons | Run after `drizzle-kit push` |

Full architecture rationale: `TMA_LIFECYCLE_ARCHITECTURE.md` (also on Desktop).

---

## Deploy steps (in order)

### Step 0 — Prerequisite check

Confirm commit `88331679` (unique email constraint) is already deployed AND the dedup SQL has run. If not, do that first.

### Step 1 — Replace the three source files

Pull from Desktop (or I can push to GitHub when you confirm — let me know which you prefer):
- `tma_schema.ts` → `drizzle/schema.ts`
- `tma_db.ts` → `server/db.ts`
- `tma_routers.ts` → `server/routers.ts`

### Step 2 — Run `drizzle-kit push`

This creates 4 new tables:
- `sequenceTemplates` (editable email content)
- `sequenceTemplateHistory` (audit trail of template edits)
- `sequenceTriggerRules` (intake routing rules)
- `leadLifecycleEvents` (stage transition history)
- `systemAuditLog` (system-wide event log)

All 5 tables are **additive**. No changes to existing tables. Safe to push without downtime.

### Step 3 — Run the seed SQL

```bash
mysql -u <user> -p <db> < TMA_LIFECYCLE_SEED.sql
```

This inserts:
- 9 intake routing rules (priority-ordered)
- 17 sequence template skeletons (placeholder HTML — admin populates via UI later)
- 1 audit log entry marking the seed

### Step 4 — Publish in Manus UI

Click Publish. Then verify the endpoints exist:

```bash
# Should return 200 with at least 9 rules
curl -X POST https://tmatkd.com/api/trpc/rules.list \
  -H "Content-Type: application/json" \
  -d '{"json":{"activeOnly":false}}'

# Should return 200 with at least 17 templates
curl -X POST https://tmatkd.com/api/trpc/templates.list \
  -H "Content-Type: application/json" \
  -d '{}'

# Should return 200 with sequenceKey="summer_camp_nurture"
curl -X POST https://tmatkd.com/api/trpc/rules.route \
  -H "Content-Type: application/json" \
  -d '{"json":{"tags":["facebook_lead","summer_camp_2026"]}}'
```

If all three return 200 with the expected shape → migration successful.

---

## What this does NOT yet do

This deploy only adds the **backend foundation**. The following are next phases (Claude or Manus, your call):

- [ ] **Phase 4:** Refactor Lead Intake v2 to call `rules.route` first, then enqueue touches in `leadSequenceQueue` instead of using inline Wait nodes
- [ ] **Phase 5:** Build `/admin/sequences` UI for editing email templates with live HTML preview
- [ ] **Phase 5.5:** Build `/admin/intake-rules` UI for editing routing rules
- [ ] **Phase 5.6:** Add lifecycle history panel to `/admin/leads/:id`
- [ ] **Populate template HTML:** All 17 templates currently have `<!-- placeholder -->` bodies. Once admin UI is built, Arfa writes the actual content via UI.

The currently-live email-sending workflows still work with their hardcoded n8n content — this deploy does not break them. It just adds the new system alongside.

---

## Why the architecture is shaped this way

1. **Templates live in DB, not n8n.** Lets staff edit subject/body from a UI without n8n republish. Dispatcher reads template at send time.
2. **Intake rules are data, not code.** First-match-wins with explicit priority. The TMA 5/20 incident (summer camp leads got free-class emails) was caused by hardcoded routing — this prevents that class of bug.
3. **Lifecycle events are append-only.** Every stage change writes a row with from/to/triggeredBy/reason/sideEffects. Becomes the forensics trail when something looks weird.
4. **`recordLifecycleTransition` applies side effects automatically.** When a lead → enrolled, all `scheduled` queue rows auto-cancel. No more "I enrolled them but they still got the Day 4 email."
5. **`preSendGuard` is the single chokepoint for blocking sends.** Lead opted out / paused / enrolled / template inactive — all handled in one place that the dispatcher must call.
6. **Audit log catches everything not lead-specific.** Failed dispatcher runs, quota gate trips, deploy markers, illegal-transition attempts.

Built per `project_backend_hardening_checklist.md` Layers 4-6.

---

## Rollback plan

If something breaks, all 5 new tables can be dropped without affecting existing functionality:

```sql
DROP TABLE IF EXISTS sequenceTemplateHistory;
DROP TABLE IF EXISTS sequenceTemplates;
DROP TABLE IF EXISTS sequenceTriggerRules;
DROP TABLE IF EXISTS leadLifecycleEvents;
DROP TABLE IF EXISTS systemAuditLog;
```

Then revert the three source files. Existing leads/queue/activities tables untouched.

---

## Questions to confirm before deploy

1. Should `pipelineStage` in `leads` table get an `opted_out` value added to the enum? Currently `lost` covers it — but explicit is better.
2. Should `dispatcher.preSendCheck` block sends for `automationPaused = true` (currently yes) or only soft-warn? Currently hard-block.
3. The seed file uses placeholder HTML. Want me to inline the real branded HTML from `tma_email_templates.md` so the system can send immediately after deploy, or leave placeholders for admin-UI population?

Default answers if you don't reply: 1) Defer to v2. 2) Hard-block stays. 3) Leave placeholders + admin UI populates.
