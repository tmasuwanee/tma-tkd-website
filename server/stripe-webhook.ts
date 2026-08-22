/**
 * Stripe Webhook Handler (recurring tuition) — 2026-08-11
 *
 * The source of truth for subscription state. Stripe POSTs signed events here
 * server-side (invoices fire with no browser open), so the DB must be updated
 * from here, not from a client confirm() call.
 *
 * Registered as POST /api/stripe/webhook in server/_core/index.ts, BEFORE
 * express.json(), so req.body is the raw Buffer that signature verification
 * needs (Stripe verifies the exact bytes, not re-serialized JSON).
 *
 * Setup (see docs/STRIPE_TUITION_SETUP.md):
 *   Stripe Dashboard -> Developers -> Webhooks -> Add endpoint
 *   URL: https://tmatkd.com/api/stripe/webhook
 *   Events: invoice.paid, invoice.payment_failed,
 *           customer.subscription.updated, customer.subscription.deleted,
 *           charge.refunded, charge.dispute.created, charge.dispute.closed
 *   Copy the signing secret -> set TMA_STRIPE_WEBHOOK_SECRET in Secrets.
 *
 * NOTE (rule D4/D5): the Stripe object field names read below (invoice.subscription,
 * subscription.current_period_end, invoice.hosted_invoice_url) must be verified
 * against a REAL captured payload during Test-Clock testing before go-live.
 */
