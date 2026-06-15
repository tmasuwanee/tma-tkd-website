/**
 * Voice agent backend tools (Retell custom functions) for TMA.
 *
 * The Retell agent calls these endpoints as its tools. Each is shared-secret
 * protected (header `x-voice-secret` or body.secret == VOICE_AGENT_SHARED_SECRET).
 * Following project_voice_agent_production_patterns.md:
 *  - resolve_date does ALL date math server-side (the LLM never computes dates).
 *  - check_availability gates by age + program via the website's own schedule.
 *  - book_trial / route_to_human write to the same leads pipeline as the website.
 *
 * Each endpoint returns { result: "<spoken text>" } (what Retell voices) plus
 * any structured fields the agent may use.
 *
 * Routes:
 *   POST /api/voice/resolve-date       { spoken_date, reference? }
 *   POST /api/voice/check-availability { program, age }
 *   POST /api/voice/book-trial         { caller_name, phone, email, student_name, student_age, program, date_iso, time }
 *   POST /api/voice/route-to-human     { caller_name, phone, reason, email? }
 *   POST /api/voice/notify-pickup      { parent_name, child_name, program? }
 *   POST /api/voice/lead-context       { lead_id }                         (outbound)
 *   POST /api/voice/log-call-outcome   { lead_id, outcome, summary, booked, asked_about } (outbound)
 *   POST /api/voice/schedule-retry     { lead_id, when, reason }           (outbound)
 *   POST /api/voice/request-human-followup { lead_id, reason }             (outbound)
 */
import type { Express, Request, Response } from "express";
import { getEligibleSlots, getNextDateForSlot, formatDateSpoken, type ClassSlot } from "../shared/classSchedule";
import { createLead, recordOutboundCall, getLeadContextForCall, setNoOutboundCalls,
  upsertCallLog, getCallLog, findLeadIdByPhone, getLeadNameById,
  getLeadByEmail, recordReturningParentTrial, applyProgramTag,
  recordLifecycleTransition } from "./db";
import { sendTelegramMessage } from "./telegram";

// One-tap dashboard login from Telegram: append ?key=<ADMIN_MAGIC_KEY> (verified
// server-side). No key set = plain links.
const DASH_KEY = process.env.ADMIN_MAGIC_KEY ? `?key=${encodeURIComponent(process.env.ADMIN_MAGIC_KEY)}` : "";
const CALLS_URL = `https://tmatkd.com/admin/calls${DASH_KEY}`;
const CALL_LOG_URL = `https://tmatkd.com/admin/call-log${DASH_KEY}`;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

function authed(req: Request): boolean {
  const expected = process.env.VOICE_AGENT_SHARED_SECRET;
  if (!expected) return false;
  // Accept the secret via header, body, OR query (?secret=) so the Retell tool
  // can send it whichever way it supports.
  const got = (req.headers["x-voice-secret"] as string)
    || (req.body && req.body.secret)
    || (req.query && (req.query.secret as string))
    || "";
  return got === expected;
}

/**
 * Retell custom-function tools deliver their arguments nested under `body.args`
 * (per the voice-agent production patterns). Direct callers (curl, tests) send
 * args at the top level. Read from whichever is present.
 */
