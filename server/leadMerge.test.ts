import { describe, it, expect } from "vitest";
import { planLeadMerge, returningLeadTitle, isFacebookLead, isPlaceholderEmail, parseTags, type TrialSubmission } from "./leadMerge";
import type { Lead } from "../drizzle/schema";

const NOW = new Date("2026-11-12T15:00:00Z");

/** A Facebook Instant Form lead as upsertLeadFromFacebook stores it. */
const fbLead = (over: Partial<Lead> = {}): Lead => ({
  id: 41, parentName: "Dana Ruiz", kidName: "", kidAge: "", programInterest: "summer_camp",
  motivation: null, email: "fblead-7705551212@meta.tma", phone: "770-555-1212", additionalNotes: null,
  pipelineStage: "new_lead", recordType: "prospect", trialPaidAmount: 0, internalNotes: null,
  trialClassDate: null, trialClassTime: null, trialClassDay: null,
  utmSource: "facebook", utmMedium: "lead_ad", utmCampaign: "Nov Trial", utmContent: null,
  tags: JSON.stringify(["facebook_lead"]), smsConsent: 0, smsConsentAt: null, smsConsentText: null,
  createdAt: new Date("2026-11-09T14:00:00Z"), updatedAt: new Date("2026-11-09T14:00:00Z"), ...over,
} as unknown as Lead);

const form = (over: Partial<TrialSubmission> = {}): TrialSubmission => ({
  parentName: "Dana Ruiz", kidName: "Mateo", kidAge: "8", programInterest: "taekwondo",
  email: "dana@example.com", phone: "(770) 555-1212",
  trialClassDate: "2026-11-16", trialClassTime: "5:50 PM", trialClassDay: "Monday",
  tags: [], smsConsentText: "I agree to texts", ...over,
});

describe("planLeadMerge: Facebook lead then website trial form", () => {
  it("keeps the same row: books the trial, advances the stage, fills child details", () => {
    const p = planLeadMerge(fbLead(), form(), "phone", NOW);
    expect(p.patch.trialClassDate).toBe("2026-11-16");
    expect(p.patch.trialClassTime).toBe("5:50 PM");
    expect(p.patch.trialClassDay).toBe("Monday");
    expect(p.patch.pipelineStage).toBe("trial_scheduled");
    expect(p.patch.kidName).toBe("Mateo");
    expect(p.patch.kidAge).toBe("8");
  });
  it("replaces the placeholder email with the real one", () => {
    expect(planLeadMerge(fbLead(), form(), "phone", NOW).upgradeEmailTo).toBe("dana@example.com");
  });
  it("a Facebook lead's guessed program is replaced by the one the person chose", () => {
    const p = planLeadMerge(fbLead(), form(), "phone", NOW);
    expect(p.patch.programInterest).toBe("taekwondo");
  });
  it("keeps the original Facebook attribution (first touch wins)", () => {
    const p = planLeadMerge(fbLead(), form({ utmSource: "website", utmCampaign: "other" }), "phone", NOW);
    expect(p.patch.utmSource).toBeUndefined();
    expect(p.patch.utmCampaign).toBeUndefined();
  });
  it("keeps the facebook tag and adds the new ones", () => {
    const p = planLeadMerge(fbLead(), form({ tags: ["trial_form"] }), "phone", NOW);
    expect(p.tags).toEqual(["facebook_lead", "trial_form"]);
  });
  it("says it was matched by phone", () => {
    expect(planLeadMerge(fbLead(), form(), "phone", NOW).changes[0]).toMatch(/Matched by phone/);
    expect(planLeadMerge(fbLead(), form(), "email", NOW).changes[0]).not.toMatch(/Matched by phone/);
  });
  it("records text consent only when it was not already given", () => {
    expect(planLeadMerge(fbLead(), form(), "phone", NOW).patch.smsConsent).toBe(1);
    const had = planLeadMerge(fbLead({ smsConsent: 1 } as Partial<Lead>), form(), "phone", NOW);
    expect(had.patch.smsConsent).toBeUndefined();
  });
});

