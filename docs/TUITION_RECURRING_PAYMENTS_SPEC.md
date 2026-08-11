# Recurring Tuition / Membership Payments — Implementation Spec

Status: DRAFT for build. Owner: Arfa. Priority: **Afterschool tuition first (today)**, memberships second.
Stripe account: TMA's own (`TMA_STRIPE_SECRET_KEY` / `VITE_TMA_STRIPE_PUBLISHABLE_KEY`). Not ARFA/Novis.

**Decisions locked 2026-08-11:** billing day = anniversary of start date, but admin MUST be able to change the bill date and prorate (see §14 parity). First-month 50% off is the **standing offer** (matches the ad) until Arfa says stop. Today ships **new enrollments only**; existing ZenPlanner families are not migrated today. The full ZenPlanner-parity billing model (§14) is a **later phase, after the TMA admin dashboard reorg is finalized**.

## 1. Goal

Replace ZenPlanner's recurring billing with Stripe Subscriptions so monthly tuition is charged automatically, card on file, no staff re-keying. Two rollouts sharing one billing engine:

1. **Afterschool tuition** (today): $500/mo (4-5 day) or $400/mo (2-3 day), billed monthly. First month can be 50% off (the current special / early-bird).
2. **Membership tuition** (next): standard TKD / Kickboxing / BJJ memberships. Same engine, different Products/Prices. Out of scope for today except where the data model must not box it out.

## 2. Current state (what already exists, do not rebuild)

- `AfterschoolRegister.tsx` collects intake + signed waiver, then charges a **one-time** PaymentIntent (registration $99, uniform $50, supply $65, + a discounted first-month line when `earlyBird`). It literally tells the parent "monthly tuition is billed separately after enrollment."
- Server: `afterschool.submitIntake` (routers.ts ~2342) signs + stores waiver, then `stripe.paymentIntents.create({ payment_method_types: ["card"] })`. `afterschool.confirm` retrieves the PI and calls `insertAfterschoolRegistration(...)`.
- Stripe init: `getStripe()` = `new Stripe(ENV.tmaStripeSecretKey)`. Card-only is a deliberate choice (kills Klarna/Affirm/Amazon Pay); keep it.
- DB: `afterschoolRegistrations` table, `insertAfterschoolRegistration` in db.ts. Admin reads it in `EnrolledFamiliesView` / `AfterschoolRosterView`.
- **There is NO Stripe webhook handler yet.** Everything relies on the client calling `confirm`. That is fine for one-time but NOT acceptable as the source of truth for recurring (invoices fire server-side with no browser open).

## 3. Billing model decision

**Use Stripe Subscriptions. One subscription per enrolled child (per family if we later bundle siblings).**

First-invoice composition — the clean pattern that keeps one-time fees and recurring tuition in one Stripe object:

- Create a `Customer` (card saved as `default_payment_method` via a SetupIntent in the same Elements session).
- Create a `Subscription` with:
  - `items: [{ price: MONTHLY_PRICE[plan] }]` (the recurring tuition).
  - `add_invoice_items`: the one-time fees (registration/uniform/supply) as one-off line items on the **first** invoice only.
  - First-month discount: represent the discounted first month as an explicit `add_invoice_item` at the reduced amount AND set `billing_cycle_anchor` to the first full billing date, so the subscription's own recurring charges begin next cycle at full price. This avoids a `duration: once` coupon accidentally discounting the one-time fees too.
  - `payment_behavior: "default_incomplete"` + expand `latest_invoice.payment_intent` so the client confirms the first invoice's PaymentIntent in Elements (same UX as today).
  - `payment_settings.payment_method_types: ["card"]` (preserve card-only).
  - `metadata`: `{ product: "afterschool_tuition", plan, studentName, parentEmail, waiverId }`.
- If `startDate` is in the future, set `billing_cycle_anchor` to that date (or the 1st after it — see Open Questions) and `proration_behavior: "none"`.

Result: first charge today = one-time fees + discounted first month. Every month after = tuition only, automatically, card on file.

