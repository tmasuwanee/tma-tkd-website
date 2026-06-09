/**
 * Resend Webhook Handler (2026-06-09)
 *
 * Receives real-time delivery events from Resend (bounce, complaint, delivered,
 * delivery_delayed) and writes them into MySQL so preSendGuard has live data.
 *
 * Registered as POST /api/resend-webhook in server/_core/index.ts.
 *
 * Resend signs every request with HMAC-SHA256. Set RESEND_WEBHOOK_SECRET in
 * Secrets to enable signature verification (strongly recommended in production).
 * Without it the endpoint still works but accepts unsigned requests.
 *
 * Resend dashboard setup:
 *   1. Go to resend.com → Webhooks → Add endpoint
 *   2. URL: https://tmatkd.com/api/resend-webhook
 *   3. Events: email.bounced, email.complained, email.delivered, email.delivery_delayed
 *   4. Copy the signing secret → add as RESEND_WEBHOOK_SECRET in project Secrets
 */

import type { Request, Response } from "express";
import crypto from "crypto";
import { getDb } from "./db";
import { leads, leadActivities, leadSequenceQueue } from "../drizzle/schema";
import { eq, and, inArray, like, sql } from "drizzle-orm";
import { logAudit } from "./db";
import { ENV } from "./_core/env";

// ── Resend event payload types ───────────────────────────────────────────────
interface ResendEmailEvent {
  type:
    | "email.bounced"
    | "email.complained"
    | "email.delivered"
    | "email.delivery_delayed";
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    bounce?: { type?: string; message?: string };
    complaint?: { feedback_type?: string };
  };
}

