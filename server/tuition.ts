/**
 * Recurring tuition (Stripe Subscriptions) for afterschool care.
 *
 * Design (see docs/TUITION_RECURRING_PAYMENTS_SPEC.md, Option B / lower-risk):
 * the existing one-time PaymentIntent (registration + fees + discounted first
 * month) is left untouched. On top of it we create a monthly Subscription whose
 * FIRST charge is one month out, on the saved card. So month 1 is the existing
 * one-time charge and month 2+ bills automatically.
 *
 * CONFIG-GATED: if the plan's price id env var is not set, every function here
 * no-ops, so an unconfigured deploy behaves exactly as before (no customer, no
 * subscription). Configure per docs/STRIPE_TUITION_SETUP.md, test on Stripe test
 * mode with a Test Clock, then set the live price ids.
 */
import Stripe from "stripe";
import { ENV } from "./_core/env";
import { setAfterschoolSubscription } from "./db";

const MONTHLY_CENTS: Record<string, number> = { "4_5_day": 500_00, "2_3_day": 400_00 };

/** The recurring monthly Price id for a plan, or null if not configured. */
export function afterschoolPriceId(plan: string): string | null {
  if (plan === "4_5_day") return ENV.stripePriceAfterschool45 || null;
  if (plan === "2_3_day") return ENV.stripePriceAfterschool23 || null;
  return null;
}

/** True when recurring tuition is fully configured for this plan (price id +
 *  Stripe key present). Every write path gates on this so nothing changes until
 *  the school has set up Stripe. */
export function tuitionConfiguredFor(plan: string): boolean {
  return !!afterschoolPriceId(plan) && !!ENV.tmaStripeSecretKey;
}

/** Find or create a Stripe Customer for a parent, so the card saved on the
 *  one-time PaymentIntent can back the recurring subscription. Null if Stripe
 *  is not configured. */
export async function ensureStripeCustomer(email: string, name: string): Promise<string | null> {
  if (!ENV.tmaStripeSecretKey || !email) return null;
  const stripe = new Stripe(ENV.tmaStripeSecretKey);
  const existing = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const created = await stripe.customers.create({ email: email.toLowerCase().trim(), name });
  return created.id;
}

/**
 * Create the monthly afterschool tuition subscription for a paid registration.
 * No-op when the plan's price id is not configured. The first charge is one
 * month after the anticipated start date (first month already collected in the
 * one-time PaymentIntent), so trial_end holds billing until then and nothing is
 * charged now.
 */
export async function createAfterschoolSubscription(args: {
  registrationId: number;
  plan: string;
  customerId: string;
  paymentMethodId: string;
  startDate?: string | null; // YYYY-MM-DD anticipated start
}): Promise<void> {
  const priceId = afterschoolPriceId(args.plan);
  if (!priceId) return; // not configured -> no-op

  const stripe = new Stripe(ENV.tmaStripeSecretKey);

  // First recurring charge one month after start (or one month from now if no
  // start date). Guard the minimum: trial_end must be comfortably in the future.
  const base = args.startDate ? new Date(args.startDate + "T12:00:00") : new Date();
  const anchor = new Date(base.getTime());
  anchor.setMonth(anchor.getMonth() + 1);
  const nowPlus2Days = Date.now() + 2 * 86400000;
  const anchorMs = Math.max(anchor.getTime(), nowPlus2Days);
  const anchorUnix = Math.floor(anchorMs / 1000);

  // Make the saved card the customer's default for invoices.
  await stripe.customers.update(args.customerId, {
    invoice_settings: { default_payment_method: args.paymentMethodId },
  });

  const sub = await stripe.subscriptions.create({
    customer: args.customerId,
    items: [{ price: priceId }],
    default_payment_method: args.paymentMethodId,
    // Hold billing until the anchor so month 1 (already charged one-time) is not
    // double-billed. proration_behavior none = no partial/immediate charge.
    trial_end: anchorUnix,
    proration_behavior: "none",
    collection_method: "charge_automatically",
    payment_settings: {
      payment_method_types: ["card"],
      save_default_payment_method: "on_subscription",
    },
    metadata: {
      registrationId: String(args.registrationId),
      plan: args.plan,
      product: "afterschool_tuition",
    },
  });

  await setAfterschoolSubscription({
    registrationId: args.registrationId,
    stripeCustomerId: args.customerId,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    monthlyAmountCents: MONTHLY_CENTS[args.plan] ?? 0,
    billingAnchor: new Date(anchorMs).toISOString().slice(0, 10),
  });
}