> Lower-risk alternative if we do NOT want to touch the working one-time path today: keep the existing one-time PaymentIntent exactly as is, and additionally create a `Subscription` with `billing_cycle_anchor` = next month and the saved card, so month 2 onward is automatic and month 1 stays the current flow. Slightly less elegant (two Stripe objects) but zero regression risk to the signed-and-paid enrollment path. **Recommend this for the today cut**; migrate to the unified first-invoice model in a follow-up.

## 4. Stripe objects to create (one-time setup, test + live)

- **Products**: `Afterschool Care` (later: `TKD Membership`, `Kickboxing Membership`, `BJJ Membership`).
- **Prices** (recurring, monthly, USD):
  - `afterschool_4_5_day` = $500/mo
  - `afterschool_2_3_day` = $400/mo
  - Store the resulting `price_...` ids in env (`STRIPE_PRICE_AFTERSCHOOL_4_5`, `STRIPE_PRICE_AFTERSCHOOL_2_3`) so code never hardcodes a price id.
- **Coupon** (optional path): `FIRST_MONTH_50` = 50% off, `duration: once`. Only use if we choose coupon-based discount instead of the discounted invoice-item approach. Prefer the invoice-item approach; keep the coupon as a fallback.
- **Statement descriptor**: set to a TMA value ("TMA SUWANEE" or similar, <=22 chars) so parents recognize the charge. Confirm exact string with Arfa.

## 5. Data model (migration, additive + idempotent — rule D8)

Add to `afterschoolRegistrations` via `server/migrate.ts` (`ADD COLUMN IF NOT EXISTS`, backfill nullable):

- `stripe_customer_id` varchar null
- `stripe_subscription_id` varchar null
- `subscription_status` varchar null  (`active` | `past_due` | `canceled` | `incomplete` | `trialing` | `paused`)
- `monthly_amount_cents` int null
- `current_period_end` datetime null
- `billing_anchor` date null
- `last_payment_status` varchar null
- `canceled_at` datetime null

Do NOT claim these exist until verified against the live DB after deploy (rule D2). The migration file being in the repo is not proof it ran.

## 6. Server endpoints

- Extend `afterschool.submitIntake` (or add `afterschool.startTuition`) to create the Customer + Subscription per §3 and return the first invoice's `client_secret` for Elements.
- **NEW: `POST /api/stripe/webhook`** — the real source of truth. Verify signature with `stripe.webhooks.constructEvent(rawBody, sig, ENV.tmaStripeWebhookSecret)`. Must read the **raw** body (add an express raw-body route BEFORE json middleware for this path). Handle:
  - `invoice.paid` → set `subscription_status=active`, update `current_period_end`, `last_payment_status=paid`. Idempotent on `invoice.id`.
  - `invoice.payment_failed` → set `subscription_status=past_due`, Telegram alert to staff with parent name + amount + hosted invoice URL.
  - `customer.subscription.updated` → sync status + period end.
  - `customer.subscription.deleted` → `subscription_status=canceled`, `canceled_at=now`, Telegram alert.
  - Unknown events → 200 and ignore.
- Idempotency: store processed `event.id`s (small table or a processed-events set) and no-op on replay. Never ack 200 on a path that did not actually apply its effect (rule D7).
- Use Stripe idempotency keys on subscription/customer create so a client retry cannot double-subscribe.

## 7. Client flow changes (`AfterschoolRegister.tsx`)

- Payment step copy: replace "monthly tuition is billed separately" with the real recurring terms: "Your card will be charged **$X/month** starting **<billing date>**. Cancel anytime." (Legal clarity = fewer disputes.)
- The Payment Element already collects the card; with `default_incomplete` we confirm `latest_invoice.payment_intent` instead of a standalone PI. Card is saved for the recurring charges automatically.
- Show a clear first-charge breakdown (one-time fees + discounted first month) vs the recurring amount.
- Keep card-only. Keep the "sign waiver before pay" ordering (legal record survives checkout drop-off).

## 8. Admin surface

- `EnrolledFamiliesView` / afterschool roster: add a **Tuition** column → status pill (Active / Past due / Canceled), monthly amount, next bill date.
- Past-due families surface on the Today view (new "Billing needs attention" tile) so the front desk actually calls them. Reuse the expandable docked-panel row pattern per the dashboard feedback rule.
- Actions (can be phase 2): open Stripe-hosted invoice, cancel subscription, pause. For today, read-only status + the failed-payment Telegram alert is enough to operate.

