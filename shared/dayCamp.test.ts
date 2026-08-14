import { describe, expect, it } from "vitest";
import { DAY_CAMP_PRICE_CENTS, DAY_CAMP_PRICE_LABEL, dayCampTotalCents } from "./dayCamp";

describe("Day Camp pricing", () => {
  it("keeps the server-enforced daily rate at $60", () => {
    expect(DAY_CAMP_PRICE_CENTS).toBe(6000);
    expect(DAY_CAMP_PRICE_LABEL).toBe("$60");
    expect(dayCampTotalCents(1)).toBe(6000);
    expect(dayCampTotalCents(3)).toBe(18000);
    expect(dayCampTotalCents(-1)).toBe(0);
  });
});
