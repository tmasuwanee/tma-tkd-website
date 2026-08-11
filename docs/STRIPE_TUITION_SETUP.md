# Stripe Recurring Tuition — Setup + Test Plan

How to turn on recurring afterschool tuition. The code is already shipped but
**config-gated**: until the price-id env vars are set, enrollment behaves exactly
as it does today (one-time fees only, no subscription). Nothing breaks by
deploying before this is done.

Companion: [TUITION_RECURRING_PAYMENTS_SPEC.md](./TUITION_RECURRING_PAYMENTS_SPEC.md).

## How it works (so the config makes sense)

- The existing one-time PaymentIntent (registration + uniform + supply + the
  discounted first month) is unchanged. That is month 1.
- When tuition is configured, enrollment also saves the card to a Stripe Customer
  and creates a monthly **Subscription** whose first charge is **one month after
  the start date** (so month 1 is not double-billed). Month 2+ bills automatically.
- `POST /api/stripe/webhook` is the source of truth for subscription state
  (active / past due / canceled). Staff get a Telegram alert on a failed payment.

## Step 1 — Create the monthly Prices (Stripe Dashboard)

Do this in **Test mode** first (toggle top-right of the Stripe Dashboard).

1. Products -> Add product -> name "Afterschool Care - 4-5 Day". Add a **recurring**
   price: **$500.00 / month**, USD. Save. Copy the price id (`price_...`).
2. Add product "Afterschool Care - 2-3 Day". Recurring price **$400.00 / month**,
   USD. Copy its price id.

(These match `PLANS` in AfterschoolRegister.tsx / the server `MONTHLY_CENTS`.)

## Step 2 — Register the webhook (Stripe Dashboard)

Developers -> Webhooks -> Add endpoint.
- URL: `https://tmatkd.com/api/stripe/webhook`
- Events: `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated`, `customer.subscription.deleted`
- Save, then copy the **Signing secret** (`whsec_...`).

## Step 3 — Set the env vars (project Secrets)

Test-mode values first:
```
STRIPE_PRICE_AFTERSCHOOL_4_5 = price_...   (the $500 test price id)
STRIPE_PRICE_AFTERSCHOOL_2_3 = price_...   (the $400 test price id)
TMA_STRIPE_WEBHOOK_SECRET    = whsec_...   (the test webhook signing secret)
```
The server must already have `TMA_STRIPE_SECRET_KEY` set to the matching mode's
key (test key while testing). **Redeploy after setting these** (deploy-time config
is not code, rule D6: an already-running server reads the old empty values until
it restarts).

## Step 4 — Test with a Stripe Test Clock (before going live)

1. In Stripe (test mode) create a Test Clock.
2. Do a test afterschool enrollment on the site (test card `4242 4242 4242 4242`).
   Confirm: the one-time fees charge as today AND a subscription is created in
   `trialing` (holding until the one-month anchor), with the card saved.
3. Advance the Test Clock one month. Confirm `invoice.paid` fires and the
   afterschool registration row flips `subscriptionStatus = active` with a new
   `currentPeriodEnd`.
4. Force a failure: use test card `4000 0000 0000 0341` (attaches, later fails).
   Confirm `invoice.payment_failed` -> row `past_due` + a Telegram alert with the
   hosted invoice link.
5. Replay the same webhook event (Stripe Dashboard -> resend) and confirm no
   double-processing (the updates are idempotent by subscription id).
6. Verify the first invoice is card-only (no Klarna/Affirm).

**Field-name check (rule D4/D5):** while testing, open a real `invoice.paid`
payload in the Stripe Dashboard and confirm the handler reads the right fields
(`subscription`, `lines.data[0].period.end`, `hosted_invoice_url`). Fix the
handler if Stripe's shape differs from what stripe-webhook.ts assumes.

## Step 5 — Go live

1. Repeat Steps 1-2 in **Live mode** (new live price ids, new live webhook +
   signing secret).
2. Update the three env vars to the **live** values; ensure `TMA_STRIPE_SECRET_KEY`
   is the live key. Redeploy.
3. Do one real enrollment (or a $0.50-ish test if possible) and confirm the
   subscription appears in the live Stripe Dashboard and in the admin.

## Verify the migration applied (rule D2)

After the first deploy of this code, confirm on the live DB that
`afterschoolRegistrations` has the new columns (`stripeSubscriptionId`,
`subscriptionStatus`, `monthlyAmountCents`, `currentPeriodEnd`, `billingAnchor`,
`stripeCustomerId`, `lastPaymentStatus`, `canceledAt`). A migration file in the
repo is not proof it ran.

## Notes / decisions carried from the spec

- First month 50% off is the standing offer (handled in the existing one-time
  charge, not the subscription).
- Billing day = anniversary of start date. Admin change-bill-date / proration and
  cancel/pause are NOT in this first cut (they would sit on the currently-open
  admin API; deferred until auth hardening, or add them behind a confirm).
- Statement descriptor: set a TMA value (e.g. "TMA SUWANEE") on the account or the
  Price so parents recognize the monthly charge.
- Existing ZenPlanner families are NOT migrated; this applies to new enrollments.
