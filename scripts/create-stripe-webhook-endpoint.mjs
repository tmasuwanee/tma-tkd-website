/**
 * One-off: create the live TMA webhook endpoint at the NON-REDIRECTING url.
 *
 * Why this exists (findings from 2026-09-14):
 *   - The only endpoint on the live account was https://www.tmatkd.com/... (www).
 *     That url returns a 307 redirect. Stripe does not follow redirects on
 *     webhook deliveries, it counts them as failures, and it had auto-disabled
 *     the endpoint. It was subscribed to one event, payment_intent.succeeded.
 *   - A live probe of the deployed handler returned 500 "webhook not configured",
 *     which is the branch that fires when TMA_STRIPE_WEBHOOK_SECRET is empty.
 *     So Render has no signing secret at all, and there is no existing secret
 *     to preserve.
 *
 * Because there was nothing to preserve, creating a fresh endpoint is the clean
 * path: Stripe returns the signing secret ONLY in the create response, so this
 * is the one moment the secret can be captured without opening the Dashboard.
 *
 * The secret is written to a local file, never printed to the terminal, so it
 * does not end up in a chat transcript or a scrollback buffer. Anyone holding a
 * whsec_ can forge signed events against the url, which means forging paid bake
 * sale orders.
 *
 * The old www endpoint is left alone. Delete it only after a real test purchase
 * proves the new one writes a row.
 *
 * Usage, from the repo root:
 *   node scripts/create-stripe-webhook-endpoint.mjs            # dry run
 *   node scripts/create-stripe-webhook-endpoint.mjs --apply    # creates it
 */
import Stripe from "stripe";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TARGET_URL = "https://tmatkd.com/api/stripe/webhook";
const SECRET_OUT = path.join(os.homedir(), "Desktop", ".stripe-webhook-secret.txt");

// Everything server/stripe-webhook.ts actually handles. The tuition, refund and
// dispute events are included because the handler has always had code for them
// and has never received one: the only registered endpoint was disabled and
// subscribed to a single unrelated event.
const EVENTS = [
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
];

const APPLY = process.argv.includes("--apply");

function loadSecretKey() {
  if (process.env.TMA_STRIPE_SECRET_KEY) return process.env.TMA_STRIPE_SECRET_KEY.trim();
  const envPath = path.join(os.homedir(), "Desktop", ".env");
  if (!fs.existsSync(envPath)) return "";
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*TMA_STRIPE_SECRET_KEY\s*=\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const key = loadSecretKey();
if (!key) {
  console.error("TMA_STRIPE_SECRET_KEY not found. Nothing was changed.");
  process.exit(1);
}
console.log(`Stripe key loaded: ${key.startsWith("sk_live_") ? "LIVE MODE" : "test mode"}\n`);

const stripe = new Stripe(key);

// Never create a second endpoint on the same url.
const existing = await stripe.webhookEndpoints.list({ limit: 100 });
const dupe = existing.data.find(e => e.url === TARGET_URL);
if (dupe) {
  console.error(`STOPPING. An endpoint already exists at ${TARGET_URL}: ${dupe.id} (${dupe.status}).`);
  console.error("Use scripts/update-stripe-webhook-events.mjs instead. Nothing was changed.");
  process.exit(2);
}

console.log(`Will create endpoint: ${TARGET_URL}`);
console.log(`With ${EVENTS.length} events:`);
for (const e of EVENTS) console.log(`  ${e}`);
console.log(`\nExisting endpoints (left untouched):`);
for (const e of existing.data) console.log(`  ${e.id}  ${e.status.padEnd(8)}  ${e.url}`);

if (!APPLY) {
  console.log("\nDRY RUN. Nothing was created. Re-run with --apply.");
  process.exit(0);
}

const created = await stripe.webhookEndpoints.create({
  url: TARGET_URL,
  enabled_events: EVENTS,
  description: "TMA site webhook (tuition, refunds, disputes, bake sale checkout)",
});

// The secret is returned exactly once, here. Write it to a file with no
// terminal echo. 0600 so it is not world-readable on a shared machine.
fs.writeFileSync(SECRET_OUT, `${created.secret}\n`, { mode: 0o600 });

console.log(`\nCREATED ${created.id}`);
console.log(`status: ${created.status}`);
console.log(`url: ${created.url}`);
console.log(`events: ${created.enabled_events.length}`);
console.log(`\nSigning secret written to:\n  ${SECRET_OUT}`);
console.log(`(starts with "whsec_", ${created.secret.length} chars. Not printed here on purpose.)`);
console.log(`\nNext: paste that value into Render as TMA_STRIPE_WEBHOOK_SECRET, save,`);
console.log(`and let the service restart. Then delete the local file.`);
