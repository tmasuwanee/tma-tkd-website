/**
 * One-off: add the bake-sale Checkout events to the EXISTING TMA Stripe webhook
 * endpoint, without disturbing anything already enabled.
 *
 * Why an update and never a create: creating a new endpoint mints a NEW signing
 * secret. TMA_STRIPE_WEBHOOK_SECRET in Render would then verify against the old
 * endpoint's secret, every delivery to the new endpoint would fail signature
 * verification, and orders would drop silently. So if the endpoint is not found,
 * this script stops and changes nothing.
 *
 * The new event list is a UNION: every event already enabled is preserved,
 * because other flows (tuition invoices, disputes, card setup) depend on them.
 *
 * Usage, from the repo root:
 *   node scripts/update-stripe-webhook-events.mjs            # dry run, shows the diff
 *   node scripts/update-stripe-webhook-events.mjs --apply    # writes the change
 *
 * The key is read from the environment. It is never printed, and no full Stripe
 * object is ever logged.
 */
import Stripe from "stripe";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TARGET_URL = "https://tmatkd.com/api/stripe/webhook";
const REQUIRED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
];

const APPLY = process.argv.includes("--apply");

// Prefer a real environment variable. Fall back to the Desktop .env file, which
// is where this key lives on Arfa's machine. Parsed by hand so the value never
// passes through a shell that could echo it.
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
  console.error("TMA_STRIPE_SECRET_KEY is not set and was not found in ~/Desktop/.env. Nothing was changed.");
  process.exit(1);
}
// Only the mode, never the value.
console.log(`Stripe key loaded: ${key.startsWith("sk_live_") ? "LIVE MODE" : "test mode"}\n`);

const stripe = new Stripe(key);

const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
console.log(`Found ${endpoints.data.length} webhook endpoint(s) on this account:`);
for (const e of endpoints.data) {
  console.log(`  ${e.id}  ${e.status.padEnd(8)}  ${e.url}  (${e.enabled_events.length} events)`);
}
console.log("");

const target = endpoints.data.find(e => e.url === TARGET_URL);
if (!target) {
  console.error(`STOPPING. No endpoint with url ${TARGET_URL} was found.`);
  console.error("Not creating one: a new endpoint would get a new signing secret that");
  console.error("would not match TMA_STRIPE_WEBHOOK_SECRET in Render, and every delivery");
  console.error("would fail signature verification. Nothing was changed.");
  process.exit(2);
}

const before = [...target.enabled_events].sort();
const after = [...new Set([...before, ...REQUIRED_EVENTS])].sort();
const added = after.filter(e => !before.includes(e));

console.log(`Target endpoint: ${target.id}  (${target.status})`);
console.log(`\nBEFORE (${before.length} events):`);
for (const e of before) console.log(`  ${e}`);

if (added.length === 0) {
  console.log("\nAll three bake-sale events are already enabled. No change needed.");
  process.exit(0);
}

console.log(`\nWILL ADD (${added.length}):`);
for (const e of added) console.log(`  + ${e}`);
console.log(`\nAFTER (${after.length} events):`);
for (const e of after) console.log(`  ${e}${added.includes(e) ? "   <-- new" : ""}`);
console.log(`\nRemoved: none. Every existing event is preserved.`);

if (!APPLY) {
  console.log("\nDRY RUN. Nothing was changed.");
  console.log("Re-run with --apply to write this change.");
  process.exit(0);
}

const updated = await stripe.webhookEndpoints.update(target.id, { enabled_events: after });
const confirmed = [...updated.enabled_events].sort();

console.log(`\nAPPLIED. Endpoint ${updated.id} now has ${confirmed.length} events:`);
for (const e of confirmed) console.log(`  ${e}`);

const missing = REQUIRED_EVENTS.filter(e => !confirmed.includes(e));
const lost = before.filter(e => !confirmed.includes(e));
if (missing.length) console.error(`\nWARNING: still missing: ${missing.join(", ")}`);
if (lost.length) console.error(`\nWARNING: events lost in the update: ${lost.join(", ")}`);
if (!missing.length && !lost.length) console.log("\nVerified: all three added, nothing lost.");