## 9. Edge cases

- **Future start date** → `billing_cycle_anchor` to that date (or 1st of month); `proration_behavior: none`.
- **Failed first payment** → subscription stays `incomplete`; the signed waiver already exists; staff follows up. Do not mark enrolled until first invoice paid.
- **Dunning** → rely on Stripe Smart Retries + our `past_due` Telegram alert. No custom retry loop.
- **Plan change** (2-3 ↔ 4-5 day) → update subscription item price, `proration_behavior` per Open Questions.
- **Multiple kids** → today: one subscription per child. Sibling discount handling is an Open Question (do not hardcode a guess).
- **Cancellation** → `cancel_at_period_end` by default so they keep the paid month.

## 10. Compliance / security (map to locked rules)

- Card data never touches our server (Stripe Elements). PCI SAQ-A posture preserved.
- Webhook signature verification is mandatory; reject unsigned/invalid (rule: get real status from origin, D3; verify field names against a real captured Stripe payload, D4/D5 — keep one real `invoice.paid` and one `invoice.payment_failed` payload in the repo as regression probes).
- New secret `TMA_STRIPE_WEBHOOK_SECRET` is **deploy-time config, not code** — after adding it, redeploy or the handler reads an empty secret and every webhook 400s (rule D6). Register the webhook endpoint in the Stripe Dashboard and point it at `https://tmatkd.com/api/stripe/webhook`.
- Idempotency on both create (idempotency keys) and consume (processed event ids), rule D8/D7.
- No PHI here; standard PII handling. No card numbers, no CVV, ever stored or logged.

## 11. Test plan

- Stripe **test mode** with a **Test Clock**: create a subscription, advance the clock a month, assert `invoice.paid` fires and our DB flips to active + new period end.
- Force `invoice.payment_failed` with test card `4000 0000 0000 0341` (attaches, then fails on charge) → assert `past_due` + Telegram alert.
- Replay the same webhook event id → assert no double-processing.
- Verify card-only (no Klarna/Affirm) still holds on the subscription's first invoice.

## 12. Today MVP cut (ship-today scope)

1. Migration columns (§5).
2. Stripe Products/Prices for the two afterschool plans; price ids in env.
3. Subscription creation at enrollment using the **lower-risk alternative** in §3 (leave the working one-time PI alone; add a subscription anchored to the **start-date anniversary** with the saved card). Apply the **standing 50%-off-first-month** as a discounted first-month invoice item (§3), not tied to the expired early-bird date.
4. `/api/stripe/webhook` handling `invoice.paid` / `invoice.payment_failed` / `subscription.deleted` + Telegram alert.
5. Admin tuition status column (read-only) + past-due tile.
6. **Two admin actions even in the MVP** (Arfa asked for these explicitly): change a member's next bill date (`billing_cycle_anchor` update) and issue a one-off proration adjustment. Backend endpoints today; polished UI can follow, but the capability must exist so the front desk can honor "move my payment to Friday" without touching Stripe directly.

Scope guard: **new enrollments only.** Existing ZenPlanner families are untouched today.

Defer to follow-up: unified first-invoice model, self-serve cancel/pause in admin, membership Products, sibling pricing, automated late fees, and the full §14 parity model.

## 13. Decisions + remaining questions

**Resolved 2026-08-11:**
1. Billing day = **anniversary of start date**, with admin able to change the date and prorate (built into MVP §12.6, full model §14).
2. First-month discount = **standing 50% off first month** (not the expired early-bird), active until Arfa says stop.
5. **New enrollments only** today; ZenPlanner families are not migrated.

**Still open (defaults chosen, confirm or override):**
3. **Proration on plan change**: default no-proration, change takes effect next cycle. (Ad-hoc proration is still available as an admin action per §12.6 / §14.)
4. **Siblings / multiple kids**: flat per-child today; family billing + sibling discounts designed in §14, built later.
6. **Statement descriptor** exact string (<=22 chars). Default: "TMA SUWANEE".
7. **Late pickup fee** ($5/5min after 6:30, $25/wk): manual for now; automate as one-off invoice items later.

