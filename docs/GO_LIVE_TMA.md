# TMA billing go-live — scope + checklist

Goal: get the TMA instance live and cleanly charging real tuition for real members.
Productize (multi-tenant SaaS) only after ~1 month of TMA using it for real.

Status legend: ✅ done this cycle · 🔨 code still to add · 🧑 owner/ops step (only Arfa can do)

---

## 1. Done this cycle (reviewed by Opus + Sonnet + GPT-5.6)
- ✅ Split flags: `CARD_COLLECTION_ENABLED` (save cards) is independent of
  `MEMBERSHIP_AUTOCHARGE_ENFORCE` (actually charge). Both default OFF.
- ✅ Charge job double-charge safety: attempt-scoped idempotency key + reconcile any
  prior PaymentIntent before re-charging; a network/API error is treated as UNKNOWN
  (replays, never re-charges), only a true card decline advances a retry.
- ✅ Dunning: a decline → `past_due` + bounded retries + staff Telegram alert; shows
  on the dashboard billing badge and the assistant's past-due list.
- ✅ 3DS `requires_action`: flagged for manual follow-up instead of looping.
- ✅ Cancellation honored (never bill past the 60-day date) + paid-through skip.
- ✅ ET business dates for "due today" (was UTC); statement descriptor + receipt email.
- ✅ Import safety: two-step dry-run preview, name+contact dedup (no silent drops),
  $25 tuition floor, per-student start + paid-through anchoring, import audit batches.
- ✅ Legacy import: payment history (idempotent, sets paid-through), belt baseline,
  existing signed waivers (original date + document link).
- ✅ Term-renewal: daily top-up keeps ≥3 (fills to 12) future charges so billing never
  silently stops at month 13. Runs even while charging is off.
- ✅ Afterschool double-bill guard: the ledger sweeper skips subscription-billed
  memberships; promoting an afterschool signup carries its Stripe subscription id.
- ✅ Student profile photos (camera on phone/iPad), stripped from the public kiosk read.
- ✅ One-click billing-cron registration control (Owner tools → Automation).

## 2. Code still to add before charging real cards
- 🔨 **Refund / dispute webhook.** No handler for `charge.refunded` / `charge.dispute.*`,
  so a refund done in the Stripe dashboard creates ledger drift (charge still shows
  paid). Add a webhook handler that reverses the ledger entry.
- 🔨 **Daily Stripe ↔ ledger reconciliation.** Nothing compares Stripe's actual
  charges/refunds/disputes against `membershipCharges`/`membershipPayments`. Needed
  before this runs unattended for a full billing cycle (not week one). A daily job
  that flags any mismatch to Telegram.
- 🔨 **Family / payer bulk linking.** Imported siblings land unlinked; linking is
  one-at-a-time today, so a full roster is a lot of manual clicks and a real risk of
  siblings ending up on two cards. Add a "group by parent email/phone → one payer"
  bulk action in the import flow.
- 🔨 **Proration honesty.** `changeMembership({prorate:true})` only writes a note; it
  does NOT prorate in Stripe. Either implement real proration or relabel the UI so
  staff know it's a manual step.

## 3. Owner / ops steps (only Arfa can do)
Order matters. Do NOT flip charging until every card is collected + tested.
1. 🧑 **Redeploy via Manus** and confirm the migration log shows the new columns/tables
   applied on the live TiDB (a migration file is not proof it ran). Look for:
   `students.photoUrl`, `memberships.paidThroughDate`, `membershipCharges.paidAt /
   stripePaymentIntentId / attemptCount`, `membershipPayments`, `importBatches`.
2. 🧑 **Back up the TiDB database** before importing the real roster.
3. 🧑 **Set `ADMIN_AUTH_ENFORCE=true`** and a real **`ADMIN_PASSWORD`** in the Manus env.
   (Right now the admin gate is a kill-switch defaulting off, with a hardcoded fallback
   password — until this is set, the import/charge endpoints are effectively open.)
4. 🧑 **Register the daily cron** — Owner tools → Automation → "Register daily cron".
5. 🧑 **Import the roster** (Members → Bulk add → Preview → Confirm), then import legacy
   **payment history** (Members → Import payments) so paid-through dates are set.
6. 🧑 **Turn on card collection** (`CARD_COLLECTION_ENABLED=true`) and collect a card
   from every family. Verify a couple on a **Stripe test clock**.
7. 🧑 **Flip `MEMBERSHIP_AUTOCHARGE_ENFORCE=true`** — real charging begins on the next
   daily run.

## 4. Optional / later (not blocking)
- Customer-facing dunning (email/text the family when their card fails; today only
  staff get the alert).
- Data with no schema home: contract signed date, autopay status, account credit /
  balance — decide whether to fold into `contractNote` or add columns, based on what
  the ZenPlanner export actually contains.
- In-app refunds (today refunds are Stripe-dashboard only; fine for launch).

## 5. Record of fixes
Every fix this cycle is a commit with the defect + reasoning in the body:
`0fc797c` billing hardening · `eab031f` import safety · `ef0b08d` money-path review 1 ·
`dae99b7` photos + cron · `dd1c62e` review pass 2 · `e63065b` term-renewal.
