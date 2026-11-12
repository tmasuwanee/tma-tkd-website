/**
 * Pure rules for folding a second form submission into a lead that already exists.
 *
 * Why this exists: a person can reach TMA twice (a Facebook Instant Form first, then the
 * website free-trial form that staff text them). Both must land in ONE row of `leads`, keep
 * the original source (Facebook), and add the new facts (the trial class they booked).
 * Nothing here touches the database, so every rule is unit tested in leadMerge.test.ts.
 */
import type { Lead } from "../drizzle/schema";

export type MatchedBy = "email" | "phone";

/** What the website form sent. Only the fields the merge cares about. */
export interface TrialSubmission {
  parentName: string;
  kidName: string;
  kidAge: string;
  programInterest: string;
  motivation?: string | null;
  email?: string | null;          // a REAL email the person typed, or null/empty
  phone: string;
  additionalNotes?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  trialClassDate?: string | null;
  trialClassTime?: string | null;
  trialClassDay?: string | null;
  tags?: string[];
  smsConsentText?: string | null;
}

export interface MergePlan {
  /** Columns to write on the existing row. Empty object = nothing to change. */
  patch: Partial<Pick<Lead,
    | "kidName" | "kidAge" | "programInterest" | "motivation" | "additionalNotes" | "phone"
    | "pipelineStage" | "recordType"
    | "trialClassDate" | "trialClassTime" | "trialClassDay"
    | "utmSource" | "utmMedium" | "utmCampaign" | "utmContent"
    | "smsConsent" | "smsConsentAt" | "smsConsentText">>;
  /** Replace a placeholder email (fblead-...@meta.tma) with this real one, if it is not taken. */
  upgradeEmailTo: string | null;
  tags: string[];
  /** Plain-English lines: what this submission added or changed. Shown to staff and logged. */
  changes: string[];
}

const PLACEHOLDER_EMAIL = /@(meta|walkin|voice|no-email)\.tma$/i;
const BLANKISH = (v?: string | null) => !v || !v.trim() || v.trim().toUpperCase() === "N/A";

export function isPlaceholderEmail(email?: string | null): boolean {
  return !!email && PLACEHOLDER_EMAIL.test(email);
}

export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || !raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

export function isFacebookLead(lead: Pick<Lead, "tags" | "utmSource">): boolean {
  const tags = parseTags(lead.tags);
  return tags.includes("instant_form") || tags.includes("facebook_lead") || /facebook|meta|instagram|fb/i.test(lead.utmSource ?? "");
}

export function planLeadMerge(existing: Lead, input: TrialSubmission, matchedBy: MatchedBy, now = new Date()): MergePlan {
  const patch: MergePlan["patch"] = {};
  const changes: string[] = [];
  const fromFacebook = isFacebookLead(existing);

  // Trial booking: the whole point of the second form.
  if (input.trialClassDate) {
    patch.trialClassDate = input.trialClassDate;
    if (input.trialClassTime) patch.trialClassTime = input.trialClassTime;
    if (input.trialClassDay) patch.trialClassDay = input.trialClassDay;
    changes.push(`Booked a trial class: ${[input.trialClassDay, input.trialClassDate, input.trialClassTime].filter(Boolean).join(" ")}`);
    // Advance only from the very start of the pipeline. Never pull a later stage backwards.
    if (existing.pipelineStage === "new_lead" || existing.pipelineStage === "contacted") {
      patch.pipelineStage = "trial_scheduled";
      changes.push("Stage moved to trial scheduled");
    }
  }

  // A waiver or a shop order row that now asks for a class becomes a real prospect again.
  if (existing.recordType === "form_only" || existing.recordType === "order") {
    patch.recordType = "prospect";
  }

  // Fill blanks (Instant Forms often have no child name or age). Never overwrite real data.
  if (BLANKISH(existing.kidName) && !BLANKISH(input.kidName)) { patch.kidName = input.kidName; changes.push(`Child name: ${input.kidName}`); }
  if (BLANKISH(existing.kidAge) && !BLANKISH(input.kidAge)) { patch.kidAge = input.kidAge; changes.push(`Child age: ${input.kidAge}`); }
  if (BLANKISH(existing.motivation) && !BLANKISH(input.motivation)) patch.motivation = input.motivation!;
  if (BLANKISH(existing.phone) && !BLANKISH(input.phone)) patch.phone = input.phone;

  // Program: a Facebook lead's program is a guess from the ad (default "summer_camp"), so the
  // program the person just chose on the form wins. For anyone else keep what staff have, and
  // just report the new interest.
  const newProgram = (input.programInterest || "").trim();
  if (newProgram && newProgram.toLowerCase() !== (existing.programInterest || "").trim().toLowerCase()) {
    if (fromFacebook || BLANKISH(existing.programInterest)) {
      patch.programInterest = newProgram;
      changes.push(`Program: ${newProgram}${existing.programInterest ? ` (was ${existing.programInterest})` : ""}`);
    } else {
      changes.push(`Also asked about: ${newProgram}`);
    }
  }

  // Notes: append, never replace what staff or the first form wrote.
  const noteBits: string[] = [];
  if (!BLANKISH(input.additionalNotes)) noteBits.push(String(input.additionalNotes).trim());
  const typedEmail = (input.email ?? "").trim().toLowerCase();
  let upgradeEmailTo: string | null = null;
  if (typedEmail && typedEmail !== (existing.email || "").toLowerCase()) {
    if (isPlaceholderEmail(existing.email)) {
      upgradeEmailTo = typedEmail;
      changes.push(`Email added: ${typedEmail}`);
    } else {
      noteBits.push(`Second email on trial form: ${typedEmail}`);
      changes.push(`Different email on the form: ${typedEmail} (kept ${existing.email})`);
    }
  }
  if (noteBits.length) {
    const stamp = now.toISOString().slice(0, 10);
    const add = `[Trial form ${stamp}] ${noteBits.join(" | ")}`;
    patch.additionalNotes = existing.additionalNotes ? `${existing.additionalNotes}\n${add}` : add;
  }

  // First touch wins: only fill attribution that is still empty.
  if (!existing.utmSource && input.utmSource) patch.utmSource = input.utmSource;
  if (!existing.utmMedium && input.utmMedium) patch.utmMedium = input.utmMedium;
  if (!existing.utmCampaign && input.utmCampaign) patch.utmCampaign = input.utmCampaign;
  if (!existing.utmContent && input.utmContent) patch.utmContent = input.utmContent;

  // Text consent: only ever add it.
  if (!existing.smsConsent && input.smsConsentText) {
    patch.smsConsent = 1;
    patch.smsConsentAt = now;
    patch.smsConsentText = input.smsConsentText;
    changes.push("Text consent recorded");
  }

  const tags = Array.from(new Set([...parseTags(existing.tags), ...(input.tags ?? [])]));

  if (matchedBy === "phone") changes.unshift("Matched by phone number (the email on the form was different)");
  return { patch, upgradeEmailTo, tags, changes };
}

/** Title for the staff email about someone who was already in the system. */
export function returningLeadTitle(lead: Pick<Lead, "tags" | "utmSource">, bookedTrial: boolean): { emoji: string; title: string } {
  const origin = isFacebookLead(lead) ? "Facebook lead" : "Existing lead";
  return bookedTrial
    ? { emoji: "📅", title: `${origin} booked a trial class` }
    : { emoji: "🔁", title: `${origin} filled out the form again` };
}