function argsOf(req: Request): any {
  const b = req.body ?? {};
  return (b && typeof b.args === "object" && b.args) ? b.args : b;
}

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function humanOf(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/**
 * Server-side date resolution. The agent passes the caller's raw words; we
 * compute the exact future date. Handles: today, tomorrow, weekday names,
 * "this/next <weekday>", "<month> <day>", "M/D". Returns null if unparseable.
 */
function resolveSpokenDate(spoken: string, reference?: string): { iso: string; human: string; weekday: string } | null {
  const ref = reference ? new Date(reference) : new Date();
  ref.setHours(12, 0, 0, 0); // noon to avoid TZ edge shifts
  const s = spoken.toLowerCase().trim();

  const make = (d: Date) => ({ iso: isoOf(d), human: humanOf(d), weekday: d.toLocaleDateString("en-US", { weekday: "long" }) });

  if (s.includes("today")) return make(ref);
  if (s.includes("tomorrow")) { const d = new Date(ref); d.setDate(d.getDate() + 1); return make(d); }

  // Weekday names
  const wdIdx = WEEKDAYS.findIndex(w => s.includes(w));
  if (wdIdx >= 0) {
    const d = new Date(ref);
    const todayIdx = d.getDay();
    let diff = (wdIdx - todayIdx + 7) % 7;
    if (diff === 0) diff = 7;            // same weekday -> next week (no same-day trials)
    if (s.includes("next") && diff < 7) diff += 7;
    d.setDate(d.getDate() + diff);
    return make(d);
  }

  // "<month> <day>" e.g. "june 14", "june 14th"
  const monthIdx = MONTHS.findIndex(m => s.includes(m));
  if (monthIdx >= 0) {
    const dayMatch = s.match(/(\d{1,2})/);
    if (dayMatch) {
      const day = parseInt(dayMatch[1], 10);
      let year = ref.getFullYear();
      let d = new Date(year, monthIdx, day, 12, 0, 0, 0);
      if (d < ref) { year += 1; d = new Date(year, monthIdx, day, 12, 0, 0, 0); }
      if (d.getMonth() === monthIdx) return make(d);
    }
  }

  // "M/D" or "M-D"
  const md = s.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (md) {
    const mo = parseInt(md[1], 10) - 1;
    const day = parseInt(md[2], 10);
    let year = ref.getFullYear();
    let d = new Date(year, mo, day, 12, 0, 0, 0);
    if (d < ref) { year += 1; d = new Date(year, mo, day, 12, 0, 0, 0); }
    if (d.getMonth() === mo) return make(d);
  }

  return null;
}

function digitsOnly(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export function registerVoiceRoutes(app: Express): void {
  // ─── Retell call webhook: Telegram ping on EVERY call + store transcript ────
  // Set as each agent's webhook_url with ?secret=VOICE_AGENT_SHARED_SECRET.
  // Retell fires call_started / call_ended / call_analyzed; we act on
  // call_analyzed (carries the summary + transcript). Covers inbound AND
  // outbound, whether or not any tool fired during the call.
  app.post("/api/voice/retell-webhook", async (req: Request, res: Response) => {
    if ((req.query?.secret as string) !== process.env.VOICE_AGENT_SHARED_SECRET) {
      res.status(401).json({ ok: false }); return;
    }
    const body = req.body ?? {};
    const event = body.event ?? body.event_type;
    const call = body.call ?? body.data ?? {};
    if (event !== "call_analyzed") { res.json({ ok: true, ignored: event }); return; }
    try {
      const callId = String(call.call_id ?? call.callId ?? "");
      if (!callId) { res.json({ ok: true, skipped: "no call_id" }); return; }
      const direction = (call.direction === "outbound" ? "outbound" : "inbound") as "inbound" | "outbound";
      const dyn = call.retell_llm_dynamic_variables ?? {};
      const analysis = call.call_analysis ?? {};
      const custom = analysis.custom_analysis_data ?? {};
      const fromNumber = String(call.from_number ?? "");
      const toNumber = String(call.to_number ?? "");
      const durMs = Number(call.duration_ms ?? ((call.end_timestamp ?? 0) - (call.start_timestamp ?? 0))) || 0;
      const durationSec = durMs > 0 ? Math.round(durMs / 1000) : null;

      // Resolve lead + caller name (so the dashboard shows a real name, not blank).
      let leadId: number | null = null;
      const dynLead = parseInt(String(dyn.lead_id ?? ""), 10);
      if (!isNaN(dynLead)) leadId = dynLead;
      else if (direction === "inbound") leadId = await findLeadIdByPhone(fromNumber);
      let callerName = String(custom.caller_name ?? dyn.parent_name ?? "").trim();
      if (!callerName && leadId) callerName = (await getLeadNameById(leadId)) ?? "";
      if (!callerName) callerName = direction === "inbound" ? (fromNumber || "Unknown caller") : "";

      const summary = String(analysis.call_summary ?? "").trim();
      const transcript = String(call.transcript ?? "").trim();
      const booked = (custom.booked === true || custom.booked === "true" || String(custom.intent ?? "").includes("book")) ? 1 : 0;

      // 1) Telegram on every call (skip if we already pinged for this callId).
      const existing = await getCallLog(callId);
      if (!existing) {
        const mins = durationSec ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : "";
        const head = direction === "outbound"
          ? `📞 <b>Outbound call</b>${dyn.call_type ? ` (${dyn.call_type})` : ""}${mins ? ` · ${mins}` : ""}`
          : `📞 <b>Inbound call</b>${mins ? ` · ${mins}` : ""}`;
        const who = `${callerName || "Unknown"}${(fromNumber && direction === "inbound") ? ` · ${fromNumber}` : ""}`;
        void sendTelegramMessage(
          `${head}\n${who}\n` +
          (summary ? `${summary}\n` : "(no summary captured)\n") +
          (booked ? "✅ Booked a trial\n" : "") +
          `Full log: ${CALL_LOG_URL}`
        );
      }

      // 2) Persist (idempotent upsert by callId; webhook retries are safe).
      await upsertCallLog({
        callId, agentId: String(call.agent_id ?? ""), direction,
        fromNumber, toNumber, callerName: callerName || null, leadId: leadId ?? null,
        summary: summary || null, transcript: transcript || null,
        recordingUrl: call.recording_url ? String(call.recording_url) : null,
        durationSec, disconnectReason: call.disconnection_reason ? String(call.disconnection_reason) : null,
        sentiment: analysis.user_sentiment ? String(analysis.user_sentiment) : null,
        intent: custom.intent ? String(custom.intent) : null, booked,
        startedAt: call.start_timestamp ? new Date(Number(call.start_timestamp)) : null,
      } as any);

      // 3) Auto-update the matched lead from what the call revealed. Both steps
      //    are best-effort and idempotent — never block the webhook ack.
      if (leadId) {
        // a) Tag by program so the Leads view can filter (outbound sets dyn.program;
        //    inbound may surface it in custom_analysis_data).
        const programHint = String(custom.program ?? dyn.program ?? "").trim();
        if (programHint) {
          try { await applyProgramTag(leadId, programHint); }
          catch (e: any) { console.warn("[retell-webhook] applyProgramTag failed:", e?.message ?? e); }
        }
        // b) Advance the funnel stage when the call booked a trial. Uses the legal
        //    state machine: a no-op if already trial_scheduled, and intentionally
        //    rejected (caught below) for leads past that point — we never drag an
        //    enrolled or trial-attended student backward off a stray "booked" flag.
        if (booked) {
          try {
            await recordLifecycleTransition({
              leadId, toStage: "trial_scheduled",
              triggeredBy: `voice_${direction}`,
              reason: "Auto-staged from call summary (agent booked a trial).",
            });
          } catch (e: any) {
            console.warn("[retell-webhook] auto-stage skipped:", e?.message ?? e);
          }
        }
      }

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[retell-webhook] error:", err?.message ?? err);
      res.json({ ok: false }); // 200 so Retell doesn't hammer retries
    }
  });

  // ─── Outbound TEST trigger (staff QA) ──────────────────────────────────────
  // Passcode-gated. Places ONE outbound test call to the phone given, with a
  // chosen call_type, so staff can QA the outbound agent on their own phone.
  // Powers /admin/voice-test. Does NOT touch the crons or real leads.
  app.post("/api/voice/test-outbound", async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (String(b.passcode ?? "") !== process.env.VOICE_AGENT_SHARED_SECRET) {
      res.status(401).json({ ok: false, error: "Wrong passcode." }); return;
    }
    const callType = String(b.call_type ?? b.callType ?? "");
    const valid = ["speed_to_lead", "no_show", "post_trial", "afterschool_tour"];
    if (!valid.includes(callType)) { res.status(400).json({ ok: false, error: "Invalid scenario." }); return; }
    const digits = String(b.phone ?? "").replace(/\D/g, "").replace(/^1/, "");
    if (digits.length !== 10) { res.status(400).json({ ok: false, error: "Enter a 10-digit US phone number." }); return; }
    const toNumber = "+1" + digits;
    const apiKey = process.env.RETELL_API_KEY;
    const agentId = process.env.RETELL_OUTBOUND_AGENT_ID;
    const fromNumber = process.env.RETELL_OUTBOUND_FROM_NUMBER;
    if (!apiKey || !agentId || !fromNumber) {
      res.status(503).json({ ok: false, error: "Outbound is not configured on the server yet (RETELL_OUTBOUND_* env)." }); return;
    }
    const vars: Record<string, string> = {
      call_type: callType, lead_id: "0",
      parent_name: String(b.name ?? "there").slice(0, 60),
      student_name: "Jordan", student_age: "8", program: "taekwondo",
    };
    if (callType === "no_show") vars.prev_trial_date = "this past Monday";
    if (callType === "post_trial") vars.prev_trial_date = "a few days ago";
    if (callType === "afterschool_tour") vars.program = "afterschool";
    try {
      const r = await fetch("https://api.retellai.com/v2/create-phone-call", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from_number: fromNumber, to_number: toNumber, override_agent_id: agentId, retell_llm_dynamic_variables: vars }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) { res.status(502).json({ ok: false, error: `Retell error ${r.status}` }); return; }
      res.json({ ok: true, callType });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: String(err?.message ?? err) });
    }
  });

  // ─── resolve_date ──────────────────────────────────────────────────────────
  app.post("/api/voice/resolve-date", (req: Request, res: Response) => {
    if (!authed(req)) { res.status(401).json({ result: "Unauthorized" }); return; }
    const a = argsOf(req);
    const spoken = String(a.spoken_date ?? a.spokenDate ?? "");
    const reference = a.reference ? String(a.reference) : undefined;
    const r = resolveSpokenDate(spoken, reference);
    if (!r) {
      res.json({ result: "I couldn't catch that date. Could you say it another way, like a weekday or a month and day?", resolved: false });
      return;
    }
    res.json({ result: `That would be ${r.human}.`, resolved: true, iso: r.iso, human: r.human, weekday: r.weekday });
  });

  // ─── check_availability ────────────────────────────────────────────────────
  app.post("/api/voice/check-availability", (req: Request, res: Response) => {
    if (!authed(req)) { res.status(401).json({ result: "Unauthorized" }); return; }
    const a = argsOf(req);
    const program = String(a.program ?? "").toLowerCase().trim();
    const age = parseInt(String(a.age ?? ""), 10);
    if (!program || isNaN(age)) {
      res.json({ result: "I need the program and the student's age to check class times.", slots: [] });
      return;
    }
    const slots: ClassSlot[] = getEligibleSlots(program, age);
    if (slots.length === 0) {
      // Helpful redirect by age for the common cases
      let hint = "";
      if ((program === "kickboxing" || program === "bjj") && age < 8) {
        // age 8 now returns real slots (trial-for-fit); this only fires under 8.
        hint = " The youngest we usually start kickboxing or BJJ is eight. Taekwondo is a great fit at this age, and our staff can talk kickboxing through if you're really set on it.";
      } else if (program === "taekwondo" && age >= 4 && age <= 5) {
        hint = " For ages four and five we have Little Tigers Taekwondo.";
      }
      res.json({ result: `I don't have a ${program} class for age ${age}.${hint}`, slots: [] });
      return;
    }
    const enriched = slots.map(sl => ({ day: sl.day, startTime: sl.startTime, nextDate: getNextDateForSlot(sl), nextDateHuman: formatDateSpoken(getNextDateForSlot(sl)) }));
    const spoken = enriched.slice(0, 4).map(e => `${e.day} at ${e.startTime}`).join(", ");
    res.json({ result: `We have classes ${spoken}.`, slots: enriched });
  });

  // ─── book_trial ────────────────────────────────────────────────────────────
  app.post("/api/voice/book-trial", async (req: Request, res: Response) => {
    if (!authed(req)) { res.status(401).json({ result: "Unauthorized" }); return; }
    const b = argsOf(req);
    const callerName = String(b.caller_name ?? b.callerName ?? "").trim();
    const phone = digitsOnly(String(b.phone ?? ""));
    const email = String(b.email ?? "").toLowerCase().trim();
    const studentName = String(b.student_name ?? b.studentName ?? callerName).trim();
    const studentAge = String(b.student_age ?? b.studentAge ?? "").trim();
    const program = String(b.program ?? "").toLowerCase().trim();
    const dateIso = String(b.date_iso ?? b.dateIso ?? "").trim();
    const time = String(b.time ?? "").trim();

    if (!callerName || phone.length < 10 || !email || !program || !dateIso) {
      res.json({ result: "I'm missing some details to book that. Let me have a staff member call you back.", booked: false });
      return;
    }
    const dateHuman = (() => { try { return formatDateSpoken(dateIso); } catch { return dateIso; } })();
    try {
      const leadId = await createLead({
        parentName: callerName,
        kidName: studentName || callerName,
        kidAge: studentAge || "n/a",
        programInterest: program,
        email,
        phone,
        pipelineStage: "trial_scheduled",
        trialClassDate: dateIso,
        trialClassTime: time || null,
        utmSource: "phone",
        utmMedium: "inbound_call",
        tags: JSON.stringify(["inbound_call", "voice_agent"]),
      } as any);

      void sendTelegramMessage(
        `📞 <b>New trial booked by voice agent</b>\n` +
        `Student: ${studentName} (age ${studentAge || "?"})\n` +
        `Program: ${program}\n` +
        `When: ${dateHuman} ${time}\n` +
        `Parent: ${callerName} — ${phone}\n` +
        `Email: ${email}\n` +
        `Lead #${leadId}`
      );
      res.json({ result: `You're all set. I've booked the trial for ${dateHuman}${time ? " at " + time : ""}. We'll see ${studentName} then.`, booked: true, leadId });
    } catch (err: any) {
      // A unique-email error usually means a RETURNING parent (e.g. booking a
      // second child). Don't fail — update their existing lead, note the new
      // child so siblings both get booked, and ping staff to confirm both.
      try {
        const existing = await getLeadByEmail(email);
        if (existing) {
          await recordReturningParentTrial({
            leadId: existing.id, studentName, studentAge, program,
            dateIso, time: time || null, existingNotes: existing.internalNotes,
          });
          void sendTelegramMessage(
            `📞 <b>Trial booked (returning parent / 2nd child)</b>\n` +
            `Student: ${studentName} (age ${studentAge || "?"})\n` +
            `Program: ${program}\nWhen: ${dateHuman} ${time}\n` +
            `Parent: ${callerName} — ${phone}\n` +
            `Already lead #${existing.id}. Please confirm BOTH children's trials.`
          );
          res.json({ result: `You're all set, I've got ${studentName} down for ${dateHuman}${time ? " at " + time : ""} too. We'll see them then.`, booked: true, leadId: existing.id });
          return;
        }
      } catch (e2: any) {
        console.error("[voice book-trial] returning-parent update failed:", e2?.message ?? e2);
      }
      console.error("[voice book-trial] error:", err?.message ?? err);
      void sendTelegramMessage(`⚠️ Voice agent tried to book a trial but the save failed for ${callerName} (${phone}). Please call them back.`);
      res.json({ result: "I had trouble saving that. I'll have a staff member call you back to confirm the trial.", booked: false });
    }
  });

  // ─── route_to_human ────────────────────────────────────────────────────────
  app.post("/api/voice/route-to-human", async (req: Request, res: Response) => {
    if (!authed(req)) { res.status(401).json({ result: "Unauthorized" }); return; }
    const b = argsOf(req);
    const callerName = String(b.caller_name ?? b.callerName ?? "Unknown caller").trim();
    const phone = digitsOnly(String(b.phone ?? ""));
    const reason = String(b.reason ?? "wants a callback").trim();
    const email = String(b.email ?? "").toLowerCase().trim() || `callback-${phone || Date.now()}@voice.tma`;

    // Telegram alert is the primary action — staff see it immediately.
    void sendTelegramMessage(
      `🔔 <b>Voice agent — callback requested</b>\n` +
      `Name: ${callerName}\n` +
      `Phone: ${phone || "(not given)"}\n` +
      `Reason: ${reason}\n` +
      `Please call or text them back.`
    );

    // Best-effort: also create a lead so it shows in the CRM pipeline.
    try {
      if (phone.length >= 10) {
        await createLead({
          parentName: callerName,
          kidName: callerName,
          kidAge: "n/a",
          programInterest: "callback",
          email,
          phone,
          pipelineStage: "new_lead",
          additionalNotes: `Voice agent callback request: ${reason}`,
          utmSource: "phone",
          utmMedium: "inbound_call",
          tags: JSON.stringify(["inbound_call", "callback_requested"]),
        } as any);
      }
    } catch (err: any) {
      // Non-fatal; the Telegram alert already went out.
      console.warn("[voice route-to-human] lead create failed (non-fatal):", err?.message ?? err);
    }

    res.json({ result: "I'll put a note down and a staff member will call or text you back as soon as possible." });
  });

  // ─── notify_pickup ─────────────────────────────────────────────────────────
  // Parent is outside to pick up a child from afterschool/camp and got the
  // agent. Fire an URGENT Telegram so staff send the child down immediately.
  app.post("/api/voice/notify-pickup", (req: Request, res: Response) => {
    if (!authed(req)) { res.status(401).json({ result: "Unauthorized" }); return; }
    const b = argsOf(req);
    const parentName = String(b.parent_name ?? b.parentName ?? "A parent").trim();
    const childName = String(b.child_name ?? b.childName ?? "their child").trim();
    const program = String(b.program ?? "").trim();
    void sendTelegramMessage(
      `🚨 <b>PICKUP — send the child down now</b>\n` +
      `${parentName} is outside to pick up <b>${childName}</b>${program ? ` (${program})` : ""}.\n` +
      `Please send them down immediately.`
    );
    res.json({ result: `Thank you. I'm letting staff know right now to send ${childName} down. They'll be right out.` });
  });

  // ─── get_lead_context (outbound) ───────────────────────────────────────────
  // Outbound agent reads this at the start of a call so it knows who it is
  // talking to (parent vs student), the student's age/program, and prior trial.
  app.post("/api/voice/lead-context", async (req: Request, res: Response) => {
    if (!authed(req)) { res.status(401).json({ result: "Unauthorized" }); return; }
    const a = argsOf(req);
    const leadId = parseInt(String(a.lead_id ?? a.leadId ?? ""), 10);
    if (isNaN(leadId)) { res.json({ result: "No lead id provided.", found: false }); return; }
    const ctx = await getLeadContextForCall(leadId);
    if (!ctx) { res.json({ result: "I couldn't find that lead.", found: false }); return; }
    res.json({ found: true, ...ctx });
  });

  // ─── log_call_outcome (outbound) ───────────────────────────────────────────
  // Called at the end of every outbound call. Writes the result + summary to
  // /admin/calls and the lead timeline, and Telegrams staff with a link.
  app.post("/api/voice/log-call-outcome", async (req: Request, res: Response) => {
    if (!authed(req)) { res.status(401).json({ result: "Unauthorized" }); return; }
    const b = argsOf(req);
    const leadId = parseInt(String(b.lead_id ?? b.leadId ?? ""), 10);
    const status = String(b.outcome ?? b.status ?? "answered").trim();
    const summary = String(b.summary ?? "").trim();
    const booked = b.booked === true || b.booked === "true";
    const askedAbout = String(b.asked_about ?? b.askedAbout ?? "").trim();
    const validOutcomes = ["answered", "voicemail", "no_answer", "booked", "not_interested", "callback_later", "skipped"];
    const outcome = (booked ? "booked" : (validOutcomes.includes(status) ? status : "answered")) as any;
    if (isNaN(leadId)) { res.json({ result: "No lead id.", logged: false }); return; }
    try {
      const fullSummary = [summary, askedAbout ? `Asked about: ${askedAbout}` : ""].filter(Boolean).join(" — ");
      await recordOutboundCall({ leadId, status: outcome, summary: fullSummary || outcome, calledBy: "voice_agent_outbound" });
      const ctx = await getLeadContextForCall(leadId);
      const who = ctx ? `${ctx.parentName || ctx.studentName || ("lead #" + leadId)}` : `lead #${leadId}`;
      void sendTelegramMessage(
        `📞 <b>Outbound call: ${outcome}</b>\n` +
        `${who}${ctx?.studentName ? ` (${ctx.studentName})` : ""}\n` +
        (fullSummary ? `${fullSummary}\n` : "") +
        `${booked ? "✅ Booked a trial\n" : ""}` +
        `Details: ${CALLS_URL}`
      );
      res.json({ result: "Logged.", logged: true });
    } catch (err: any) {
      console.error("[voice log-call-outcome] error:", err?.message ?? err);
      res.json({ result: "Could not log.", logged: false });
    }
  });

  // ─── schedule_retry (outbound) ─────────────────────────────────────────────
  // Caller asked to be called back later, or is not ready. Logs the request +
  // alerts staff. The escalating retry CADENCE (1 min, then 12pm/2pm/4pm/6pm on
  // following days) is driven by the n8n outbound scheduler, not the agent.
  app.post("/api/voice/schedule-retry", async (req: Request, res: Response) => {
    if (!authed(req)) { res.status(401).json({ result: "Unauthorized" }); return; }
    const b = argsOf(req);
    const leadId = parseInt(String(b.lead_id ?? b.leadId ?? ""), 10);
    const when = String(b.when ?? "later").trim();
    const reason = String(b.reason ?? "caller asked to be reached later").trim();
    if (isNaN(leadId)) { res.json({ result: "No lead id.", logged: false }); return; }
    try {
      await recordOutboundCall({ leadId, status: "callback_later", summary: `Retry: ${when}. ${reason}`, calledBy: "voice_agent_outbound" });
      const ctx = await getLeadContextForCall(leadId);
      void sendTelegramMessage(
        `🔁 <b>Callback requested</b>\n` +
        `${ctx?.parentName || ctx?.studentName || ("lead #" + leadId)} — call back ${when}.\n` +
        `Reason: ${reason}`
      );
      res.json({ result: `Got it, we'll reach back ${when}.`, logged: true });
    } catch (err: any) {
      console.error("[voice schedule-retry] error:", err?.message ?? err);
      res.json({ result: "Noted.", logged: false });
    }
  });

  // ─── request_human_followup (outbound) ─────────────────────────────────────
  // The person on an OUTBOUND call asked to deal with a human instead of the
  // bot. Set noOutboundCalls so the outbound voice scheduler stops calling them,
  // and alert staff to call them personally. Does NOT touch inbound/email/SMS.
  app.post("/api/voice/request-human-followup", async (req: Request, res: Response) => {
    if (!authed(req)) { res.status(401).json({ result: "Unauthorized" }); return; }
    const a = argsOf(req);
    const leadId = parseInt(String(a.lead_id ?? a.leadId ?? ""), 10);
    const reason = String(a.reason ?? "asked for a human").trim();
    if (isNaN(leadId)) { res.json({ result: "No lead id.", set: false }); return; }
    try {
      await setNoOutboundCalls(leadId, true);
      await recordOutboundCall({ leadId, status: "callback_later", summary: `Wants a human (no more bot calls): ${reason}`, calledBy: "voice_agent_outbound" });
      const ctx = await getLeadContextForCall(leadId);
      void sendTelegramMessage(
        `🙋 <b>Wants a human</b>\n` +
        `${ctx?.parentName || ctx?.studentName || ("lead #" + leadId)}${ctx?.phone ? ` — ${ctx.phone}` : ""}\n` +
        `Reason: ${reason}\n` +
        `The bot will stop calling them. Please call them personally. They're now top of the call list: ${CALLS_URL}`
      );
      res.json({ result: "Understood, a real person will reach out to you. We won't keep calling you with the assistant.", set: true });
    } catch (err: any) {
      console.error("[voice request-human-followup] error:", err?.message ?? err);
      res.json({ result: "Noted.", set: false });
    }
  });
}
