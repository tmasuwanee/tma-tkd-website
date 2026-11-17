import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { phoneCellHtml } from "./integrations";
import { verifyCallToken, resolveCallSecret } from "./callConsole";
import type { Lead } from "../drizzle/schema";

const lead = { id: 990001, phone: "404-432-5858" } as unknown as Lead;
const KEYS = ["CALL_LINK_SECRET", "JWT_SECRET", "ADMIN_MAGIC_KEY", "RESEND_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.restoreAllMocks(); });

describe("staff email phone cell", () => {
  it("is just the tap-to-call number when no secret exists (and warns)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = phoneCellHtml(lead);
    expect(html).toContain('href="tel:+14044325858"');
    expect(html).not.toContain("/call/");
    expect(warn).toHaveBeenCalled();
  });

  it("with only the Resend key set (what production has), shows the number and four outcome buttons", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const html = phoneCellHtml(lead);
    expect(html).toContain('href="tel:+14044325858"');
    for (const [o, label] of [["answered", "Spoke with them"], ["voicemail", "Left a voicemail"], ["no_answer", "No answer"], ["not_interested", "Not interested"]]) {
      expect(html).toContain(`&o=${o}"`);
      expect(html).toContain(label);
    }
    expect(html).toContain("Open call page");
  });

  it("every link in the email carries a token that verifies for this lead only", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const html = phoneCellHtml(lead);
    const tokens = [...html.matchAll(/\/call\/990001\?t=([\w.-]+)/g)].map(m => m[1]);
    expect(tokens).toHaveLength(5);
    const secret = resolveCallSecret();
    for (const t of tokens) {
      expect(verifyCallToken(t, 990001, secret)).toBe(true);
      expect(verifyCallToken(t, 990002, secret)).toBe(false);
    }
  });

  it("escapes a hostile phone value", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const html = phoneCellHtml({ id: 1, phone: '"><script>alert(1)</script>' } as unknown as Lead);
    expect(html).not.toContain("<script>");
  });
});