import type { Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "./_core/env";
import { sendTelegramMessage } from "./telegram";
import { updateSubscriptionByStripeId, updateMembership, updatePayerStripeCustomer, findMembershipChargeByPaymentIntentId, findMembershipPaymentByPaymentIntentId, recordStripeRefund, updateMembershipCharge, type MembershipChargeRow } from "./db";

const toMysqlDate = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 19).replace("T", " ");

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const secret = ENV.tmaStripeWebhookSecret;
  if (!secret) {
    // Deploy-time config missing (rule D6). Fail loudly rather than silently
    // accepting unsigned events.
    console.error("[stripe-webhook] TMA_STRIPE_WEBHOOK_SECRET not set; rejecting");
    res.status(500).send("webhook not configured");
    return;
  }
  const stripe = new Stripe(ENV.tmaStripeSecretKey);
  const sig = req.headers["stripe-signature"] as string | undefined;

  let event: Stripe.Event;
  try {
    // req.body is a raw Buffer because this route is registered before express.json().
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig ?? "", secret);
  } catch (e) {
    console.error("[stripe-webhook] signature verification failed:", (e as Error).message);
    res.status(400).send("bad signature");
    return;
  }

  // Map a Stripe charge/PaymentIntent back to our membership ledger.
  const piFromCharge = async (chargeRef: string | Stripe.Charge | null | undefined): Promise<string | null> => {
    if (!chargeRef) return null;
    if (typeof chargeRef !== "string") return typeof chargeRef.payment_intent === "string" ? chargeRef.payment_intent : chargeRef.payment_intent?.id ?? null;
    try { const c = await stripe.charges.retrieve(chargeRef); return typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id ?? null; } catch { return null; }
  };
  const resolveByPI = async (piId: string | null): Promise<{ ch: MembershipChargeRow | null; membershipId: number | null; studentName: string | null }> => {
    if (!piId) return { ch: null, membershipId: null, studentName: null };
    const ch = await findMembershipChargeByPaymentIntentId(piId);
    if (ch) return { ch, membershipId: ch.membershipId, studentName: null };
    const p = await findMembershipPaymentByPaymentIntentId(piId);
    return { ch: null, membershipId: p?.membershipId ?? null, studentName: p?.studentName ?? null };
  };

  try {
    switch (event.type) {
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = (inv as unknown as { subscription?: string | null }).subscription;
        const periodEnd = inv.lines?.data?.[0]?.period?.end;
        if (subId) {
          await updateSubscriptionByStripeId({
            stripeSubscriptionId: String(subId),
            subscriptionStatus: "active",
            lastPaymentStatus: "paid",
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = (inv as unknown as { subscription?: string | null }).subscription;
        if (subId) {
          await updateSubscriptionByStripeId({
            stripeSubscriptionId: String(subId),
            subscriptionStatus: "past_due",
            lastPaymentStatus: "failed",
          });
        }
        const who = inv.customer_name || inv.customer_email || "A family";
        const url = (inv as unknown as { hosted_invoice_url?: string }).hosted_invoice_url || "";
        void sendTelegramMessage(
          `⚠️ <b>Tuition payment failed</b>\n${who} · $${((inv.amount_due ?? 0) / 100).toFixed(2)}\n${url}`
        ).catch(() => {});
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
        await updateSubscriptionByStripeId({
          stripeSubscriptionId: sub.id,
          subscriptionStatus: sub.status,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await updateSubscriptionByStripeId({
          stripeSubscriptionId: sub.id,
          subscriptionStatus: "canceled",
          canceledAt: new Date(),
        });
        void sendTelegramMessage(`🚫 <b>Tuition subscription canceled</b>\nSubscription ${sub.id}`).catch(() => {});
        break;
      }
      case "checkout.session.completed": {
        // Card setup: attach the collected card as the customer's default (primary)
        // and link the customer to the family payer (or membership, legacy).
        const session = event.data.object as Stripe.Checkout.Session;
        const payerId = session.metadata?.payerId;
        const membershipId = session.metadata?.membershipId;
        if (session.mode === "setup" && session.customer && (payerId || membershipId)) {
          try {
            const si = await stripe.setupIntents.retrieve(String(session.setup_intent));
            const pm = si.payment_method as string | null;
            if (pm) await stripe.customers.update(String(session.customer), { invoice_settings: { default_payment_method: pm } });
          } catch (e) {
            console.error("[stripe-webhook] setup attach failed:", e);
          }
          if (payerId) await updatePayerStripeCustomer(Number(payerId), String(session.customer));
          else if (membershipId) await updateMembership(Number(membershipId), { stripeCustomerId: String(session.customer) });
          void sendTelegramMessage(`💳 <b>Card saved</b>\n${payerId ? `Payer #${payerId}` : `Membership #${membershipId}`}`).catch(() => {});
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
        const { ch, membershipId, studentName } = await resolveByPI(piId);
        if (membershipId === null) { void sendTelegramMessage(`⚠️ <b>Unmapped Stripe refund</b>\nCharge ${charge.id} (PI ${piId ?? "?"}). Reconcile manually.`).catch(() => {}); break; }
        // Record each succeeded refund as an immutable negative ledger row (idempotent per refund).
        for (const rf of charge.refunds?.data ?? []) {
          if (rf.status && rf.status !== "succeeded") continue;
          await recordStripeRefund({ membershipId, studentName, refundId: rf.id, amountCents: rf.amount, refundedAt: toMysqlDate(rf.created ?? charge.created), note: `Refund on charge ${charge.id}` });
        }
        if (ch) {
          const fully = (charge.amount_refunded ?? 0) >= (charge.amount ?? 0);
          await updateMembershipCharge(ch.id, { refundTotalCents: charge.amount_refunded ?? 0, ...(fully ? { status: "refunded" } : {}), note: `${fully ? "Refunded" : "Partially refunded"} ${charge.id}` });
        }
        void sendTelegramMessage(`↩️ <b>Refund recorded</b>\n${studentName ?? `Membership #${membershipId}`} · $${((charge.amount_refunded ?? 0) / 100).toFixed(2)} of $${((charge.amount ?? 0) / 100).toFixed(2)}`).catch(() => {});
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const piId = await piFromCharge(dispute.charge);
        const { ch } = await resolveByPI(piId);
        if (ch) await updateMembershipCharge(ch.id, { status: "disputed", stripeDisputeId: dispute.id, disputeStatus: dispute.status, disputedAt: toMysqlDate(dispute.created), note: `Dispute ${dispute.id}: ${dispute.status}` });
        void sendTelegramMessage(`⚠️ <b>Charge disputed</b>\nDispute ${dispute.id} · $${((dispute.amount ?? 0) / 100).toFixed(2)} · ${dispute.status}${ch ? "" : " (unmapped — reconcile)"}`).catch(() => {});
        break;
      }
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const piId = await piFromCharge(dispute.charge);
        const { ch, membershipId, studentName } = await resolveByPI(piId);
        const won = dispute.status === "won";
        if (ch) await updateMembershipCharge(ch.id, { status: won ? "paid" : "refunded", disputeStatus: dispute.status, note: `Dispute ${dispute.id} ${dispute.status}` });
        if (!won && membershipId !== null) {
          await recordStripeRefund({ membershipId, studentName, refundId: `dispute-lost:${dispute.id}`, amountCents: dispute.amount, refundedAt: toMysqlDate(dispute.created), note: `Lost dispute ${dispute.id}` });
        }
        void sendTelegramMessage(`⚖️ <b>Dispute closed (${dispute.status})</b>\nDispute ${dispute.id} · $${((dispute.amount ?? 0) / 100).toFixed(2)}${ch ? "" : " (unmapped)"}`).catch(() => {});
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (e) {
    // Real failure: 500 so Stripe retries (do NOT ack 200 on a path that did
    // nothing, rule D7).
    console.error("[stripe-webhook] handler error:", e);
    res.status(500).send("handler error");
  }
}
