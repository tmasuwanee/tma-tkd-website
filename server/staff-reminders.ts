/**
 * Telegram staff reminders for TMA (scheduled endpoints).
 *
 * Triggered by Heartbeat crons (same pattern as morning-report):
 *   POST /api/scheduled/trial-reminders-am   — fire ~8:00 AM ET
 *   POST /api/scheduled/trial-checkin-pm      — fire ~8:30 PM ET
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
import { getLeadsByStagesAndTrialDate, generateDailyCallQueue, listTodaysCalls, isAutomationEnabled } from "./db";
import { sendTelegramMessage } from "./telegram";

// One-tap dashboard login from Telegram: append ?key=<ADMIN_MAGIC_KEY> so a tap
// logs staff in without a password (verified server-side). No key set = plain
// links (staff just log in normally).
const DASH_KEY = process.env.ADMIN_MAGIC_KEY ? `?key=${encodeURIComponent(process.env.ADMIN_MAGIC_KEY)}` : "";
const ADMIN_URL = `https://tmatkd.com/admin/checkin${DASH_KEY}`;
const CALLS_URL = `https://tmatkd.com/admin/calls${DASH_KEY}`;

/** Today's date in America/New_York as YYYY-MM-DD (matches stored trialClassDate). */
function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function fmtLead(l: any): string {
  const who = `${l.parentName}${l.kidName ? ` (${l.kidName})` : ""}`;
  const when = l.trialClassTime ? ` at ${l.trialClassTime}` : "";
  const prog = l.programInterest ? ` — ${l.programInterest}` : "";
  const phone = l.phone ? ` — ${l.phone}` : "";
  return `• ${who}${when}${prog}${phone}`;
}

export async function handleTrialRemindersAM(_req: Request, res: Response): Promise<void> {
  if (!(await isAutomationEnabled("telegram_reminders"))) { res.json({ ok: true, skipped: "paused" }); return; }
  const date = todayET();
  let leads: any[] = [];
  try {
    leads = await getLeadsByStagesAndTrialDate(["trial_scheduled"], date);
  } catch (err: any) {
    console.error("[staff-reminders AM] query failed:", err?.message ?? err);
    res.status(500).json({ ok: false, error: "query_failed" });
    return;
  }
  if (leads.length === 0) {
    res.json({ ok: true, count: 0, sent: false });
    return;
  }
  const msg =
    `🌅 <b>Trials scheduled today</b> (${leads.length})\n\n` +
    leads.map(fmtLead).join("\n") +
    `\n\nText/call to confirm if you want. Mark attendance tonight in the dashboard.`;
  const r = await sendTelegramMessage(msg);
  res.json({ ok: true, count: leads.length, sent: r.ok });
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
 * Daily call queue generator (~8 AM ET cron). Scores leads, fills today's
 * call list (top 5), and Telegrams it with a link to /admin/calls. Replaces
 * the manual "Generate top 5" button. Respects the kill switch.
 */
export async function handleDailyCallQueue(_req: Request, res: Response): Promise<void> {
  if (!(await isAutomationEnabled("daily_call_queue"))) { res.json({ ok: true, skipped: "paused" }); return; }
  try {
    await generateDailyCallQueue({ limit: 5 });
    const rows = await listTodaysCalls();
    const pending = rows.filter((r: any) => r.status === "pending");
    if (pending.length === 0) {
      res.json({ ok: true, count: 0, sent: false });
      return;
    }
    const lines = pending.map((r: any) => {
      const l = r.lead;
      if (!l) return `• (lead #${r.leadId})`;
      return `• ${l.parentName}${l.kidName ? ` (${l.kidName})` : ""} — ${l.phone}  [${r.vertical || "lead"}, score ${r.score}]`;
    });
    const msg =
      `📞 <b>Today's call list</b> (${pending.length})\n\n` +
      lines.join("\n") +
      `\n\nWork them here: ${CALLS_URL}`;
    const r = await sendTelegramMessage(msg);
    res.json({ ok: true, count: pending.length, sent: r.ok });
  } catch (err: any) {
    console.error("[daily-call-queue] failed:", err?.message ?? err);
    res.status(500).json({ ok: false, error: "failed" });
  }
}
