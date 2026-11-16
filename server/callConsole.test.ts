import { describe, it, expect } from "vitest";
import {
  signCallToken, verifyCallToken, buildCallLink, telHref, stageAfterCall, callTemplates, friendlyDate,
  CALL_TOKEN_TTL_MS, TRIAL_FORM_URL,
} from "./callConsole";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;

describe("call link token", () => {
  it("accepts a fresh token for the same lead", () => {
    expect(verifyCallToken(signCallToken(41, SECRET, NOW), 41, SECRET, NOW + 1000)).toBe(true);
  });
  it("rejects a token used on a different lead", () => {
    expect(verifyCallToken(signCallToken(41, SECRET, NOW), 42, SECRET, NOW + 1000)).toBe(false);
  });
  it("rejects an expired token", () => {
    const t = signCallToken(41, SECRET, NOW);
    expect(verifyCallToken(t, 41, SECRET, NOW + CALL_TOKEN_TTL_MS + 1)).toBe(false);
    expect(verifyCallToken(t, 41, SECRET, NOW + CALL_TOKEN_TTL_MS - 1)).toBe(true);
  });
  it("rejects a tampered signature or payload", () => {
    const t = signCallToken(41, SECRET, NOW);
    expect(verifyCallToken(t.slice(0, -2) + "xx", 41, SECRET, NOW)).toBe(false);
    const [b64, sig] = t.split(".");
    const forged = Buffer.from(`call|41|${NOW + 10 * CALL_TOKEN_TTL_MS}`).toString("base64url");
    expect(verifyCallToken(`${forged}.${sig}`, 41, SECRET, NOW)).toBe(false);
    expect(b64).toBeTruthy();
  });
  it("rejects a token signed with another secret, and junk", () => {
    expect(verifyCallToken(signCallToken(41, "other", NOW), 41, SECRET, NOW)).toBe(false);
    for (const junk of [undefined, null, "", "abc", ".", "a.b"]) expect(verifyCallToken(junk as any, 41, SECRET, NOW)).toBe(false);
  });
  it("an admin-style token cannot be used as a call token", () => {
    const b64 = Buffer.from(`tmasuwanee@gmail.com|${NOW + 1000}`).toString("base64url");
    const crypto = require("crypto");
    const sig = crypto.createHmac("sha256", SECRET).update(b64).digest("base64url");
    expect(verifyCallToken(`${b64}.${sig}`, 41, SECRET, NOW)).toBe(false);
  });
  it("refuses to verify with an empty secret", () => {
    expect(verifyCallToken(signCallToken(41, "", NOW), 41, "", NOW)).toBe(false);
  });
  it("builds a link on the site with the lead id and token", () => {
    const link = buildCallLink(41, SECRET);
    expect(link).toMatch(/^https:\/\/tmatkd\.com\/call\/41\?t=[\w-]+\.[\w-]+$/);
  });
});

describe("telHref", () => {
  it("normalizes common US formats", () => {
    expect(telHref("770-277-3009")).toBe("tel:+17702773009");
    expect(telHref("(770) 277-3009")).toBe("tel:+17702773009");
    expect(telHref("17702773009")).toBe("tel:+17702773009");
  });
});

describe("stageAfterCall", () => {
  it("moves a new lead to contacted only when someone answered", () => {
    expect(stageAfterCall("new_lead", "answered")).toBe("contacted");
    for (const o of ["voicemail", "no_answer", "wrong_number", "not_interested"] as const) expect(stageAfterCall("new_lead", o)).toBeNull();
  });
  it("never moves a later stage", () => {
    for (const s of ["contacted", "trial_scheduled", "enrolled", "lost", "no_show"] as const) expect(stageAfterCall(s, "answered")).toBeNull();
  });
});

describe("callTemplates", () => {
  const lead = { parentName: "Dana Ruiz", kidName: "Mateo", trialClassDate: null, trialClassTime: null, trialClassDay: null };
  it("has the two texts staff asked for, with the form link", () => {
    const t = callTemplates(lead);
    const trial = t.find(x => x.id === "free_trial")!;
    expect(trial.text).toContain(TRIAL_FORM_URL);
    expect(trial.text).toContain("Mateo's");
    expect(t.find(x => x.id === "near_suwanee")!.text).toBe("Hey Dana, this is Top Martial Arts. We saw you were interested in our martial arts programs. Do you live near Suwanee?");
  });
  it("only offers the confirm text when a trial is booked, and formats it", () => {
    expect(callTemplates(lead).some(x => x.id === "confirm_trial")).toBe(false);
    const c = callTemplates({ ...lead, trialClassDate: "2026-11-16", trialClassTime: "5:50 PM", trialClassDay: "Monday" }).find(x => x.id === "confirm_trial")!;
    expect(c.text).toContain("Monday Nov 16 at 5:50 PM");
  });
  it("copes with missing names and Facebook N/A child names", () => {
    const t = callTemplates({ ...lead, parentName: "", kidName: "N/A" });
    expect(t[1].text.startsWith("Hey, this is")).toBe(true);
    expect(t[0].text).toContain("your free trial class");
  });
  it("never uses em or en dashes", () => {
    const all = callTemplates({ ...lead, trialClassDate: "2026-11-16", trialClassTime: "5:50 PM", trialClassDay: "Monday" }).map(x => x.text).join(" ");
    expect(all).not.toMatch(/[–—]/);
  });
  it("friendlyDate handles odd input", () => {
    expect(friendlyDate("2026-11-16")).toBe("Nov 16");
    expect(friendlyDate("next week")).toBe("next week");
    expect(friendlyDate(null)).toBe("");
  });
});
