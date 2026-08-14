/**
 * Membership billing (Stripe charging layer) — 2026-08-12
 *
 * Our per-month charges ledger (membershipCharges) is the source of truth. This
 * layer just EXECUTES each due charge against the parent's saved card, which is
 * exactly why editing a specific month's amount works: the charger reads whatever
 * the ledger says for that month.
 *
 * CONFIG-GATED: chargeDueMemberships() no-ops unless ENV.membershipAutochargeEnforce
 * (MEMBERSHIP_AUTOCHARGE_ENFORCE=true). So deploying this never charges anyone
 * until you enable it AND cards are on file. See docs/OPERATIONS_SOPS.md.
 */
import Stripe from "stripe";
import { ENV } from "./_core/env";
import {
  listMemberships, listMembershipCharges, updateMembershipCharge, getMembership, updateMembership,
} from "./db";
import { sendTelegramMessage } from "./telegram";

function stripe() { return new Stripe(ENV.tmaStripeSecretKey); }
const today = () => new Date().toISOString().slice(0, 10);

/** Charge every scheduled charge that is due today or earlier, off-session, for
 *  active memberships that have a saved card. Idempotent: a paid charge flips to
 *  'paid' so a re-run skips it. Returns a small summary. */
export async function chargeDueMemberships(): Promise<{ charged: number; failed: number; skipped: number; total: number }> {
  const summary = { charged: 0, failed: 0, skipped: 0, total: 0 };
  if (!ENV.membershipAutochargeEnforce || !ENV.tmaStripeSecretKey) return summary;
  const s = stripe();
  const cutoff = today();

  for (const m of await listMemberships("active")) {
    if (!m.stripeCustomerId) continue;
    let pm: string | null = null;
    try {
      const cust = await s.customers.retrieve(m.stripeCustomerId) as Stripe.Customer;
      pm = (cust.invoice_settings?.default_payment_method as string) || null;
    } catch { pm = null; }
    if (!pm) continue; // no card on file yet — skip

    for (const c of await listMembershipCharges(m.id)) {
      if (c.status !== "scheduled") continue;
      if (!c.dueDate || String(c.dueDate).slice(0, 10) > cutoff) continue; // not due yet
      summary.total++;
      if (c.amountCents <= 0) { await updateMembershipCharge(c.id, { status: "waived", note: "auto: $0" }); continue; }
      try {
        const pi = await s.paymentIntents.create({
          amount: c.amountCents, currency: "usd", customer: m.stripeCustomerId, payment_method: pm,
          off_session: true, confirm: true, payment_method_types: ["card"],
          metadata: { product: "membership_tuition", membershipId: String(m.id), chargeId: String(c.id), period: c.periodMonth },
        });
        if (pi.status === "succeeded") { await updateMembershipCharge(c.id, { status: "paid", stripeInvoiceId: pi.id }); summary.charged++; }
        else { await updateMembershipCharge(c.id, { note: `pending: ${pi.status}` }); }
      } catch (e) {
        summary.failed++;
        await updateMembershipCharge(c.id, { note: `charge failed: ${(e as Error).message}`.slice(0, 240) });
        void sendTelegramMessage(`⚠️ <b>Tuition charge failed</b>\n${m.studentName} · ${c.periodMonth} · $${(c.amountCents / 100).toFixed(2)}\n${(e as Error).message}`).catch(() => {});
      }
    }
  }
  return summary;
}

/** Create a Stripe Checkout session (setup mode) to collect a card for autopay.
 *  Returns a URL to hand the parent. On completion the webhook attaches the
 *  customer + default payment method to the membership. */
export async function createCardSetupSession(membershipId: number, origin: string): Promise<{ url: string | null }> {
  if (!ENV.tmaStripeSecretKey) return { url: null };
  const m = await getMembership(membershipId);
  if (!m) throw new Error("Membership not found");
  const s = stripe();
  let customerId = m.stripeCustomerId;
  if (!customerId) {
    const cust = await s.customers.create({ name: m.studentName, ...(m.email ? { email: m.email } : {}) });
    customerId = cust.id;
    await updateMembership(membershipId, { stripeCustomerId: customerId });
  }
  const session = await s.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    payment_method_types: ["card"],
    success_url: `${origin}/admin/memberships?open=${membershipId}&autopay=ok`,
    cancel_url: `${origin}/admin/memberships?open=${membershipId}`,
    metadata: { membershipId: String(membershipId) },
  });
  return { url: session.url };
}
