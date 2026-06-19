/**
 * Telegram staff reminders for TMA (scheduled endpoints).
 *
 * Triggered by Heartbeat crons (same pattern as morning-report):
 *   POST /api/scheduled/trial-reminders-am   (fire ~8:00 AM ET)
 *   POST /api/scheduled/trial-checkin-pm      (fire ~8:30 PM ET)
 *
 * AM: lists everyone scheduled to come in for a trial TODAY.
 * PM: reminds staff to mark whether today's trial leads showed up, with a
 *     direct link to the admin pipeline. Only pings if there are still-unmarked
 *     trials (leads left in trial_scheduled on today's date).
 *
 * "Showed up" is recorded by moving the lead out of trial_scheduled (to
 * trial_attended or no_show) in /admin/registrations.
 */
import type { Request, Response } from "express";
import { getLeadsByStagesAndTrialDate, getCallBoard, isAutomationEnabled, getActiveTrialsForReminders, markTrialReminderSent } from "./db";
import { sendTelegramMessage } from "./telegram";

// One-tap dashboard login from Telegram: append ?key=<ADMIN_MAGIC_KEY> so a tap
// logs staff in without a password (verified server-side). No key set = plain
// links (staff just log in normally).
const DASH_KEY = process.env.ADMIN_MAGIC_KEY ? `?key=${encodeURIComponent(process.env.ADMIN_MAGIC_KEY)}` : "";
const ADMIN_URL = `https://tmatkd.com/admin/checkin${DASH_KEY}`;
const CALLS_URL = `https://tmatkd.com/admin/calls${DASH_KEY}`;
const STUDENTS_URL = `https://tmatkd.com/admin/students${DASH_KEY}`;

/** Today's date in America/New_York as YYYY-MM-DD (matches stored trialClassDate). */
function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function fmtLead(l: any): string {
  const who = `${l.parentName}${l.kidName ? ` (${l.kidName})` : ""}`;
  const when = l.trialClassTime ? ` at ${l.trialClassTime}` : "";
  const prog = l.programInterest ? ` · ${l.programInterest}` : "";
  const phone = l.phone ? ` · ${l.phone}` : "";
  return `• ${who}${when}${prog}${phone}`;
}

// End-of-trial reminders: ping at 7, 3, 2, and 1 days before each active trial's end
// date, once per milestone (tracked in remindersSent so a milestone never repeats).
// Runs inside the 8am AM cron, so no separate schedule is needed.
async function fireTrialEndingReminders(): Promise<number> {
  const MILESTONES = [7, 3, 2, 1];
  let trials: any[] = [];
  try { trials = await getActiveTrialsForReminders(); }
  catch (err: any) { console.error("[trial-ending] query failed:", err?.message ?? err); return 0; }
  const todayMs = new Date(todayET() + "T12:00:00").getTime();
  let sent = 0;
  for (const t of trials) {
    if (!t.endDate) continue;
    const daysLeft = Math.round((new Date(t.endDate + "T12:00:00").getTime() - todayMs) / 86400000);
    if (!MILESTONES.includes(daysLeft)) continue;
    const already = (t.remindersSent || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (already.includes(String(daysLeft))) continue;
    const when = daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
    const msg =
      `⏳ <b>3-week trial ending ${when}</b>\n` +
      `${t.studentName}${t.programInterest ? ` · ${t.programInterest}` : ""}\n` +
      `Trial ends ${t.endDate}. Call them about signing up for a membership.\n\n` +
      `${STUDENTS_URL}`;
    const r = await sendTelegramMessage(msg);
    if (r.ok) {
      try { await markTrialReminderSent(t.id, daysLeft, t.remindersSent ?? null); sent++; }
      catch (e) { console.error("[trial-ending] mark failed:", e); }
    }
  }
  return sent;
}

export async function handleTrialRemindersAM(_req: Request, res: Response): Promise<void> {
  if (!(await isAutomationEnabled("telegram_reminders"))) { res.json({ ok: true, skipped: "paused" }); return; }
  const date = todayET();

  // (1) End-of-trial reminders (7/3/2/1 days before each trial ends). Runs every day,
  // independent of whether anyone is scheduled to come in today.
  const trialEndingReminders = await fireTrialEndingReminders();

  // (2) Trials scheduled to come in TODAY.
  let leads: any[] = [];
  try {
    leads = await getLeadsByStagesAndTrialDate(["trial_scheduled"], date);
  } catch (err: any) {
    console.error("[staff-reminders AM] query failed:", err?.message ?? err);
    res.status(500).json({ ok: false, error: "query_failed", trialEndingReminders });
    return;
  }
  let scheduledSent = false;
  if (leads.length > 0) {
    const msg =
      `🌅 <b>Trials scheduled today</b> (${leads.length})\n\n` +
      leads.map(fmtLead).join("\n") +
      `\n\nText/call to confirm if you want. Mark attendance tonight in the dashboard.`;
    const r = await sendTelegramMessage(msg);
    scheduledSent = r.ok;
  }
  res.json({ ok: true, scheduledToday: leads.length, scheduledSent, trialEndingReminders });
}

export async function handleTrialCheckinPM(_req: Request, res: Response): Promise<void> {
  if (!(await isAutomationEnabled("telegram_reminders"))) { res.json({ ok: true, skipped: "paused" }); return; }
  const date = todayET();
  let leads: any[] = [];
  try {
    // Still in trial_scheduled on today's date = not yet marked attended/no-show.
    leads = await getLeadsByStagesAndTrialDate(["trial_scheduled"], date);
  } catch (err: any) {
    console.error("[staff-reminders PM] query failed:", err?.message ?? err);
    res.status(500).json({ ok: false, error: "query_failed" });
    return;
  }
  if (leads.length === 0) {
    res.json({ ok: true, count: 0, sent: false });
    return;
  }
  const msg =
    `🌙 <b>Did they show?</b> ${leads.length} trial${leads.length > 1 ? "s" : ""} today still need marking:\n\n` +
    leads.map(fmtLead).join("\n") +
    `\n\nTap who showed up here: ${ADMIN_URL}\n` +
    `(One tap per kid: Showed up or No-show. Drives the right follow-up.)`;
  const r = await sendTelegramMessage(msg);
  res.json({ ok: true, count: leads.length, sent: r.ok });
}

/**
 * Daily call list (~8 AM ET cron). Telegrams the live call board's "today"
 * bucket (kid name first + the reason) with a link to /admin/calls. Respects
 * the kill switch.
 */
export async function handleDailyCallQueue(_req: Request, res: Response): Promise<void> {
  if (!(await isAutomationEnabled("daily_call_queue"))) { res.json({ ok: true, skipped: "paused" }); return; }
  try {
    const items = (await getCallBoard()).today;
    if (items.length === 0) {
      res.json({ ok: true, count: 0, sent: false });
      return;
    }
    const lines = items.map((it) => {
      const l: any = it.lead;
      const who = `${l.kidName || l.parentName}${l.kidName ? ` (${l.parentName})` : ""}`;
      return `• ${who} · ${l.phone}  [${it.reason}]`;
    });
    const msg =
      `📞 <b>Today's call list</b> (${items.length})\n\n` +
      lines.join("\n") +
      `\n\nWork them here: ${CALLS_URL}`;
    const r = await sendTelegramMessage(msg);
    res.json({ ok: true, count: items.length, sent: r.ok });
  } catch (err: any) {
    console.error("[daily-call-queue] failed:", err?.message ?? err);
    res.status(500).json({ ok: false, error: "failed" });
  }
}
