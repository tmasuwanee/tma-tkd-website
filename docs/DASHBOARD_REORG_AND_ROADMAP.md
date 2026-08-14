# TMA Dashboard Reorg + System Roadmap

Synthesis of a full audit (3 mapping passes) + a 3-model design panel + an adversarial review. Purpose: reorganize the admin, document the systems (SOPs), close process gaps, and set the order for search + AI assistant + recurring tuition.

Companion docs: [FRONT_DESK_SOP.md](./FRONT_DESK_SOP.md), [TUITION_RECURRING_PAYMENTS_SPEC.md](./TUITION_RECURRING_PAYMENTS_SPEC.md).

---

## 1. What we found (current state, audited)

**Dashboard is over-surfaced.** One `leads` table is shown as 5 admin views by `recordType` (Leads, Enrolled Families, Orders, plus Calendar + Today). A person can live in 3 places (Leads, Enrolled Families, Students roster) with no cross-links. Two more separate rosters (Students import, Afterschool Roster). Today / Today's Calls / Trial Check-in / Call Log = 4 views for one daily loop. Afterschool is fragmented across 4 locations. Studio (the only flyer/asset tool, a core job) is buried in collapsed Owner tools. My Tasks (Arfa's personal list) and Voice Test (dev QA) sit in the shared front-desk nav.

**Process gaps that leak money / create liability:**
- **Recurring tuition: 0% built.** $400-500/mo per afterschool family is uncaptured. Only a spec exists.
- **Camp waiver is write-only / invisible.** `campWaivers` is written and never read anywhere. Staff cannot see who signed; only a one-time Telegram tells them.
- **Afterschool enrollment writes 3 unlinked records.** The `waiverId` is generated and even put in Stripe metadata, then dropped by `insertAfterschoolRegistration` (no column). Payment, waiver, roster only correlate by hand.
- **Supply-fee + field-trip payments have no table.** Record exists only in Stripe + Telegram.
- **Paid $99 trial not linked to its lead record.** Two lists to reconcile.

**Security hole:** admin tRPC procedures are `publicProcedure` behind a CLIENT-ONLY password gate (plaintext `Keep9oing!` in the bundle, 5 inconsistent copies). Anyone hitting the endpoint directly can call admin mutations. This is a live vulnerability and it gates the search endpoint and the AI assistant (both widen data exposure).

**Orphaned code:** `sendToSlack`, `sendToGoogleSheets`, and an unsigned-JWT stub are dead (retired 2026-08-05). n8n "Lead Intake v2" is disabled and superseded by v3.

---

## 2. Proposed dashboard IA (when we do the reorg)

Collapse 7 nav groups to 4, mapped to the 3 real jobs + owner-config:

- **Today** — one screen merging Today + Today's Calls + Trial Check-in (call queue, check-ins due, tasks due).
- **Front Desk** — People, Afterschool (its own home), Billing, Flyer Studio (promoted from buried).
- **Records** — Calendar, Waivers, Call History (renamed from Call Log), Playbook, Links.
- **Owner** (soft-hidden) — My Tasks, Sequences, Routing Rules, Ad Performance, Automation, Voice Test (dev).

**People "lives in 3 places" fix.** The leans version (recommended by the adversarial pass): keep the single leads table, add status badges (Prospect / Trial / Enrolled) + filters, and cross-link families <-> students, so search answers "lead or enrolled?" in one place. Skip the heavier full "unified People tabbed surface" refactor unless there is real pull; badges + search is 80% of the value at 20% of the cost.

**Muscle-memory de-risk:** do NOT big-bang 7->4 mid-season. Add search FIRST (once staff can search anything, exact nav matters less), then do nav cleanup incrementally in an off-peak week, keep old labels as redirects, post a one-page cheat sheet.

---

## 3. Gap fixes (additive, low-risk, high correctness value) — DONE 2026-08-11

- [x] `waiverId` column on `afterschoolRegistrations`; `afterschool.confirm` persists it (commit 9bd9a30). Waiver + payment now linked.
- [x] `getCampWaivers` + `camp.listWaivers` + a "Signed Camp Waivers" panel in the Camp tab (commit 2719f1d). Camp waivers no longer invisible.
- [x] `oneOffPayments` table (idempotent, unique on PaymentIntent id); recorded on supplyFee/fieldTrip confirm; listed under Orders (commit 2719f1d).
- [x] Paid `$99 trial` linked to its existing lead via the pre-existing `trialEnrollments.leadId` column; lead advanced to trial_paid (commit 613a833). Safe: existing-lead only, no fabricated leads, no stage regression.

All additive, idempotent migrations (rule D8). Verified by typecheck; migrations apply on the next deploy boot (rule D2: confirm the new column/table exist live after deploy). Follow-up option: auto-create a lead for a direct $99 buyer who had no prior lead (deferred to avoid placeholder-lead data).

---

## 4. Global search (cheap UX win)

Cmd-K / "/" palette. Server-side LIKE across leads / students / afterschool roster, deep-linked to the existing detail dialogs (add `?lead=` / `?student=` / `?roster=` URL state). Keep it simple: no Elasticsearch/embeddings for a small dataset. Adversary's cut: skip the pages/actions command registry (a 3-person team memorizes the nav); "find-a-family/student" is the real value.

---

## 5. AI assistant (defer until after billing)

