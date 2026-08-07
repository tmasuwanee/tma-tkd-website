# TMA System Restructure Plan

Synthesized from three independent model reviews (GPT-5/Codex on architecture, two Opus agents on operator-UX and automation), then tuned to how TMA actually works. 2026-08-05.

## Who uses it
- **Arfa** (owner, technical) — builds, configures, sees everything.
- **Master Jo, Ms Anna, Ms Aniessa** (front desk, non-technical) — need the fewest, clearest screens possible.

## What they actually do (the system should be organized around these)
1. **Manage leads** — who came vs didn't, who to call vs remove from the pipeline.
2. **Sign people up / send invoices** — currently split between ZenPlanner and this app, which is the main source of "disorganized." **ZenPlanner is being discontinued**, so this app becomes the single system of record.
3. Flyers / specials brainstorming — explicitly OUT of scope for this system.

## The one decision that dominates everything: ZenPlanner sunset
ZenPlanner today handles **recurring monthly tuition drafting**. This app currently handles one-time payments (camp, trial, fees, orders) and signups, but **not recurring subscription billing**. When ZenPlanner goes away, someone has to draft monthly tuition.

**This is the biggest planning item and it needs an owner decision before workflow #2 can truly be "neat":**
- **Option A — App owns recurring billing.** Add Stripe **Subscriptions** for monthly tuition. Biggest build, but makes the app the true single system of record (signup → waiver → tuition all in one place). Recommended if ZenPlanner is fully leaving.
- **Option B — A dedicated billing tool** (a gym-billing processor) handles tuition, and the app owns everything else (leads, signups, waivers, one-time payments). Less to build; still two systems, but with a clean line (recurring $ = billing tool, everything else = app).

Until this is decided, "sign people up" can't be fully consolidated because the tuition half has no home.

---

## Phase 0 — Shipped 2026-08-05 (quick cleanup)
- Retired **Slack** (duplicated the staff email for a Telegram-based team) and deleted the **dead Google Sheets export** (unsigned-JWT stub that failed silently on every lead). Staff alert is now just email; Telegram covers real-time.
- Fixed the **stale call-script** on the call board (it pushed "summer camp early-bird" year-round; now an evergreen free-intro-class opener).

## Phase 1 — Organize the front desk (days, low risk, biggest "feels clean" win)
Serves workflow #1 directly.
- **A "Today" home, set as the default screen** (instead of the Leads kanban). One page, three blocks from existing components: **Trials today · Call queue (who to call) · Evening check-in (who showed / no-show)** — plus an overnight strip (new leads + calls the voice agent took). This turns "which of 20 screens?" into "open the app, work Today," and it *is* workflow #1.
- **Role-gate owner tools out of the front-desk view.** Jo/Anna/Aniessa should not see Email Sequences, Routing Rules, Ads, Automation, Studio, or Voice Test. Front desk sees ~5 sections: **Today · Prospects · People · Forms · Money**. Arfa's login sees an extra "Owner" area.
- **One alerting rule to memorize:** Telegram = do it today · Email = the paperwork · Dashboard = where you do the work.

## Phase 2 — Make signup + money trustworthy (serves workflow #2 + ZenPlanner sunset)
- **Every payment writes an order/payment record in our own DB.** Right now field-trip and supply-fee live only in Stripe metadata (invisible, unauditable). Non-negotiable once ZenPlanner is gone.
- **Unify the ~7 one-off checkout pages into one shared checkout flow** + a small product list, and the waiver/transportation/afterschool/camp forms into one signable-form flow. Removes ~500-800 lines of duplicated code and the "confirm fired twice = double charge/alert" class of bug. Keeps each page's own copy/fields.
- **Fix `afterschoolRegistrations` schema drift** (it's raw SQL, not in the ORM).
- **Recurring tuition** per the ZenPlanner decision above (Option A or B).

## Phase 3 — One identity for a person (biggest lift, last)
- A real **guardian (contact) + child (participant)** core so "returning parent, second child" is normal, not an edge case, and every table (waivers, trials, afterschool, camp, roster) links to it. This is what makes the Duplicate Detector and Enrollment Reconciler unnecessary. Phased, dual-write, no data loss.

## Automation cleanup (runs alongside, mostly Arfa-side)
- **One owner per job:** customer email on a timer = n8n; everything else (staff alerts, voice, real-time, dashboard) = the app. Keep n8n but shrink it to that.
- **No-show becomes one coordinated flow** instead of three blind triggers (staff ping + recovery email + robocall).
- Align n8n email sender to `Top Martial Arts <hello@tmatkd.com>`.

## Do NOT touch (already good)
- The recordType model + 9-stage pipeline + record-type filtering.
- Telegram as the real-time alert channel.
- The Afterschool Roster (purpose-built daily tool).
- The Retell inbound (n8n) / outbound (app) split — verified, don't "consolidate."

## Open decisions for Arfa
1. **ZenPlanner replacement for recurring tuition: Option A (app + Stripe subscriptions) or B (dedicated billing tool)?** Gates Phase 2.
2. **Outbound voice calling:** is it actually booking trials, or pause it? (Cost + reputation for one location.)
3. **Front-desk role:** fully hide owner tools, or just move them to a bottom "Owner" drawer?
