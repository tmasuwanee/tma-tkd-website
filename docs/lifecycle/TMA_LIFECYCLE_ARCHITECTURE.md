# TMA Lead Lifecycle Architecture (v1)

**Created:** 2026-05-20
**Author:** Claude
**Status:** Plan — must be reviewed before code merges to prod
**Cross-refs:** `project_backend_hardening_checklist.md`, `project_n8n_production_patterns.md` (Rules 36, 37, 38)

---

## The Goal (in plain English)

Every person who ever touches TMA — through any channel (FB ad, web form, walk-in, referral, Google) — enters a lifecycle. The lifecycle has stages. Each stage has rules about what automations they can receive. When something changes about them (they book, they enroll, they opt out, they no-show, they go quiet), they move to a different stage, and the automations they're in must change accordingly. Staff can override every decision from one admin page. Every change is logged.

**The four invariants:**

1. **No lead receives a sequence not intended for their segment.** (Tagging bug → fixed by intake router.)
2. **No lead receives a touch after they've changed stage in a way that should stop it.** (Enrolled, opted out, marked spam → all queued touches auto-cancel.)
3. **Staff edits to email templates take effect on the next send.** (No n8n republish needed.)
4. **Every state change is observable.** (Lifecycle audit log; admin can see exactly why a lead is or isn't getting an email.)

---

## The Four Subsystems

### Subsystem A — Segmentation (intake router)

**Problem solved:** Summer camp leads got free-class emails.

**Where it lives:** First node in Lead Intake v2 (n8n).

**How it works:**
- Read `tags`, `utmSource`, `programInterest`, `trialClassDate` from the inbound payload
- Match against `sequenceTriggerRules` table (DB) — rows like `{condition: "tag contains 'summer_camp'", sequenceKey: "summer_camp_nurture", priority: 100}`
- First match wins (priority-ordered)
- Default fallback: `unsegmented` sequence (which alerts staff "this lead didn't match any rule, please assign manually") — never silently uses a generic nurture

**Guardrails:**
- Rules are data, not code. Editable from admin UI.
- Every routing decision is logged to `leadLifecycleEvents` with the matched rule ID.
- If zero rules match → lead gets `unsegmented` tag, staff alert fires, NO automated sequence schedules.

---

### Subsystem B — Sequence Templates (editable from admin UI)

**Problem solved:** Email content is hardcoded in n8n; editing requires re-publishing the workflow.

**Where it lives:** `sequenceTemplates` table, `/admin/sequences` page, `sequence.dispatch` reads from DB at send time.

**Schema:**
```
sequenceTemplates
├── id
├── sequenceKey       (e.g., "summer_camp_nurture")
├── touchKey          (e.g., "day_0_overview")
├── orderIndex        (display + send order within sequence)
├── delayHours        (hours after enrollment in sequence)
├── subject           (Handlebars-style: "{{firstName}}, your summer camp spot")
├── bodyHtml          (full branded HTML with merge fields)
├── isActive          (boolean; deactivated = skip + log)
├── createdAt, updatedAt, updatedBy
```

**Admin UI flow:**
1. `/admin/sequences` → list of sequences as cards (Summer Camp, Afterschool, TKD Trial, Kickboxing, BJJ, etc.)
2. Click sequence → ordered list of touches with delay + subject + active toggle
3. Click touch → split view: HTML preview (live render with sample merge data) on the right, form (subject, delay, body) on the left
4. Save → tRPC `sequence.updateTemplate` mutation → DB update → audit log entry → success toast
5. Next dispatch cycle (≤5 min) picks up the new content

**Guardrails:**
- Every edit is versioned (separate `sequenceTemplateHistory` table). Roll back from UI.
- Required merge fields validated on save (e.g., `{{firstName}}` must resolve from `leads` table). If a template references a field that doesn't exist, save is rejected with a clear error.
- Test-send button on every touch: sends to `arfa.consults+test@gmail.com` with sample data.
- An `isActive=false` template causes the dispatcher to log "skipped — template inactive" and continue. The sequence does NOT halt.

---

### Subsystem C — Lifecycle State Machine (stage transitions)

**Problem solved:** Enrolled students still get nurture emails. Opted-out leads still get retargeted.

**Stages (canonical):**
```
new → contacted → trial_scheduled → trial_completed → enrolled
                ↓                ↓                  ↓
              cold ←── no_show ──┘                  active_student
                ↓                                   ↓
              opted_out ←── (any stage)             paused / withdrawn
                ↓
              spam (hard-stop, never send anything)
```

**Transition triggers:**
- **`new` → `contacted`:** staff logs a call/SMS, or first auto-email goes out
- **`contacted` → `trial_scheduled`:** `trialClassDate` set
- **`trial_scheduled` → `trial_completed`:** trial date passed AND lead is marked "attended" by staff (default = no_show after 24h)
- **`trial_scheduled` → `no_show`:** trial date + 24h passed, no attendance flag
- **`no_show` → `cold`:** No-show recovery sequence completes without booking
- **`*` → `enrolled`:** Enrollment auto-reconciler matches lead to student record (or staff manual override)
- **`*` → `opted_out`:** Lead clicks unsubscribe, replies STOP, or staff flags
- **`*` → `spam`:** Resend bounce, complaint, or manual staff flag

**Side effects of each transition (THIS is what was missing):**

| New Stage | What Happens to Queued Touches |
|---|---|
| `enrolled` | All `scheduled` touches → `cancelled` (reason: `enrollment`) |
| `opted_out` | All `scheduled` touches → `cancelled`. Block future enqueue. |
| `spam` | All `scheduled` touches → `cancelled`. Block future enqueue. Block ALL outbound. |
| `no_show` | Cancel trial-specific touches; enqueue no-show-recovery sequence |
| `trial_completed` | Cancel trial-reminder touches; consider enrollment-nudge sequence |

**Where this lives:**
- Backend: `leads.setStage` mutation runs the transition (validates legality, applies side effects, writes audit log)
- DB: `leadLifecycleEvents` table — append-only — records every transition with timestamp, from, to, triggeredBy (user/system), reason
- n8n: All workflows that change lead state call `leads.setStage` (not direct UPDATE)

**Guardrails:**
- Illegal transitions rejected at the API layer (e.g., `spam → new` not allowed without explicit override)
- The dispatcher checks lead's current stage BEFORE every send: if `stage IN (opted_out, spam)` → skip + log
- Every transition writes to `leadLifecycleEvents` so admin can see the full history

---

### Subsystem D — Admin Inspectability

**Problem solved:** "Why isn't this lead getting emails?" / "What did we send them and when?"

**`/admin/leads/:id` page additions:**

1. **Stage Card:** current stage, stage history timeline, manual override dropdown
2. **Sequence Queue Panel:** every queued/sent/skipped touch for this lead, with reason for skipped ones ("template inactive", "lead opted out", "duplicate within window")
3. **Activity Log:** every email/SMS/call/note for this lead in time order
4. **Manual Actions:** Send single email (from templates), Add tag, Move to sequence, Pause automation, Resume automation

**`/admin/sequences` page:**
- List of sequences
- Each sequence: list of touches with edit/preview/test-send
- Activity feed: "last 50 sends across all sequences"

**`/admin/intake-rules` page:**
- List of routing rules (tag pattern → sequenceKey)
- Reorder by priority
- Test rule with sample payload

---

## Error & Debug Logging Strategy

**Every state change writes to one of:**
- `leadLifecycleEvents` (stage transitions)
- `leadActivities` (touchpoint sends, manual notes)
- `sequenceTemplateHistory` (template edits)
- `systemAuditLog` (failed operations, security events, deploy markers)

**Every n8n node that mutates state logs:**
```json
{
  "requestId": "uuid",
  "workflow": "lead_intake_v2",
  "node": "intake_router",
  "leadId": 1234,
  "event": "routed_to_sequence",
  "data": { "matchedRule": "rule_id_5", "sequenceKey": "summer_camp_nurture" },
  "timestamp": "2026-05-20T..."
}
```

**Every email send logs:**
- BEFORE send: who, what template, what merge data, what stage they're in
- AFTER send: success or failure, Resend message ID, retry count

**Daily health checks (cron):**
1. Duplicate lead detector (already built)
2. Stuck-in-processing detector: any queue row in `processing` status >10 min → log + reset to `scheduled`
3. Orphan template detector: any `sequenceKey` referenced in queue but not in templates → alert
4. Quota gate (Rule 38): Resend / Twilio / Retell usage % → log + alert at 80/100/150%
5. Stage-vs-queue consistency: any `enrolled` or `opted_out` lead with `scheduled` touches → cancel + alert

---

## Build Phases (revised)

| Phase | What | Status | Who |
|---|---|---|---|
| 1 | Schema: automationPaused + leadSequenceQueue | ✅ done | Claude |
| 2 | DB helpers + tRPC for sequence queue | ✅ done | Claude |
| 3 | n8n Sequence Dispatcher (every 5 min) | ✅ done | Claude |
| 3.5 | **NEW:** Intake router schema + DB + tRPC | 🔨 starting now | Claude |
| 3.6 | **NEW:** Sequence templates schema + DB + tRPC | 🔨 starting now | Claude |
| 3.7 | **NEW:** Lifecycle events schema + DB + transition guards | 🔨 starting now | Claude |
| 4 | Refactor Lead Intake v2 to use intake router + queue model | After 3.7 | Claude |
| 5 | Admin UI: /admin/sequences (template editor with live preview) | After 4 | Manus or Claude |
| 5.5 | Admin UI: /admin/leads/:id additions (queue panel, stage history) | After 5 | Manus or Claude |
| 5.6 | Admin UI: /admin/intake-rules | After 5 | Manus or Claude |
| 6 | SMS layer (blocked on Twilio toll-free verification) | Blocked | External |
| 7 | Reschedule landing page | After SMS | Manus |
| 8 | Daily Staff Action Queue digest email | After 7 | Claude |

---

## What I'm Building Right Now (while you teach)

In order:
1. Add 3 new tables to `tma_schema.ts`: `sequenceTemplates`, `sequenceTriggerRules`, `leadLifecycleEvents`
2. Add DB helpers in `tma_db.ts` for each (CRUD + transition logic)
3. Add tRPC routers in `tma_routers.ts`: `templates.*`, `rules.*`, `lifecycle.*`
4. Seed 10 starter sequence templates (Summer Camp, Afterschool, TKD, Kickboxing, BJJ, etc.) as a `seed.sql`
5. Update `markTouchProcessing` and dispatch logic to check lifecycle stage + template active flag before send
6. Document all changes in `TMA_LIFECYCLE_ARCHITECTURE_v1_HANDOFF.md` for Manus

I will NOT modify any live n8n workflow until you're back to review. The schema + backend goes in first; the n8n refactor is Phase 4 after we both confirm the foundation.

---

## Risks I'm Watching

1. **Migration risk:** New tables on a live DB. Strategy: all 3 new tables are additive — no changes to existing tables. Safe to push without downtime.
2. **Backfill risk:** Existing leads have no stage history. Strategy: backfill script seeds one `leadLifecycleEvents` row per lead with their current stage as the starting point.
3. **n8n drift risk:** If Manus or I modify the dispatcher workflow before Phase 4, the queue model could desync. Strategy: I'll add a `_schemaVersion` check in the dispatcher — if the queue row references a template that doesn't exist, log + skip, never crash.
4. **Template edit during in-flight send:** What if staff edits a template while a dispatcher is mid-send? Strategy: the dispatcher reads the template ONCE per touch at dispatch time, copies subject+body into the queue row before sending. Edit affects future sends, not the in-flight one.
5. **The fried leads:** 25 FB summer camp leads already got the wrong free-class emails. Strategy: one-time apology email written manually + send via Resend dashboard (not automation). Then tag them `do_not_email_60_days` and exclude from all sequences until cooling period passes.