Design is sound but it is downstream of tuition billing (its headline feature "past-due tuition" needs billing to exist) and needs server-side admin auth first. When built: server endpoint, whitelisted READ tools mapped to existing tRPC, every WRITE is draft -> preview -> confirm -> execute with an audit row + idempotency key + short-lived confirm token. Capabilities: look up a family + payment status, draft receipt / date-range payment-summary emails for tax windows (reuse `invoices.searchPayments` + a distinct "Payment Summary" PDF template, labeled "not a bank statement or tax form"), list missing waivers, list past-due tuition, answer playbook "how do I" questions, schedule follow-ups. Model runs server-side only (never client); raw Stripe keys and card data never reach the model. Refund / subscription-edit tools are owner-confirmed and gated until billing is live.

---

## 6. Two roadmap options (DECISION NEEDED)

The order you named was: reorg -> SOPs -> integrate/gaps -> assistant + search. The adversarial review argues the reverse is better ROI. Both are captured; pick one.

### Option A — Your stated order (reorg-first)
1. Reorganize the dashboard (IA in section 2).
2. Formalize SOPs against the new UI.
3. Integrate existing automations + fix gaps (section 3).
4. AI assistant + search.
5. Recurring tuition.

Pro: matches your mental model; a clean dashboard first. Con: spends the first, biggest effort on the lowest-revenue, highest-disruption item; delays the only money feature; SOPs written twice (UI changes under them); mid-season nav churn for staff.

### Option B — Recommended (money + correctness first, cosmetics last)
0. **Stop the bleeding:** ship the lightweight SOP against the current UI (done: FRONT_DESK_SOP.md) + fix the real data bugs (section 3). Days, cheap, real liability value.
1. **Close the security hole:** one server-side admin gate, convert `publicProcedure` to protected, collapse the 5 client gates into one. ~0.5-2 days. Does NOT block the nav reorg; DOES gate search + assistant.
2. **Recurring tuition billing** (the revenue; the only piece with real financial blast radius). Jumps the queue.
3. **Global search** (cheap win; lowers the stakes of any later nav change).
4. **Nav cleanup**, incremental, off-peak, aliased labels, cheat sheet. Rewrite SOPs against final UI.
5. **AI assistant** only if there is real pull after billing is live and stable.

Pro: captures revenue and fixes correctness/security before cosmetics; less staff disruption; SOPs written once against the final UI. Con: the dashboard stays visually messy longer.

**Recommendation: Option B**, with the note that "afterschool tuition needed today" is best served by B (tuition is Phase 2, right after the quick data+auth fixes) rather than by reorg-first.

> **DECISION (2026-08-11, Arfa): Option B locked.** People consolidation = **lean** (badges + filters + cross-links + search, NOT the full unified tabbed refactor). Building now, in order: Phase 0 data-gap fixes -> auth hole -> recurring tuition -> search -> nav cleanup -> assistant if pull.

### Cuts (either option)
- Full unified-People tabbed refactor -> replaced by badges + filters + search.
- cmd-K pages/actions command registry -> plain find-a-family search.
- Owner-PIN as a security control -> it is theater under a shared login; treat as a soft hide only.
- AI assistant -> deferred, not cut, until billing is live.

---

## 7. Cross-cutting cleanups to fold in
- Delete orphaned `sendToSlack` / `sendToGoogleSheets` / unsigned-JWT stub.
- Archive/delete disabled n8n "Lead Intake v2".
- Reconcile the double Retell path (in-app `voice-routes` `call_analyzed` + n8n "Retell Inbound Handler" `call_ended`) so a lead is not touched twice.
- Confirm which lead-intake staff-alert path is source of truth (app `leads.submit` email vs n8n Lead Intake v3) before tuition events start firing, so nothing double-fires.

---

## SHIPPED 2026-08-14 — Members-centered reorg (Phases A–D)

Rebuilt the dashboard around the person/family, matching the approved Members mock.

- **A. Today quick wins.** Removed the "Call" button from Today's who-to-call rows; the whole row now opens the person's CRM record. "Not interested" kept.
- **C. Members (unified).** New `People > Members` view = one row per person, unioned server-side (`server/members.ts`) from `memberships` + `afterschoolRegistrations` (matched by email, name fallback). Program tabs (All / TKD / KB / BJJ / After-School), stat tiles (Total / Active this month / Billing issues / Waivers missing), search, clickable rows opening the membership command-center popup. Afterschool-only members (no recurring billing) show a **Set up billing** action that promotes them to a real membership. Enrolled Families / Memberships / Students removed from nav, kept routable as aliases.
- **B. Trials.** New `People > Trials` lifecycle screen: free intro classes (CRM leads booked, not yet paid) → active $99 3-week trials (21-day progress bar, days-left, inline editable start date that re-arms the reminder pings, convert/expire/cancel) → past trials by outcome. Rows open the person's record.
- **D. Camps + nav.** Camp Registrations + Day Camp folded into one `Operations > Camps` view (sub-tabs + public signup/print links). Final nav = **People** (Members, Trials, Leads) / **Operations** (Calendar, After-School, Camps) / **Sales** (Pro Shop, Invoices) / **Admin** (Forms & Waivers, Approvals, Playbook, Links) / **Owner tools** (collapsed). All old `/admin/<key>` URLs still resolve.

**Follow-ups (parked, not blocking):** Members popup could grow explicit Overview/Programs/Billing/Forms tabs (today it's the membership detail modal); Pro Shop "specials" objects (promotional product/discount records) not yet built; Telegram deep-links still point at `/admin/students` (a working alias) rather than `/admin/members`.