---

## 14. Full membership billing model — ZenPlanner parity, neater (Phase 2+)

Gate: build this **after the TMA admin dashboard reorg is finalized.** Goal: match every administrative capability ZenPlanner has, with a cleaner model, so TMA can drop ZenPlanner entirely (afterschool AND regular memberships). The MVP schema in §5 is intentionally forward-compatible with this.

### 14.1 The core model (four distinct objects — do not collapse them)

ZenPlanner's real power comes from separating four things. We mirror that:

```
MEMBERSHIP OPTION (template)  ->  INDIVIDUAL MEMBERSHIP  ->  BILLS  ->  PAYMENTS
```

- **Membership Option / template** = the reusable product + rule set (name, price, duration, billing structure, renewal behavior, attendance limit, eligible programs, contract, cancellation rules, discounts, whether members can self-purchase). Maps to a Stripe **Product + Price** PLUS our own `membership_option` row holding the non-financial rules Stripe can't model (eligible programs, attendance limits, contract, notice period, ETF).
- **Individual Membership** = one member's instance, inheriting the template but individually editable (grandfathered price, negotiated rate, custom start/end, hold periods, scheduled drop, program eligibility). Maps to a Stripe **Subscription** + our `membership` row with per-member overrides. **Editing a member must NOT edit the template**, and vice versa. This template-vs-instance split is the single most important concept.
- **Bills** = "owes $X on date Y." Maps to Stripe **Invoices**. A bill can exist unpaid (a balance) independent of whether a payment succeeded.
- **Payments** = "$X actually collected." Maps to Stripe **PaymentIntents / Charges**. Autopay is the link between a Bill and a Payment; it is NOT the membership itself.

The crucial implication: a membership is a **financial agreement + an access-control object at the same time**. Stripe covers the money half; our domain tables cover access/eligibility/attendance. Never model a member as just "Student -> credit card subscription."

### 14.2 Capability map (ZenPlanner feature -> our implementation)

