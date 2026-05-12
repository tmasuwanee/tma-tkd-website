import { describe, it, expect } from "vitest";
import { getEligibleSlots, getUpcomingDates, formatDate } from "../shared/classSchedule";

describe("Class Schedule Eligibility", () => {
  it("TKD kids age 6-13 get 5 slots (Mon/Tue/Wed/Thu/Fri)", () => {
    const slots = getEligibleSlots("taekwondo", 8);
    expect(slots).toHaveLength(5);
    expect(slots.map(s => s.day)).toEqual(["Monday","Tuesday","Wednesday","Thursday","Friday"]);
  });

  it("TKD teens/adults age 14+ get 2 all-belts slots (Mon/Thu)", () => {
    const slots = getEligibleSlots("taekwondo", 16);
    expect(slots).toHaveLength(2);
    expect(slots.map(s => s.day)).toEqual(["Monday","Thursday"]);
    expect(slots[0].startTime).toBe("7:10 PM");
  });

  it("TKD under age 6 returns empty (too young)", () => {
    expect(getEligibleSlots("taekwondo", 4)).toHaveLength(0);
    expect(getEligibleSlots("taekwondo", 5)).toHaveLength(0);
  });

  it("BJJ age 9+ gets 3 slots (Mon/Wed/Fri)", () => {
    const slots = getEligibleSlots("bjj", 10);
    expect(slots).toHaveLength(3);
    expect(slots.map(s => s.day)).toEqual(["Monday","Wednesday","Friday"]);
  });

  it("BJJ under age 9 returns empty", () => {
    expect(getEligibleSlots("bjj", 8)).toHaveLength(0);
  });

  it("Kickboxing returns 5 slots for ages 9+", () => {
    expect(getEligibleSlots("kickboxing", 9)).toHaveLength(5);
    expect(getEligibleSlots("kickboxing", 14)).toHaveLength(5);
    expect(getEligibleSlots("kickboxing", 30)).toHaveLength(5);
  });

  it("Kickboxing under age 9 returns empty", () => {
    expect(getEligibleSlots("kickboxing", 8)).toHaveLength(0);
    expect(getEligibleSlots("kickboxing", 5)).toHaveLength(0);
  });

  it("Afterschool and summer return empty (no trial calendar)", () => {
    expect(getEligibleSlots("afterschool", 8)).toHaveLength(0);
    expect(getEligibleSlots("summer", 8)).toHaveLength(0);
  });

  it("getUpcomingDates returns 4 future dates all on the correct weekday", () => {
    const slots = getEligibleSlots("kickboxing", 20);
    const satSlot = slots.find(s => s.day === "Saturday")!;
    const dates = getUpcomingDates(satSlot, 4);
    expect(dates).toHaveLength(4);
    for (const d of dates) {
      const day = new Date(d + "T12:00:00").getDay();
      expect(day).toBe(6); // Saturday
    }
  });

  it("formatDate produces readable string", () => {
    const result = formatDate("2026-06-01");
    expect(result).toMatch(/Mon/);
    expect(result).toMatch(/Jun/);
  });
});
