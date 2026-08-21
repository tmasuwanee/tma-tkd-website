/**
 * Membership billing (Stripe charging layer) — 2026-08-12
 *
 * Family model: cards live on a PAYER (head of household), one Stripe customer per
 * payer. Multiple students' memberships draw from the payer's card, and the
 * "primary" card is the customer's default_payment_method. A membership with no
 * payer falls back to its own customer (legacy).
 *
 * Our per-month charges ledger (membershipCharges) stays the source of truth;
 * this layer just executes each due charge against the resolved card.
 *
 * CONFIG-GATED: chargeDueMemberships() no-ops unless MEMBERSHIP_AUTOCHARGE_ENFORCE
 * is on. So deploying never charges anyone until you enable it AND cards are on
 * file. See docs/OPERATIONS_SOPS.md.
 */
import Stripe from "stripe";
import { ENV } from "./_core/env";
import {
  listMemberships, listMembershipCharges, updateMembershipCharge, getMembership, updateMembership,
  getPayer, insertPayer, updatePayerStripeCustomer, type MembershipRow,
} from "./db";
import { sendTelegramMessage } from "./telegram";

function stripe() { return new Stripe(ENV.tmaStripeSecretKey); }

/** YYYY-MM-DD business date in America/New_York, regardless of server timezone,
 *  so an evening (UTC-late) cron run bills on the club's actual local date, not a
 *  day early/late. Intl.DateTimeFormat with a timeZone is built into Node (no dep). */
function etDateString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const today = () => etDateString();

// A charge stops being retried after this many failed attempts; it stays past_due
// and a human follows up. Rough cadence: the daily job re-attempts each run.
const MAX_CHARGE_ATTEMPTS = 4;

/** The Stripe customer that bills a membership: the family payer's customer if
 *  linked, else the membership's own (legacy). */
async function billingCustomerId(m: MembershipRow): Promise<string | null> {
  if (m.payerId) { const p = await getPayer(m.payerId); return p?.stripeCustomerId ?? null; }
  return m.stripeCustomerId ?? null;
}

