/**
 * Pure rules for the one-tap "Call console" (staff email link -> call + notes + copy-ready texts).
 *
 * The link in a staff email carries a signed token that is good for ONE lead and expires. It is
 * deliberately NOT the admin login: if a forwarded email leaks, the finder can reach one lead's
 * call page, never the whole CRM. Nothing here touches the database, so it is unit tested in
 * callConsole.test.ts.
 */
import crypto from "crypto";
import type { Lead } from "../drizzle/schema";

export const CALL_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export const SITE_ORIGIN = "https://tmatkd.com";
export const TMA_PHONE_DISPLAY = "(770) 277-3009";
export const TRIAL_FORM_URL = `${SITE_ORIGIN}/free-class`;
export const TMA_ADDRESS = "2005 Lawrenceville Suwanee Rd, Suwanee, GA 30024";

export type CallOutcome = "answered" | "voicemail" | "no_answer" | "wrong_number" | "not_interested";
export const CALL_OUTCOMES: readonly CallOutcome[] = ["answered", "voicemail", "no_answer", "wrong_number", "not_interested"];

/**
 * Which secret signs the call links. Order: a dedicated CALL_LINK_SECRET, then JWT_SECRET, then a
 * key derived from ADMIN_MAGIC_KEY (already set wherever the Telegram one-tap links work; derived
 * through HMAC so the magic key itself is never used as the signing key and cannot be recovered
 * from a link). Returns "" when none is set, which makes links fail closed. Never a built-in
 * constant: a guessable default would let anyone forge a link.
 */
export function resolveCallSecret(env: { callLinkSecret?: string; jwtSecret?: string; adminMagicKey?: string } = {
  callLinkSecret: process.env.CALL_LINK_SECRET, jwtSecret: process.env.JWT_SECRET, adminMagicKey: process.env.ADMIN_MAGIC_KEY,
}): string {
  if (env.callLinkSecret) return env.callLinkSecret;
  if (env.jwtSecret) return env.jwtSecret;
  if (env.adminMagicKey) return crypto.createHmac("sha256", env.adminMagicKey).update("tma-call-link-v1").digest("hex");
  return "";
}

function sign(b64: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(b64).digest("base64url");
}

/** Token for one lead. Format: base64url("call|<leadId>|<expiryMs>") + "." + HMAC. */
export function signCallToken(leadId: number, secret: string, now = Date.now(), ttlMs = CALL_TOKEN_TTL_MS): string {
  const b64 = Buffer.from(`call|${leadId}|${now + ttlMs}`).toString("base64url");
  return `${b64}.${sign(b64, secret)}`;
}

/** True only if the token is authentic, unexpired, and was issued for exactly this lead. */
export function verifyCallToken(token: string | undefined | null, leadId: number, secret: string, now = Date.now()): boolean {
  if (!token || !secret || !Number.isInteger(leadId)) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const b64 = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(b64, secret));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  const [kind, idStr, expStr] = Buffer.from(b64, "base64url").toString("utf8").split("|");
  if (kind !== "call" || Number(idStr) !== leadId) return false;
  return Number(expStr) > now;
}

/** The link staff tap in the email. */
export function buildCallLink(leadId: number, secret: string, origin = SITE_ORIGIN): string {
  return `${origin}/call/${leadId}?t=${signCallToken(leadId, secret)}`;
}

/** "770-277-3009" / "(770) 277-3009" / "17702773009" -> "+17702773009". Anything odd is returned digits-only. */
export function telHref(phone: string): string {
  const d = (phone || "").replace(/\D/g, "");
  if (d.length === 10) return `tel:+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `tel:+${d}`;
  return `tel:${d}`;
}

/** Only an outcome that means "we reached a person" moves a brand-new lead forward. Never backwards. */
export function stageAfterCall(current: Lead["pipelineStage"], outcome: CallOutcome): Lead["pipelineStage"] | null {
  if (outcome === "answered" && current === "new_lead") return "contacted";
  return null;
}

export interface CallTemplate { id: string; label: string; text: string }

const BLANKISH = (v?: string | null) => !v || !v.trim() || v.trim().toUpperCase() === "N/A";
const firstWord = (s?: string | null) => (BLANKISH(s) ? "" : s!.trim().split(/\s+/)[0]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-16" -> "Nov 16". Falls back to the raw text if it is not that shape. */
export function friendlyDate(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

/** Ready-to-paste texts, filled with what we know. Plain text, no em dashes. */
export function callTemplates(lead: Pick<Lead, "parentName" | "kidName" | "trialClassDate" | "trialClassTime" | "trialClassDay">): CallTemplate[] {
  const parent = firstWord(lead.parentName);
  const hey = parent ? `Hey ${parent}` : "Hey";
  const kid = firstWord(lead.kidName);
  const kidOrYou = kid || "your child";

  const out: CallTemplate[] = [
    {
      id: "free_trial",
      label: "Free trial class + schedule form",
      text: `${hey}, this is Top Martial Arts in Suwanee. Here is the link to book ${kid ? `${kid}'s` : "your"} free trial class: ${TRIAL_FORM_URL} Pick the day and time that works best and we will see you on the mat!`,
    },
    {
      id: "near_suwanee",
      label: "Do you live near Suwanee?",
      text: `${hey}, this is Top Martial Arts. We saw you were interested in our martial arts programs. Do you live near Suwanee?`,
    },
    {
      id: "missed_you",
      label: "Tried calling (voicemail / no answer)",
      text: `${hey}, this is Top Martial Arts. I just tried to call about your interest in our martial arts programs. When is a good time to reach you? You can also book a free trial class here: ${TRIAL_FORM_URL}`,
    },
  ];

  if (!BLANKISH(lead.trialClassDate)) {
    const when = [lead.trialClassDay, friendlyDate(lead.trialClassDate), lead.trialClassTime ? `at ${lead.trialClassTime}` : ""].filter(Boolean).join(" ");
    out.push({
      id: "confirm_trial",
      label: "Confirm their trial class",
      text: `${hey}, just confirming ${kidOrYou} for a free trial class ${when} at Top Martial Arts, ${TMA_ADDRESS}. Reply here if anything changes!`,
    });
  }

  out.push(
    {
      id: "address",
      label: "Address",
      text: `${hey}, we are at ${TMA_ADDRESS}. Text or call ${TMA_PHONE_DISPLAY} if you have any questions.`,
    },
    {
      id: "reschedule",
      label: "We missed you, reschedule",
      text: `${hey}, we missed ${kidOrYou} at class. No worries, want to pick a new time? Here is the link: ${TRIAL_FORM_URL}`,
    },
  );
  return out;
}
