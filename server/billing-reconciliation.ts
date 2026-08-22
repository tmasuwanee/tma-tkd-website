/**
 * Billing reconciliation — 2026-08-21
 *
 * Detection + alert only (no ledger writes). Compares recent Stripe membership
 * charges against our ledger and flags drift: money that moved in Stripe but the
 * ledger doesn't reflect (the crash-after-success case), a charge whose amount
 * disagrees, or a ledger row Stripe never confirmed. Runs daily via a Heartbeat
 * cron; anything found is Telegrammed for a human to resolve.
 */
import Stripe from "stripe";
import { ENV } from "./_core/env";
import { findMembershipChargeByPaymentIntentId } from "./db";

export async function reconcileMembershipBilling(lookbackHours = 48): Promise<{ checkedPaymentIntents: number; drift: string[] }> {
  const drift: string[] = [];
  let checkedPaymentIntents = 0;
  if (!ENV.tmaStripeSecretKey) return { checkedPaymentIntents, drift };
  const stripe = new Stripe(ENV.tmaStripeSecretKey);
  const gte = Math.floor(Date.now() / 1000) - lookbackHours * 3600;

  // Stripe membership-tuition PaymentIntents in the window, checked against the ledger.
  for await (const pi of stripe.paymentIntents.list({ created: { gte }, limit: 100 })) {
    if (pi.metadata?.product !== "membership_tuition") continue;
    if (pi.status !== "succeeded") continue;
    checkedPaymentIntents++;
    const ch = await findMembershipChargeByPaymentIntentId(pi.id);
    if (!ch) { drift.push(`PI ${pi.id} ($${(pi.amount / 100).toFixed(2)}) succeeded in Stripe but no ledger charge is linked to it.`); continue; }
    if (ch.status !== "paid" && ch.status !== "refunded" && ch.status !== "disputed") {
      drift.push(`Charge #${ch.id} is '${ch.status}' but its Stripe PI ${pi.id} succeeded.`);
    }
    if (ch.status === "paid" && ch.amountCents !== pi.amount) {
      drift.push(`Charge #${ch.id} ledger $${(ch.amountCents / 100).toFixed(2)} != Stripe $${(pi.amount / 100).toFixed(2)}.`);
    }
    if (drift.length >= 40) break; // cap
  }
  return { checkedPaymentIntents, drift };
}