export async function chargeDueMemberships(): Promise<{ charged: number; failed: number; skipped: number; total: number }> {
  const summary = { charged: 0, failed: 0, skipped: 0, total: 0 };
  if (!ENV.membershipAutochargeEnforce || !ENV.tmaStripeSecretKey) return summary;
  const s = stripe();
  const cutoff = today();

  for (const m of await listMemberships("active")) {
    // Honor a scheduled cancellation: once the 60-day-notice date has passed, this
    // membership's remaining charges must never fire (status stays "active" until
    // then, so the charge job is the only thing enforcing the effective date).
    const cancelDate = m.cancelEffectiveDate ? String(m.cancelEffectiveDate).slice(0, 10) : null;
    if (cancelDate && cancelDate <= cutoff) continue;
    // Paid-through anchor (set by legacy import): never bill a month already paid.
    const paidThrough = m.paidThroughDate ? String(m.paidThroughDate).slice(0, 10) : null;

    const customerId = await billingCustomerId(m);
    if (!customerId) continue;
    let pm: string | null = null;
    try {
      const cust = await s.customers.retrieve(customerId) as Stripe.Customer;
      pm = (cust.invoice_settings?.default_payment_method as string) || null;
    } catch { pm = null; }
    if (!pm) continue; // no card on file yet

    for (const c of await listMembershipCharges(m.id)) {
      const attempts = c.attemptCount ?? 0;
      if (c.status === "past_due" && attempts >= MAX_CHARGE_ATTEMPTS) continue; // retries exhausted, manual follow-up
      if (c.status !== "scheduled" && c.status !== "past_due") continue;
      if (!c.dueDate) continue;
      const due = String(c.dueDate).slice(0, 10);
      if (due > cutoff) continue;
      if (paidThrough && due <= paidThrough) { await updateMembershipCharge(c.id, { status: "waived", note: "auto: already paid through import" }); continue; }
      summary.total++;
      if (c.amountCents <= 0) { await updateMembershipCharge(c.id, { status: "waived", note: "auto: $0" }); continue; }
      try {
        const pi = await s.paymentIntents.create({
          amount: c.amountCents, currency: "usd", customer: customerId, payment_method: pm,
          off_session: true, confirm: true, payment_method_types: ["card"],
          statement_descriptor_suffix: "TMA TKD",
          ...(m.email ? { receipt_email: m.email } : {}),
          metadata: { product: "membership_tuition", membershipId: String(m.id), chargeId: String(c.id), period: c.periodMonth },
        }, {
          // Real-money safety: keyed on charge id + the ET business date, so a retry
          // or overlapping cron run on the SAME day returns the original PaymentIntent
          // (never double-charges), while a genuine next-day retry gets a fresh attempt.
          idempotencyKey: `tuition-charge-${c.id}-${cutoff}`,
        });
        if (pi.status === "succeeded") {
          await updateMembershipCharge(c.id, { status: "paid", stripeInvoiceId: pi.id, stripePaymentIntentId: pi.id, paidAt: new Date().toISOString().slice(0, 19).replace("T", " ") });
          summary.charged++;
        } else {
          await updateMembershipCharge(c.id, { status: "past_due", note: `pending: ${pi.status}`, attemptCount: attempts + 1, stripePaymentIntentId: pi.id });
          summary.failed++;
        }
      } catch (e) {
        summary.failed++;
        const nextAttempt = attempts + 1;
        await updateMembershipCharge(c.id, { status: "past_due", note: `charge failed (attempt ${nextAttempt}): ${(e as Error).message}`.slice(0, 240), attemptCount: nextAttempt });
        void sendTelegramMessage(
          nextAttempt >= MAX_CHARGE_ATTEMPTS
            ? `⚠️ <b>Tuition charge failed — retries exhausted</b>\n${m.studentName} · ${c.periodMonth} · $${(c.amountCents / 100).toFixed(2)}\nAttempt ${nextAttempt}/${MAX_CHARGE_ATTEMPTS}. Manual follow-up needed.\n${(e as Error).message}`
            : `⚠️ <b>Tuition charge failed</b>\n${m.studentName} · ${c.periodMonth} · $${(c.amountCents / 100).toFixed(2)}\nAttempt ${nextAttempt}/${MAX_CHARGE_ATTEMPTS}, will retry.\n${(e as Error).message}`
        ).catch(() => {});
      }
    }
  }
  return summary;
}

/** Ensure the membership has a family payer with a Stripe customer, then return a
 *  Checkout (setup) URL to collect a card onto that payer. */
export async function createCardSetupSession(membershipId: number, origin: string): Promise<{ url: string | null }> {
  // Card collection is its OWN gate now (separate from charging). Never mint a
  // card-setup link unless card collection is enabled.
  if (!ENV.cardCollectionEnabled || !ENV.tmaStripeSecretKey) return { url: null };
  const m = await getMembership(membershipId);
  if (!m) throw new Error("Membership not found");
  const s = stripe();
  const { payerId, customerId } = await ensurePayerCustomer(m, s);
  const session = await s.checkout.sessions.create({
    mode: "setup", customer: customerId, payment_method_types: ["card"],
    success_url: `${origin}/admin/memberships?open=${membershipId}&autopay=ok`,
    cancel_url: `${origin}/admin/memberships?open=${membershipId}`,
    metadata: { payerId: String(payerId) },
  });
  return { url: session.url };
}

