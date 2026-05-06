import { describe, it, expect } from "vitest";

describe("TMA Stripe API Key Validation", () => {
  it("should have TMA_STRIPE_SECRET_KEY set or be skipped", () => {
    const key = process.env.TMA_STRIPE_SECRET_KEY;
    if (!key) {
      console.warn("[stripe.test] TMA_STRIPE_SECRET_KEY not set, skipping");
      return;
    }
    // Accept both test and live keys
    expect(key).toMatch(/^sk_(test|live)_/);
  });

  it("should have VITE_TMA_STRIPE_PUBLISHABLE_KEY set or be skipped", () => {
    const key = process.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.warn("[stripe.test] VITE_TMA_STRIPE_PUBLISHABLE_KEY not set, skipping");
      return;
    }
    // Accept both test and live keys
    expect(key).toMatch(/^pk_(test|live)_/);
  });

  it("should be able to initialize Stripe with TMA key (skipped if key not set)", async () => {
    const key = process.env.TMA_STRIPE_SECRET_KEY;
    if (!key) {
      console.warn("[stripe.test] TMA_STRIPE_SECRET_KEY not set, skipping Stripe init test");
      return;
    }
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    // Verify the key works by fetching account info
    const account = await stripe.accounts.retrieve();
    expect(account).toBeTruthy();
    expect(account.id).toBeTruthy();
  });
});