| ZenPlanner capability | Our implementation |
|---|---|
| Create membership options (monthly, paid-in-full annual, trial, class pack, drop-in, unlimited) | `membership_option` rows + Stripe Prices (recurring, one-time, or metered). Class packs / punch cards = our attendance-credit counter, not a Stripe recurring price. |
| Sell/assign a membership (start date, duration, eligible programs, schedule, payment method, autopay, contract) | Create Stripe Customer (family payer) + Subscription + `membership` row; capture signed contract (reuse the existing waiver/e-sign flow). |
| Edit an individual membership (price, duration) without changing the template | Per-member override columns on `membership`; update the Subscription item price for that member only. |
| Change bill date / batch update bill dates | Update Subscription `billing_cycle_anchor` (with `proration_behavior` chosen); batch endpoint for many members. |
| Proration when aligning to a cycle | Stripe proration on anchor change / mid-cycle start; store the prorated first bill explicitly so staff can see it. Support prorating to an arbitrary date, not only the 1st (ZenPlanner's known weak spot — we do it better). |
| Bills vs payments (unpaid balance can exist) | Invoices with `collection_method`; `send_invoice` = bill exists without auto-charge; `charge_automatically` = autopay. Track balance from open invoices. |
| Autopay on/off, separate from cancellation | Toggle the Subscription's default payment method / collection method. Autopay OFF != canceled: membership stays active, member pays each bill manually. |
| Payment methods: card + ACH/eCheck | Stripe supports both; ACH via `us_bank_account`. Keep card-only for afterschool today; enable ACH for memberships if Arfa wants lower fees. |
| Automated billing cycle (notice -> attempt -> receipt) | Stripe handles the cycle; our webhook posts status + sends receipts/reminders. |
| Failed payments as an exceptions worklist ("these 14 need attention") | `past_due` list on the admin dashboard; Stripe Smart Retries + our alerts. Work exceptions, not all accounts. |
| Edit individual installments (e.g. first installment $99 not $199) | One-off invoice item / credit on the next invoice; keeps the recurring price intact. |
| Duration vs auto-renewal | `membership.term_end` + `auto_renew` flag; Subscription `cancel_at` for fixed terms, or evergreen for auto-renew. |
| Manual Renew / Upgrade | Renew = new term on same option; Upgrade = swap Subscription price (2x -> 3x/week, or Unlimited) preserving history, proration per policy. |
| Hold (vacation/injury), date-bounded, no overlaps | Stripe Subscription `pause_collection` + our `hold` rows with start/end and overlap validation. Hold != cancel. |
| Drop/cancel, immediate or scheduled future date, notice period + ETF + balance prompt | `cancel_at_period_end` or `cancel_at=<date>`; enforce notice period / early-termination fee / outstanding balance from the option's rules before confirming. |
| Drop vs Delete | **Drop** ends a membership and KEEPS history (default). **Delete** removes a record that should not have existed (rare, admin-only, audited). Never delete for a normal cancellation — it destroys accounting/reporting context. |
| Eligible programs / access control | Our `membership_option.eligible_programs` + per-member overrides; gates class check-in. Stripe knows nothing about this. |
| Attendance limits / punch cards vs class capacity | `membership.attendance_limit` / remaining credits, distinct from a class's reservation capacity and from max-enrollments-per-option. Three different numbers, kept separate. |
| Discounts (family, military, staff, founder, promo) | Stripe Coupons for simple %/$ off; for messy cases, override the member price directly. The standing afterschool 50%-off-first-month is one such discount. |
| Family billing (one payer, many kids) | One Stripe Customer per **family/payer**, one Subscription per child, navigable family relationships in our `family` model. Access identity (the child) is separate from the financial relationship (the payer). |
| Member self-service (purchase, sign, pay bill, manage card, cancel within policy) | Member portal using Stripe Billing customer portal + our policy gate; reduces front-desk load. Later. |
| Contracts | Reuse the signed-waiver/e-sign infrastructure already built; attach the signed PDF to the membership. |
| Account balances / credits / ledger | Track open invoices, payments, credits, and account balance (Stripe customer balance) as a ledger — status is not merely paid/unpaid. |
| Financial reporting (expected vs collected, who owes, active memberships, failed payments, membership vs retail revenue) | Report off the invoice/payment ledger. This is another reason deletes are forbidden: reporting depends on the history. |

### 14.3 Edge-case workflows to support (the "what the front desk actually says")

Design these as first-class admin actions, each an audited event:
- "Move my payment to Friday" -> change bill date (+ optional proration).
- "Freeze me for two weeks" -> date-bounded hold, no overlap, auto-resume.
- "Add my second child" -> new membership under the same family payer.
- "Change me from 2x to 3x per week" -> upgrade (swap price, proration per policy, history preserved).
- "I need to pay half today" -> edit this installment / partial payment, balance carries.
- "Don't charge this card" -> autopay off, membership stays active, bill still generated.
- "Cancel me, last day Sept 10" -> scheduled drop with notice-period / ETF / balance checks.

### 14.4 Data model additions for Phase 2 (sketch, additive)

`membership_option` (template), `family` (payer + children), `membership` (instance + overrides + status), `membership_hold` (date-bounded), `bill`/`invoice_mirror` and `payment_mirror` (or read straight from Stripe with a thin local cache for reporting), `entitlement`/attendance-credit tracking, and an `audit_log` of every admin billing action. All additive and idempotent (rule D8); verify live before claiming any column exists (rule D2).

### 14.5 Why "neater than ZenPlanner"

- One coherent object graph instead of ZenPlanner's fragmented UI; every admin action is an audited event, not a silent edit.
- Proration to any date, not just the 1st (fixes ZenPlanner's reported limitation).
- Exceptions-first dashboard (past-due, failed cards, expiring holds) surfaced on the Today view, so staff work a short list instead of scanning everyone.
- Stripe as the money engine (PCI-light, Smart Retries, hosted invoices) with our domain layer owning access/attendance/contracts, so billing and access never drift apart.

---

*Next: on Arfa's go, implement §12 in a branch, verify with a Stripe test clock, then Manus-deploy. §14 parity is a later phase gated on the admin dashboard reorg. Membership tuition reuses §3-§10 + §14 with new Products/Prices.*
