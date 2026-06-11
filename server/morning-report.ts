/**
 * Morning Report Handler (2026-06-09)
 *
 * Fires daily at 11:30 AM ET (15:30 UTC) via a Heartbeat cron.
 * Collects blast health metrics and sends them to the project owner
 * via notifyOwner().
 *
 * Metrics reported:
 *  - Bounce rate (bounced / total sent activities)
 *  - Complaint rate (complained / total sent)
 *  - automationPaused leads count (STOP replies + complaints)
 *  - New enrollments since 5 PM ET previous day (pipeline bumped to enrolled)
 *  - Upcoming day_3 send count (leads still eligible)
 *
 * Registered as POST /api/scheduled/morning-report in server/_core/index.ts.
 */

import type { Request, Response } from "express";
import { getDb } from "./db";
import { leads, leadActivities, leadSequenceQueue } from "../drizzle/schema";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

export async function handleMorningReport(req: Request, res: Response) {
  // Respond immediately so the platform doesn't retry
  res.json({ ok: true, message: "Morning report queued" });

  try {
    await generateAndSendMorningReport();
  } catch (err) {
    console.error("[morning-report] Error:", err);
  }
}

export async function generateAndSendMorningReport(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("[morning-report] DB not available");
    return;
  }

  // ── 1. Bounce rate ─────────────────────────────────────────────────────────
  // Count all outbound email activities
  const [totalSentResult] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM leadActivities WHERE type = 'email' AND direction = 'outbound' AND status = 'sent'`
  ) as unknown as [Array<{ cnt: number }>];
  const totalSent = Number(totalSentResult?.[0]?.cnt ?? 0);

  const [bouncedResult] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM leadActivities WHERE type = 'email' AND direction = 'outbound' AND status = 'bounced'`
  ) as unknown as [Array<{ cnt: number }>];
  const totalBounced = Number(bouncedResult?.[0]?.cnt ?? 0);

  const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(2) : "0.00";

  // ── 2. Complaint rate ──────────────────────────────────────────────────────
  const [complainedResult] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM leadActivities WHERE type = 'email' AND direction = 'outbound' AND status = 'complained'`
  ) as unknown as [Array<{ cnt: number }>];
  const totalComplaints = Number(complainedResult?.[0]?.cnt ?? 0);
  const complaintRate = totalSent > 0 ? ((totalComplaints / totalSent) * 100).toFixed(3) : "0.000";

  // ── 3. automationPaused count ──────────────────────────────────────────────
  const [pausedResult] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM leads WHERE automationPaused = 1`
  ) as unknown as [Array<{ cnt: number }>];
  const pausedCount = Number(pausedResult?.[0]?.cnt ?? 0);

  // ── 4. New enrollments since 5 PM ET yesterday ────────────────────────────
  // 5 PM ET = 21:00 UTC (EDT) or 22:00 UTC (EST)
  // Using 21:00 UTC as the cutoff (conservative)
  const yesterday5pmUTC = new Date();
  yesterday5pmUTC.setUTCHours(21, 0, 0, 0);
  if (yesterday5pmUTC > new Date()) {
    yesterday5pmUTC.setDate(yesterday5pmUTC.getDate() - 1);
  }
  const cutoffIso = yesterday5pmUTC.toISOString().slice(0, 19).replace('T', ' ');

  const [enrolledResult] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM leads 
        WHERE pipelineStage = 'enrolled' 
          AND updatedAt >= ${cutoffIso}`
  ) as unknown as [Array<{ cnt: number }>];
  const newEnrollments = Number(enrolledResult?.[0]?.cnt ?? 0);

  // ── 5. Day_3 eligible count ────────────────────────────────────────────────
  // Leads with a scheduled day_3 touch that haven't bounced/paused
  const [day3Result] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM leadSequenceQueue q
        JOIN leads l ON l.id = q.leadId
        WHERE q.sequenceKey = 'summer_camp_nurture'
          AND q.touchKey = 'day_3_spots_filling'
          AND q.status = 'scheduled'
          AND l.automationPaused = 0
          AND l.pipelineStage NOT IN ('enrolled', 'lost')`
  ) as unknown as [Array<{ cnt: number }>];
  const day3Eligible = Number(day3Result?.[0]?.cnt ?? 0);

  // ── 6. Today's day_0 summary (if run recently) ────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [day0TodayResult] = await db.execute(
    sql`SELECT status, COUNT(*) as cnt 
        FROM leadSequenceQueue 
        WHERE sequenceKey = 'summer_camp_nurture' 
          AND touchKey = 'day_0_camp_overview'
          AND DATE(sentAt) = ${today}
        GROUP BY status`
  ) as unknown as [Array<{ status: string; cnt: number }>];

  const day0Summary = (day0TodayResult ?? [])
    .map((r: { status: string; cnt: number }) => `${r.status}: ${r.cnt}`)
    .join(", ") || "no sends today";

  // ── 7. Build and send the report ──────────────────────────────────────────
  const reportDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });

  const reportTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });

  const bounceStatus = parseFloat(bounceRate) > 5
    ? `⚠️ ${bounceRate}% (HIGH — above 5% threshold)`
    : `✅ ${bounceRate}%`;

  const complaintStatus = parseFloat(complaintRate) > 0.1
    ? `🚨 ${complaintRate}% (CRITICAL — above 0.1% threshold)`
    : parseFloat(complaintRate) > 0
    ? `⚠️ ${complaintRate}% (non-zero)`
    : `✅ ${complaintRate}%`;

  const enrollmentLine = newEnrollments > 0
    ? `🎉 ${newEnrollments} new enrollment${newEnrollments > 1 ? "s" : ""} since 5 PM yesterday`
    : `0 new enrollments since 5 PM yesterday`;

  const content = `📊 TMA Summer Camp Blast — Morning Report
${reportDate} at ${reportTime}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📧 EMAIL HEALTH
  Bounce rate:     ${bounceStatus}
  Complaint rate:  ${complaintStatus}
  Total sent:      ${totalSent.toLocaleString()} emails
  Total bounced:   ${totalBounced}
  Total complaints: ${totalComplaints}

🚫 AUTOMATION PAUSED
  ${pausedCount} lead${pausedCount !== 1 ? "s" : ""} with automationPaused=1
  (STOP replies + spam complaints)

💰 CONVERSIONS
  ${enrollmentLine}

📅 DAY_3 READINESS (fires Jun 12)
  ${day3Eligible} leads eligible for day_3_spots_filling touch
  ${day3Eligible === 0 ? "⚠️ No leads scheduled — check enqueueSequenceForLead ran for new leads" : ""}

📤 TODAY'S SENDS
  day_0 (today): ${day0Summary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action items:
${parseFloat(bounceRate) > 5 ? "• URGENT: Bounce rate above 5% — clean list before day_3\n" : ""}${parseFloat(complaintRate) > 0.1 ? "• CRITICAL: Complaint rate above 0.1% — pause sends immediately\n" : ""}${pausedCount > 0 ? `• ${pausedCount} lead(s) opted out — verify automationPaused leads in admin\n` : ""}${day3Eligible === 0 ? "• Day_3 has 0 eligible leads — verify sequence enrollment\n" : ""}${parseFloat(bounceRate) <= 5 && parseFloat(complaintRate) <= 0.1 && day3Eligible > 0 ? "• All metrics healthy — day_3 is clear to fire on Jun 12\n" : ""}`.trim();

  await notifyOwner({
    title: `Morning Report: ${bounceStatus.startsWith("⚠️") ? "⚠️ " : ""}TMA Camp Blast Health`,
    content,
  });

  console.log(`[morning-report] Sent. bounce=${bounceRate}% complaints=${complaintRate}% paused=${pausedCount} enrollments=${newEnrollments} day3=${day3Eligible}`);
}
