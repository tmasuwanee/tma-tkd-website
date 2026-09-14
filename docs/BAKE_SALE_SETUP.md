# Bake Sale QR Payment Page (2026-09-14)

One QR beside the table opens `/bake-sale`. Customer picks items, optionally adds a
fundraiser contribution, pays on Stripe's hosted Checkout page, and lands on a green
confirmation screen you can read from across the table before handing over the items.

## Where to edit products and prices

**`shared/bakeSaleProducts.ts` is the only file to touch.** Change a `unitAmount`
there and both the page and the Stripe charge change together. Set `active: false`
to pull an item. Money is integer cents everywhere (300 = $3.00).

The server never accepts a price from the browser. It looks up every submitted
product id in that file and rebuilds the line items itself, so a customer editing
the page in dev tools changes nothing about what gets charged.

## Files created

| File | What it does |
|---|---|
| `shared/bakeSaleProducts.ts` | Product config plus the server guardrails (max quantity, contribution min/max, order ceiling) |
| `client/src/pages/BakeSale.tsx` | Mobile menu page with the sticky checkout bar |
| `client/src/pages/BakeSaleSuccess.tsx` | Server-verified confirmation screen |
| `client/public/bake-sale-qr.html` | Printable "SCAN TO PAY" card that renders the QR |
| `docs/BAKE_SALE_SETUP.md` | This file |

## Files modified

| File | Change |
|---|---|
| `server/routers.ts` | New `bakeSale` router (`menu`, `createCheckout`, `verifySession`) plus `randomOrderId` and `allowedOrigin` helpers |
| `server/_core/trpc.ts` | Added the three `bakeSale.*` paths to the `PUBLIC_PATHS` allowlist |
| `server/stripe-webhook.ts` | Bake-sale branch inside the existing `checkout.session.completed` case, plus the two async-payment cases. The card-setup branch is untouched |
| `server/db.ts` | `insertBakeSaleOrder`, `getBakeSaleOrders`, `updateBakeSaleOrderStatus` |
| `server/migrate.ts` | `bakeSaleOrders` table, `CREATE TABLE IF NOT EXISTS`, applied on boot |
| `client/src/App.tsx` | Routes for `/bake-sale` and `/bake-sale/success` |

## Environment variables

No new variables. This uses the ones already configured for TMA:

- `TMA_STRIPE_SECRET_KEY` (server, creates and reads Checkout Sessions)
- `TMA_STRIPE_WEBHOOK_SECRET` (server, verifies webhook signatures)
- `VITE_TMA_STRIPE_PUBLISHABLE_KEY` is not used here. Hosted Checkout redirects
  the whole browser to Stripe, so no Stripe key is loaded on the bake-sale page.

The ARFA LLC Stripe keys in `~/Desktop/.env` are not referenced anywhere in this work.

## Stripe Dashboard configuration

The existing webhook endpoint `https://tmatkd.com/api/stripe/webhook` needs three
events added to its subscription list. Everything already subscribed stays:

- `checkout.session.completed` (probably already on, it powers card setup)
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

Nothing else in the Dashboard changes. No Products or Prices to create: line items
are built inline from the config file at session creation.

## Local testing

```bash
npm run check && npm run build && npm run test
```

Start the dev server, then open `http://localhost:3000/bake-sale` in a phone-sized
viewport.

Stripe CLI webhook forwarding:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed
```

Test card `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.

To test idempotency, resend the same event twice:

```bash
stripe events resend <event_id>
```

The second delivery must leave the `bakeSaleOrders` row count unchanged.

## QR code

Open `https://tmatkd.com/bake-sale-qr.html` (or `http://localhost:3000/bake-sale-qr.html`),
then either Print to PDF or use the Download PNG / Download SVG buttons. Error
correction is level H and there is a 4-module white quiet zone, so it survives a
crease and a thumb on one corner. No logo sits over the modules.

To change the destination after a domain change, edit the `DESTINATION` constant
at the bottom of `client/public/bake-sale-qr.html` and print again. The QR points
at the menu page, never at a price or a Checkout Session, so the printed card stays
valid through every price change.

## Security notes

- Prices, names, and totals are recalculated server side from the config file.
- Unknown or inactive product ids are rejected with an error, not skipped.
- Quantity is capped per product (20 default) and at 10 distinct products per order.
- Contribution is bounded at $1 minimum and $500 maximum, and is never preselected.
- Total is capped at $1,000 as a sanity ceiling.
- `success_url` and `cancel_url` are built only from an allowlisted origin, so the
  client cannot turn the Stripe return into an open redirect.
- The success page shows nothing until the server retrieves the session from Stripe
  and confirms `payment_status === "paid"`. The redirect alone never marks an order paid.
- The order row is written by the webhook only.
- No card data touches this site. Stripe hosts the payment page.

## Live-mode launch checklist

1. Confirm the three `checkout.session.*` events are subscribed on the live webhook endpoint.
2. Confirm `TMA_STRIPE_SECRET_KEY` in the Render environment is the live key.
3. Deploy, then confirm the boot log shows `[migrate] ok: bakeSaleOrders table`.
4. Load `https://tmatkd.com/bake-sale` on a real phone, on cellular, not just wifi.
5. Buy one real item with a real card. Confirm the green screen, then confirm the
   charge in the Stripe Dashboard and the Telegram alert.
6. Refund that test purchase to yourself in the Dashboard.
7. Print the QR card and scan it with a different phone before the event.

## Known limitation

The `oneOffPayments` admin dashboard does not list bake-sale orders. They go to their
own `bakeSaleOrders` table and to Stripe. `getBakeSaleOrders()` exists in `server/db.ts`
if you want to surface them in the admin UI later.