// ── Signature verification ───────────────────────────────────────────────────
function verifySignature(req: Request): boolean {
  const secret = ENV.resendWebhookSecret;
  if (!secret) {
    // No secret configured — accept all (dev/testing mode)
    return true;
  }
  const signature = req.headers["svix-signature"] as string | undefined;
  const msgId = req.headers["svix-id"] as string | undefined;
  const msgTimestamp = req.headers["svix-timestamp"] as string | undefined;
  if (!signature || !msgId || !msgTimestamp) return false;

  // Svix signing: HMAC-SHA256 of "{msgId}.{msgTimestamp}.{rawBody}"
  // rawBody must be the exact bytes Resend sent, not re-serialized JSON.
  // We read it from req.rawBody (set by express.raw middleware on this route)
  // or fall back to JSON.stringify(req.body) as a best-effort.
  const rawBody: string =
    (req as any).rawBody ?? JSON.stringify(req.body);
  const toSign = `${msgId}.${msgTimestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
    .update(toSign)
    .digest("base64");

  // Svix sends multiple signatures separated by spaces; accept if any matches
  return signature.split(" ").some((sig) => {
    const parts = sig.split(",");
    return parts.length === 2 && parts[1] === expected;
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function handleResendWebhook(req: Request, res: Response) {
  // Acknowledge immediately (Resend retries on non-2xx)
  res.status(200).json({ ok: true });

  if (!verifySignature(req)) {
    console.warn("[resend-webhook] Signature verification failed — ignoring event");
    await logAudit({
      level: "warn",
      source: "resend_webhook",
      event: "signature_failed",
      details: JSON.stringify({ headers: req.headers }),
    });
    return;
  }

  const event = req.body as ResendEmailEvent;
  const { type, data } = event;
  const recipientEmail = Array.isArray(data.to) ? data.to[0] : data.to;
  const emailId = data.email_id;

  if (!recipientEmail || !emailId) {
    console.warn("[resend-webhook] Missing recipient or email_id in payload");
    return;
  }

  const db = await getDb();
  if (!db) {
    console.error("[resend-webhook] DB not available");
    return;
  }

  // Look up lead by email
  const [leadRow] = await db
    .select()
    .from(leads)
    .where(sql`LOWER(${leads.email}) = ${recipientEmail.toLowerCase().trim()}`)
    .limit(1);

  if (!leadRow) {
    // Not a known lead — could be a test send or manual email; just log
    await logAudit({
      level: "info",
      source: "resend_webhook",
      event: `${type}_no_lead`,
      details: JSON.stringify({ emailId, recipientEmail }),
    });
    return;
  }

  const externalId = `resend_${type}_${emailId}`;

  // ── Handle each event type ─────────────────────────────────────────────────
  if (type === "email.bounced") {
    // 1. Write bounce activity (idempotent)
    try {
      await db.insert(leadActivities).values({
        leadId: leadRow.id,
        type: "email",
        direction: "outbound",
        subject: data.subject?.slice(0, 255) ?? null,
        body: `Hard bounce. Resend ID: ${emailId}. Bounce type: ${data.bounce?.type ?? "unknown"}. ${data.bounce?.message ?? ""}`.trim(),
        sentBy: "resend_webhook",
        status: "bounced",
        externalId,
      } as any);
    } catch (e: any) {
      if (e?.code !== "ER_DUP_ENTRY") throw e;
    }

    // 2. Block all future scheduled touches for this lead in this sequence
    //    (we don't know which sequence, so block ALL pending rows)
    await db
      .update(leadSequenceQueue)
      .set({
        status: "failed",
        failedAt: new Date(),
        failureReason: "hard_bounce",
      } as any)
      .where(
        and(
          eq(leadSequenceQueue.leadId, leadRow.id),
          inArray(leadSequenceQueue.status, ["scheduled", "pending"] as any[])
        )
      );

    await logAudit({
      level: "info",
      source: "resend_webhook",
      event: "email_bounced",
      leadId: leadRow.id,
      details: JSON.stringify({ emailId, recipientEmail, bounceType: data.bounce?.type }),
    });

    console.log(`[resend-webhook] BOUNCE: lead ${leadRow.id} (${recipientEmail}) — future touches blocked`);
  } else if (type === "email.complained") {
    // Spam complaint → pause automation immediately
    try {
      await db.insert(leadActivities).values({
        leadId: leadRow.id,
        type: "email",
        direction: "outbound",
        subject: data.subject?.slice(0, 255) ?? null,
        body: `Spam complaint. Resend ID: ${emailId}. Feedback: ${data.complaint?.feedback_type ?? "unknown"}`,
        sentBy: "resend_webhook",
        status: "complained",
        externalId,
      } as any);
    } catch (e: any) {
      if (e?.code !== "ER_DUP_ENTRY") throw e;
    }

    await db
      .update(leads)
      .set({
        automationPaused: 1,
        automationPausedAt: new Date(),
        automationPausedBy: "resend_webhook",
        automationPauseReason: `Spam complaint via Resend (${data.complaint?.feedback_type ?? "unknown"})`,
      } as any)
      .where(eq(leads.id, leadRow.id));

    await logAudit({
      level: "warn",
      source: "resend_webhook",
      event: "email_complained",
      leadId: leadRow.id,
      details: JSON.stringify({ emailId, recipientEmail, feedbackType: data.complaint?.feedback_type }),
    });

    console.log(`[resend-webhook] COMPLAINT: lead ${leadRow.id} (${recipientEmail}) — automation paused`);
  } else if (type === "email.delivered") {
    // Optional: update externalId on the matching activity row so we can cross-reference
    // (non-critical, just nice-to-have for audit trail)
    await logAudit({
      level: "info",
      source: "resend_webhook",
      event: "email_delivered",
      leadId: leadRow.id,
      details: JSON.stringify({ emailId, recipientEmail }),
    });
  } else if (type === "email.delivery_delayed") {
    await logAudit({
      level: "info",
      source: "resend_webhook",
      event: "email_delivery_delayed",
      leadId: leadRow.id,
      details: JSON.stringify({ emailId, recipientEmail }),
    });
  }
}
