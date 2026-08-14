import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { chargeDueMemberships } from "./membership-billing";

describe("membership auto-charge safety gate", () => {
  it("performs no Stripe or database work while enforcement is disabled", async () => {
    expect(ENV.membershipAutochargeEnforce).toBe(false);
    await expect(chargeDueMemberships()).resolves.toEqual({ charged: 0, failed: 0, skipped: 0, total: 0 });
  });
});
