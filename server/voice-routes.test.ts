/**
 * Smoke test: validates VOICE_AGENT_SHARED_SECRET is set and that the
 * resolve-date logic works correctly (unit-level, no HTTP server needed).
 */
import { describe, it, expect } from "vitest";

// ── Inline the pure date-resolution logic so we can test it without starting Express ──
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveSpokenDate(
  spoken: string,
  reference?: string,
): { iso: string; human: string; weekday: string } | null {
  const ref = reference ? new Date(reference) : new Date();
  ref.setHours(12, 0, 0, 0);
  const s = spoken.toLowerCase().trim();
  const make = (d: Date) => ({
    iso: isoOf(d),
    human: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
  });

  if (s.includes("today")) return make(ref);
  if (s.includes("tomorrow")) {
    const t = new Date(ref);
    t.setDate(t.getDate() + 1);
    return make(t);
  }

  // "this saturday", "next monday", or bare weekday name
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (s.includes(WEEKDAYS[i])) {
      const isNext = s.includes("next");
      const d = new Date(ref);
      let diff = (i - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      if (isNext) diff = diff === 0 ? 7 : diff + (diff <= 0 ? 7 : 0);
      d.setDate(d.getDate() + diff);
      return make(d);
    }
  }

  // "june 14", "june 14th"
  for (let mi = 0; mi < MONTHS.length; mi++) {
    if (s.includes(MONTHS[mi])) {
      const dayMatch = s.match(/\d+/);
      if (dayMatch) {
        const d = new Date(ref);
        d.setMonth(mi, parseInt(dayMatch[0], 10));
        if (d < ref) d.setFullYear(d.getFullYear() + 1);
        return make(d);
      }
    }
  }

  // "6/14" or "6-14"
  const mdMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (mdMatch) {
    const d = new Date(ref);
    d.setMonth(parseInt(mdMatch[1], 10) - 1, parseInt(mdMatch[2], 10));
    if (d < ref) d.setFullYear(d.getFullYear() + 1);
    return make(d);
  }

  return null;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("VOICE_AGENT_SHARED_SECRET env var", () => {
  it("should be set and non-empty", () => {
    const secret = process.env.VOICE_AGENT_SHARED_SECRET;
    expect(secret).toBeTruthy();
    expect(secret!.length).toBeGreaterThan(10);
  });
});

describe("TMA_TELEGRAM env vars", () => {
  it("TMA_TELEGRAM_BOT_TOKEN should be set", () => {
    expect(process.env.TMA_TELEGRAM_BOT_TOKEN).toBeTruthy();
  });
  it("TMA_TELEGRAM_STAFF_CHAT_ID should be set", () => {
    expect(process.env.TMA_TELEGRAM_STAFF_CHAT_ID).toBeTruthy();
  });
});

describe("resolveSpokenDate (unit)", () => {
  // Use a fixed reference: Wednesday 2026-06-11 (noon UTC to avoid TZ edge)
  const REF = "2026-06-11T12:00:00Z";

  it("resolves 'today'", () => {
    const r = resolveSpokenDate("today", REF);
    // REF is noon UTC on Jun 11 → local date is Jun 11 in any tz >= UTC-12
    expect(r?.iso).toMatch(/^2026-06-1[12]$/);
  });

  it("resolves 'tomorrow'", () => {
    const r = resolveSpokenDate("tomorrow", REF);
    expect(r?.iso).toMatch(/^2026-06-1[23]$/);
  });

  it("resolves 'this Saturday'", () => {
    const r = resolveSpokenDate("this Saturday", REF);
    // From Wed Jun 11 the next Saturday is Jun 13
    expect(r?.iso).toBe("2026-06-13");
  });

  it("resolves 'Monday'", () => {
    const r = resolveSpokenDate("Monday", REF);
    // From Wed Jun 11 the next Monday is Jun 15
    expect(r?.iso).toBe("2026-06-15");
  });

  it("resolves 'June 20'", () => {
    const r = resolveSpokenDate("June 20", REF);
    expect(r?.iso).toBe("2026-06-20");
  });

  it("returns null for gibberish", () => {
    const r = resolveSpokenDate("blahblah", REF);
    expect(r).toBeNull();
  });
});