/** Add a card directly to an existing payer. */
export async function createPayerCardSession(payerId: number, origin: string): Promise<{ url: string | null }> {
  if (!ENV.tmaStripeSecretKey) return { url: null };
  const p = await getPayer(payerId);
  if (!p) throw new Error("Payer not found");
  const s = stripe();
  let customerId = p.stripeCustomerId;
  if (!customerId) {
    const cust = await s.customers.create({ name: p.name, ...(p.email ? { email: p.email } : {}) });
    customerId = cust.id;
    await updatePayerStripeCustomer(payerId, customerId);
  }
  const session = await s.checkout.sessions.create({
    mode: "setup", customer: customerId, payment_method_types: ["card"],
    success_url: `${origin}/admin/memberships?autopay=ok`, cancel_url: `${origin}/admin/memberships`,
    metadata: { payerId: String(payerId) },
  });
  return { url: session.url };
}

async function ensurePayerCustomer(m: MembershipRow, s: Stripe): Promise<{ payerId: number; customerId: string }> {
  let payerId = m.payerId;
  let payer = payerId ? await getPayer(payerId) : null;
  if (!payer) {
    payerId = await insertPayer({ name: m.parentName || m.studentName, email: m.email, phone: m.phone });
    await updateMembership(m.id, { payerId });
    payer = await getPayer(payerId);
  }
  let customerId = payer?.stripeCustomerId ?? null;
  if (!customerId) {
    const cust = await s.customers.create({ name: payer!.name, ...(payer!.email ? { email: payer!.email } : {}) });
    customerId = cust.id;
    await updatePayerStripeCustomer(payerId!, customerId);
  }
  return { payerId: payerId!, customerId };
}

/** List a payer's saved cards + which is primary (the customer's default). */
export async function listPayerCards(payerId: number): Promise<{ id: string; brand: string; last4: string; exp: string; primary: boolean }[]> {
  if (!ENV.tmaStripeSecretKey) return [];
  const p = await getPayer(payerId);
  if (!p?.stripeCustomerId) return [];
  const s = stripe();
  const cust = await s.customers.retrieve(p.stripeCustomerId) as Stripe.Customer;
  const defaultPm = (cust.invoice_settings?.default_payment_method as string) || null;
  const pms = await s.paymentMethods.list({ customer: p.stripeCustomerId, type: "card" });
  return pms.data.map(pm => ({
    id: pm.id, brand: pm.card?.brand ?? "card", last4: pm.card?.last4 ?? "····",
    exp: pm.card ? `${pm.card.exp_month}/${String(pm.card.exp_year).slice(-2)}` : "",
    primary: pm.id === defaultPm,
  }));
}

/** Make a saved card the payer's primary (default) — the card every student's
 *  charges draw from. */
export async function setPayerPrimaryCard(payerId: number, paymentMethodId: string): Promise<void> {
  const p = await getPayer(payerId);
  if (!p?.stripeCustomerId) throw new Error("No customer for this payer");
  const s = stripe();
  await s.customers.update(p.stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethodId } });
}

/** Remove (detach) a saved card from the family payer. Verifies the card actually
 *  belongs to this payer's Stripe customer first, and refuses to remove the primary
 *  card while other cards remain (staff should pick a new primary first) so a
 *  family is never left with charges pointing at a detached default. */
export async function detachPayerCard(payerId: number, paymentMethodId: string): Promise<void> {
  const p = await getPayer(payerId);
  if (!p?.stripeCustomerId) throw new Error("No customer for this payer");
  const s = stripe();
  const cust = await s.customers.retrieve(p.stripeCustomerId) as Stripe.Customer;
  const defaultPm = (cust.invoice_settings?.default_payment_method as string) || null;
  const pm = await s.paymentMethods.retrieve(paymentMethodId);
  if ((pm.customer as string | null) !== p.stripeCustomerId) throw new Error("That card is not on this family's account.");
  if (paymentMethodId === defaultPm) {
    const others = await s.paymentMethods.list({ customer: p.stripeCustomerId, type: "card" });
    if (others.data.filter(x => x.id !== paymentMethodId).length > 0) {
      throw new Error("That's the primary card. Make another card primary first, then remove this one.");
    }
  }
  await s.paymentMethods.detach(paymentMethodId);
}
