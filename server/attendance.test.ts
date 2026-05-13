import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("Attendance Kiosk", () => {
  it("should have ATTENDANCE_KIOSK_PASSWORD set", () => {
    expect(ENV.attendanceKioskPassword).toBeDefined();
    expect(typeof ENV.attendanceKioskPassword).toBe("string");
    expect(ENV.attendanceKioskPassword.length).toBeGreaterThan(0);
  });
});
