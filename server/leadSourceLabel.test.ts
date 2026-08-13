import { describe, it, expect } from "vitest";
import { leadSourceLabel } from "./integrations";
import type { Lead } from "../drizzle/schema";

// leadSourceLabel only reads programInterest + tags, so a minimal cast is enough.
const L = (programInterest: string, tags: string[] = []) =>
  ({ programInterest, tags } as unknown as Lead);

describe("leadSourceLabel", () => {
  it('the "summer" dropdown value maps to Summer Camp (regression: it used to fall through to Free Class)', () => {
    expect(leadSourceLabel(L("summer")).title).toBe("New Summer Camp Inquiry");
  });
  it("summer_camp tag -> Summer Camp", () => {
    expect(leadSourceLabel(L("", ["summer_camp_2026"])).title).toBe("New Summer Camp Inquiry");
  });
  it("a martial-arts inquiry does NOT show as camp", () => {
    expect(leadSourceLabel(L("taekwondo")).title).toBe("New Taekwondo Inquiry");
    expect(leadSourceLabel(L("kickboxing")).title).toBe("New Kickboxing Inquiry");
  });
  it("little_tigers -> Little Tigers (was falling through)", () => {
    expect(leadSourceLabel(L("little_tigers")).title).toBe("New Little Tigers Inquiry");
  });
  it("pro shop order is labeled as such, not a class inquiry", () => {
    expect(leadSourceLabel(L("", ["proshop_order"])).title).toBe("New Pro Shop Order");
  });
  it("open house RSVP is labeled, not Free Class", () => {
    expect(leadSourceLabel(L("Open House", ["open_house_2026"])).title).toContain("Open House");
  });
  it("afterschool -> After-School", () => {
    expect(leadSourceLabel(L("afterschool")).title).toBe("New After-School Inquiry");
  });
  it("empty falls back to the general Free Class inquiry", () => {
    expect(leadSourceLabel(L("")).title).toBe("New Free Class Inquiry");
  });
});
