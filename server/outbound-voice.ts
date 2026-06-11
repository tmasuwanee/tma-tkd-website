/**
 * Outbound voice agent triggers for TMA.
 *
 * Cron-fired endpoints that find eligible leads and have the Retell OUTBOUND
 * agent call them. THREE jobs, all gated by:
 *   - kill switch (voice_agent_outbound)
 *   - calling hours (8 AM - 9 PM ET) — never call outside this
 *   - noOutboundCalls flag (person asked for a human)
 *   - per-lead dedup (don't re-call within a window)
 *
 *   POST /api/scheduled/outbound-speed-to-lead  (frequent, e.g. every 3 min)
 *   POST /api/scheduled/outbound-noshow          (daily)
 *   POST /api/scheduled/outbound-posttrial       (daily)
 *
 * Originating a call needs these env vars on the server:
 *   RETELL_API_KEY, RETELL_OUTBOUND_AGENT_ID, RETELL_OUTBOUND_FROM_NUMBER
 *
 * SAFETY: do NOT register the cron triggers until the outbound agent is tested.
 * The endpoints are deployed but inert until a cron fires them, and even then
 * the voice_agent_outbound kill switch can stop them instantly.
 */
import type { Request, Response } from "express";
import {
  isAutomationEnabled, getSpeedToLeadCandidates, getNoShowRecoveryCandidates,
  getPostTrialCandidates, getAfterschoolTourCandidates, hasOutboundAttempt,
  markOutboundAttempt,
} from "./db";

type Lead = any;
type CallType = "speed_to_lead" | "no_show" | "post_trial" | "afterschool_tour";

/** 8 AM - 9 PM America/New_York. */
function withinCallingHours(): boolean {
  const h = parseInt(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }), 10);
  return h >= 8 && h < 21;
}

function digitsOnly(s: string): string { return (s || "").replace(/\D/g, ""); }

/** Place one outbound call via Retell with the lead's context as dynamic vars. */
async function originate(lead: Lead, callType: CallType): Promise<boolean> {
  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_OUTBOUND_AGENT_ID;
  const fromNumber = process.env.RETELL_OUTBOUND_FROM_NUMBER;
  if (!apiKey || !agentId || !fromNumber) {
    console.warn("[outbound] missing RETELL_API_KEY / RETELL_OUTBOUND_AGENT_ID / RETELL_OUTBOUND_FROM_NUMBER");
    return false;
  }
  const toNumber = "+1" + digitsOnly(lead.phone).replace(/^1/, "");
  if (digitsOnly(lead.phone).length < 10) return false;
  try {
    const res = await fetch("https://api.retellai.com/v2/create-phone-call", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: toNumber,
        override_agent_id: agentId,
        retell_llm_dynamic_variables: {
          call_type: callType,
          lead_id: String(lead.id),
          parent_name: lead.parentName ?? "",
          student_name: lead.kidName ?? "",
          student_age: lead.kidAge ?? "",
          program: lead.programInterest ?? "",
          prev_trial_date: lead.trialClassDate ?? "",
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[outbound] create-phone-call ${res.status}: ${await res.text().catch(() => "")}`);
      return false;
    }
    await markOutboundAttempt(lead.id, callType);
    return true;
  } catch (err) {
    console.warn("[outbound] originate failed:", err);
    return false;
  }
}

async function runJob(
  res: Response, callType: CallType,
  getCandidates: () => Promise<Lead[]>, dedupHours: number, cap: number,
): Promise<void> {
  if (!(await isAutomationEnabled("voice_agent_outbound"))) { res.json({ ok: true, skipped: "paused" }); return; }
  if (!withinCallingHours()) { res.json({ ok: true, skipped: "outside_calling_hours" }); return; }
  let placed = 0, skipped = 0;
  try {
    const leads = await getCandidates();
    for (const lead of leads) {
      if (placed >= cap) break;
      if (await hasOutboundAttempt(lead.id, dedupHours)) { skipped++; continue; }
      const ok = await originate(lead, callType);
      if (ok) placed++; else skipped++;
    }
    res.json({ ok: true, callType, candidates: leads.length, placed, skipped });
  } catch (err: any) {
    console.error(`[outbound ${callType}] failed:`, err?.message ?? err);
    res.status(500).json({ ok: false, error: "failed" });
  }
}

export async function handleOutboundSpeedToLead(_req: Request, res: Response): Promise<void> {
  // New no-time leads from the last 30 min. Dedup 24h. Small cap per run.
  await runJob(res, "speed_to_lead", getSpeedToLeadCandidates, 24, 10);
}
export async function handleOutboundNoShow(_req: Request, res: Response): Promise<void> {
  await runJob(res, "no_show", getNoShowRecoveryCandidates, 48, 20);
}
export async function handleOutboundPostTrial(_req: Request, res: Response): Promise<void> {
  await runJob(res, "post_trial", getPostTrialCandidates, 72, 20);
}
export async function handleOutboundAfterschoolTour(_req: Request, res: Response): Promise<void> {
  // Fresh afterschool inquiries -> quick tour-booking call. Dedup 24h, small cap.
  await runJob(res, "afterschool_tour", getAfterschoolTourCandidates, 24, 10);
}
