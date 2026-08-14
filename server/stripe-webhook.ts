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
 *           customer.subscription.updated, customer.subscription.deleted
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
import { updateSubscriptionByStripeId, updateMembership, updatePayerStripeCustomer } from "./db";

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