describe("planLeadMerge: never damages existing data", () => {
  it("does not pull a later pipeline stage backwards", () => {
    for (const stage of ["trial_scheduled", "trial_paid", "trial_attended", "enrolled", "no_show", "lost"] as const) {
      const p = planLeadMerge(fbLead({ pipelineStage: stage } as Partial<Lead>), form(), "email", NOW);
      expect(p.patch.pipelineStage).toBeUndefined();
    }
  });
  it("contacted advances to trial_scheduled", () => {
    expect(planLeadMerge(fbLead({ pipelineStage: "contacted" } as Partial<Lead>), form(), "email", NOW).patch.pipelineStage).toBe("trial_scheduled");
  });
  it("does not overwrite a real child name, age or phone", () => {
    const p = planLeadMerge(fbLead({ kidName: "Leo", kidAge: "6" } as Partial<Lead>), form(), "email", NOW);
    expect(p.patch.kidName).toBeUndefined();
    expect(p.patch.kidAge).toBeUndefined();
    expect(p.patch.phone).toBeUndefined();
  });
  it("a non-Facebook lead keeps the program staff set, and the new interest is only reported", () => {
    const e = fbLead({ tags: JSON.stringify(["walk_in_manual"]), utmSource: null, programInterest: "kickboxing" } as Partial<Lead>);
    const p = planLeadMerge(e, form(), "email", NOW);
    expect(p.patch.programInterest).toBeUndefined();
    expect(p.changes.join(" ")).toMatch(/Also asked about: taekwondo/);
  });
  it("a real email that differs is kept in a note, not swapped in", () => {
    const e = fbLead({ email: "first@example.com" } as Partial<Lead>);
    const p = planLeadMerge(e, form({ email: "second@example.com" }), "phone", NOW);
    expect(p.upgradeEmailTo).toBeNull();
    expect(p.patch.additionalNotes).toMatch(/Second email on trial form: second@example.com/);
  });
  it("appends to existing notes instead of replacing them", () => {
    const e = fbLead({ additionalNotes: "Called Nov 10, left voicemail" } as Partial<Lead>);
    const p = planLeadMerge(e, form({ additionalNotes: "Prefers evenings" }), "email", NOW);
    expect(p.patch.additionalNotes).toBe("Called Nov 10, left voicemail\n[Trial form 2026-11-12] Prefers evenings");
  });
  it("a waiver-only or shop-order row that now asks for a class becomes a prospect", () => {
    expect(planLeadMerge(fbLead({ recordType: "form_only" } as Partial<Lead>), form(), "phone", NOW).patch.recordType).toBe("prospect");
    expect(planLeadMerge(fbLead({ recordType: "order" } as Partial<Lead>), form(), "phone", NOW).patch.recordType).toBe("prospect");
    expect(planLeadMerge(fbLead({ recordType: "enrolled" } as Partial<Lead>), form(), "phone", NOW).patch.recordType).toBeUndefined();
  });
  it("a submission with no trial date changes no trial fields or stage", () => {
    const p = planLeadMerge(fbLead(), form({ trialClassDate: undefined, trialClassTime: undefined, trialClassDay: undefined }), "email", NOW);
    expect(p.patch.trialClassDate).toBeUndefined();
    expect(p.patch.pipelineStage).toBeUndefined();
  });
});

describe("helpers", () => {
  it("detects placeholder emails", () => {
    expect(isPlaceholderEmail("fblead-7705551212@meta.tma")).toBe(true);
    expect(isPlaceholderEmail("walkin-7705551212@walkin.tma")).toBe(true);
    expect(isPlaceholderEmail("dana@example.com")).toBe(false);
  });
  it("detects Facebook leads by tag or by utm source", () => {
    expect(isFacebookLead({ tags: '["instant_form"]', utmSource: null })).toBe(true);
    expect(isFacebookLead({ tags: '["facebook_lead"]', utmSource: null })).toBe(true);
    expect(isFacebookLead({ tags: null, utmSource: "facebook" })).toBe(true);
    expect(isFacebookLead({ tags: '["walk_in_manual"]', utmSource: null })).toBe(false);
  });
  it("parseTags tolerates junk", () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags("not json")).toEqual([]);
    expect(parseTags('["a","b"]')).toEqual(["a", "b"]);
  });
  it("staff email titles name the origin", () => {
    expect(returningLeadTitle({ tags: '["facebook_lead"]', utmSource: "facebook" }, true).title).toBe("Facebook lead booked a trial class");
    expect(returningLeadTitle({ tags: null, utmSource: null }, true).title).toBe("Existing lead booked a trial class");
    expect(returningLeadTitle({ tags: null, utmSource: null }, false).title).toBe("Existing lead filled out the form again");
  });
});
