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
 */
import type { Express, Request, Response } from "express";
import { getEligibleSlots, getNextDateForSlot, formatDate, type ClassSlot } from "../shared/classSchedule";
import { createLead, recordOutboundCall, getLeadContextForCall } from "./db";
import { sendTelegramMessage } from "./telegram";

const CALLS_URL = "https://tmatkd.com/admin/calls";

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
      if ((program === "kickboxing" || program === "bjj") && age < 9) {
        hint = age === 8
          ? " An eight year old can do a trial class first to see if it is a good fit."
          : " Those classes start at age nine.";
      } else if (program === "taekwondo" && age >= 4 && age <= 5) {
        hint = " For ages four and five we have Little Tigers Taekwondo.";
      }
      res.json({ result: `I don't have a ${program} class for age ${age}.${hint}`, slots: [] });
      return;
    }
    const enriched = slots.map(sl => ({ day: sl.day, startTime: sl.startTime, nextDate: getNextDateForSlot(sl), nextDateHuman: formatDate(getNextDateForSlot(sl)) }));
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

      const dateHuman = (() => { try { return formatDate(dateIso); } catch { return dateIso; } })();
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
      console.error("[voice book-trial] error:", err?.message ?? err);
      // Likely a duplicate email (unique constraint) or DB issue — fall back to a human.
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
}
