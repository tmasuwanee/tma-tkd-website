/**
 * REST API routes (non-tRPC)
 *
 * These endpoints are consumed by n8n, Claude, and external services
 * that prefer plain HTTP GET/POST over tRPC.
 *
 * Routes:
 *   GET  /api/leads                  — bulk lead query by stage(s), optional trial date filter
 *   GET  /api/leads/:leadId/status   — lead pipeline stage for n8n pre-send checks
 *   PATCH /api/leads/:leadId/stage   — update a lead's pipeline stage (used by n8n no-show workflow)
 *   GET  /api/ads/insights?days=N    — Facebook ad performance data from MySQL
 *   POST /api/ads/sync               — manually trigger a Facebook Marketing API pull
 */

import type { Express, Request, Response } from "express";
import { getLeadById, getLeadsByStages, updateLeadStage, getAutomationControls, isAutomationEnabled, createLeadActivity, getLeadActivities, setLeadFollowUp } from "./db";
import {
  verifyCallToken, callTemplates, telHref, stageAfterCall, CALL_OUTCOMES, TMA_PHONE_DISPLAY, type CallOutcome,
} from "./callConsole";
import { isFacebookLead } from "./leadMerge";
import { getAdInsights, syncAdInsights } from "./facebook-ads";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE_MS, ADMIN_EMAILS, signAdminToken } from "./admin-auth";

const VALID_STAGES = [
  "new_lead", "contacted", "trial_scheduled", "trial_paid",
  "trial_attended", "enrolled", "no_show", "no_show_final", "lost",
] as const;

type PipelineStage = typeof VALID_STAGES[number];

export function registerApiRoutes(app: Express): void {
  // ─── Bulk leads query ──────────────────────────────────────────────────────
  // Used by the n8n Trial No-Show Recovery workflow (daily 9 AM check).
  // GET /api/leads?stages=new_lead,contacted&hasTrialDate=true
  app.get("/api/leads", async (req: Request, res: Response) => {
    const stagesParam = (req.query.stages as string) ?? "new_lead";
    const hasTrialDate = req.query.hasTrialDate === "true";
    const stages = stagesParam.split(",").map(s => s.trim()).filter(s =>
      (VALID_STAGES as readonly string[]).includes(s)
    ) as PipelineStage[];
    if (stages.length === 0) {
      res.status(400).json({ error: `stages must be one or more of: ${VALID_STAGES.join(", ")}` });
      return;
    }
    const result = await getLeadsByStages(stages, hasTrialDate);
    res.json(result);
  });

  // ─── Lead status endpoint ──────────────────────────────────────────────────
  // n8n calls this before sending follow-up emails to avoid contacting
  // leads who have already responded, enrolled, or been marked as lost.
  app.get("/api/leads/:leadId/status", async (req: Request, res: Response) => {
    const leadId = parseInt(req.params.leadId, 10);
    if (isNaN(leadId)) {
      res.status(400).json({ error: "Invalid leadId" });
      return;
    }
    const lead = await getLeadById(leadId);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json({
      leadId: lead.id,
      stage: lead.pipelineStage,
      pipelineStage: lead.pipelineStage,  // alias — workflows reference both names
      // Lead Conductor (2026-05-19): expose fields the Sequence Dispatcher needs
      email: lead.email,
      phone: lead.phone,
      parentName: lead.parentName,
      kidName: lead.kidName,
      automationPaused: lead.automationPaused === 1,  // tinyint → boolean
      automationPauseReason: lead.automationPauseReason ?? null,
      trialClassDate: lead.trialClassDate ?? null,
      updatedAt: lead.updatedAt?.toISOString() ?? new Date().toISOString(),
    });
  });

  // ─── Dashboard magic-link verification ─────────────────────────────────────
  // Telegram staff messages link to /admin/...?key=<ADMIN_MAGIC_KEY>. The client
  // posts that key here and we check it against the env secret (which never ships
  // in the JS bundle), so a tap from Telegram logs staff in without a password.
  // Fail-safe: if ADMIN_MAGIC_KEY is unset, this always returns { ok: false }.
  app.post("/api/admin/verify-key", (req: Request, res: Response) => {
    const key = String((req.body && req.body.key) ?? "");
    const expected = process.env.ADMIN_MAGIC_KEY ?? "";
    const ok = !!expected && key.length > 0 && key === expected;
    // Establish a real server session on a valid magic-key tap (Phase 1 auth).
    if (ok) {
      res.cookie(ADMIN_COOKIE, signAdminToken(ADMIN_EMAILS[0]), {
        ...getSessionCookieOptions(req), maxAge: ADMIN_COOKIE_MAX_AGE_MS,
      });
    }
    res.json({ ok });
  });

  // ─── Admin password login (Phase 1 auth) ───────────────────────────────────
  // Verify the shared credentials SERVER-side and set the signed httpOnly admin
  // session cookie. The browser no longer self-certifies; the cookie is what the
  // admin tRPC gate checks (once ADMIN_AUTH_ENFORCE=true).
  app.post("/api/admin/login", (req: Request, res: Response) => {
    const email = String((req.body && req.body.email) ?? "").trim().toLowerCase();
    const password = String((req.body && req.body.password) ?? "");
    if (ADMIN_EMAILS.includes(email) && password === ENV.adminPassword) {
      res.cookie(ADMIN_COOKIE, signAdminToken(email), {
        ...getSessionCookieOptions(req), maxAge: ADMIN_COOKIE_MAX_AGE_MS,
      });
      res.json({ ok: true, email });
    } else {
      res.status(401).json({ ok: false });
    }
  });

  app.post("/api/admin/logout", (req: Request, res: Response) => {
    res.clearCookie(ADMIN_COOKIE, getSessionCookieOptions(req));
    res.json({ ok: true });
  });

  // ─── Call console (one-tap call from the staff email) ──────────────────────
  // The staff email links to /call/<leadId>?t=<signed token>. The token is good for that ONE
  // lead and expires in 14 days (see callConsole.ts), so a leaked email never opens the whole
  // CRM. Fails closed when no signing secret is configured.
  const CALL_LABEL: Record<CallOutcome, string> = {
    answered: "Spoke with them", voicemail: "Left a voicemail", no_answer: "No answer",
    wrong_number: "Wrong number", not_interested: "Not interested",
  };
  async function callAuth(req: Request, res: Response) {
    const leadId = parseInt(req.params.leadId, 10);
    const token = String(req.query.t ?? "");
    if (isNaN(leadId) || !verifyCallToken(token, leadId, ENV.cookieSecret)) {
      res.status(401).json({ error: "This link has expired. Open the lead from the CRM instead." });
      return null;
    }
    const lead = await getLeadById(leadId);
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return null; }
    return lead;
  }

  app.get("/api/call/:leadId", async (req: Request, res: Response) => {
    const lead = await callAuth(req, res); if (!lead) return;
    const activities = await getLeadActivities(lead.id, 8);
    res.set("Cache-Control", "no-store");
    res.json({
      lead: {
        id: lead.id, parentName: lead.parentName, kidName: lead.kidName, kidAge: lead.kidAge,
        phone: lead.phone, programInterest: lead.programInterest, pipelineStage: lead.pipelineStage,
        fromFacebook: isFacebookLead(lead), utmCampaign: lead.utmCampaign ?? null,
        trialClassDate: lead.trialClassDate ?? null, trialClassTime: lead.trialClassTime ?? null,
        trialClassDay: lead.trialClassDay ?? null, additionalNotes: lead.additionalNotes ?? null,
        smsConsent: !!lead.smsConsent, createdAt: lead.createdAt,
      },
      tel: telHref(lead.phone),
      fromNumber: TMA_PHONE_DISPLAY,
      templates: callTemplates(lead),
      outcomes: CALL_OUTCOMES.map(o => ({ id: o, label: CALL_LABEL[o] })),
      activities: activities.map(a => ({ id: a.id, type: a.type, subject: a.subject, body: a.body, status: a.status, createdAt: a.createdAt })),
    });
  });

  // Logged when the page opens the dialer, so "who we called" is recorded even if no notes follow.
  app.post("/api/call/:leadId/start", async (req: Request, res: Response) => {
    const lead = await callAuth(req, res); if (!lead) return;
    const recent = await getLeadActivities(lead.id, 5);
    const dup = recent.some(a => a.type === "call" && a.status === "dialed" && Date.now() - new Date(a.createdAt).getTime() < 2 * 60 * 1000);
    if (!dup) {
      await createLeadActivity({
        leadId: lead.id, type: "call", direction: "outbound",
        subject: `Call placed from the TMA iPhone ${TMA_PHONE_DISPLAY}`, body: null,
        sentBy: "staff:call_link", status: "dialed",
      });
    }
    res.json({ ok: true, logged: !dup });
  });

  app.post("/api/call/:leadId/finish", async (req: Request, res: Response) => {
    const lead = await callAuth(req, res); if (!lead) return;
    const outcome = String(req.body?.outcome ?? "") as CallOutcome;
    if (!CALL_OUTCOMES.includes(outcome)) { res.status(400).json({ error: "Pick how the call went." }); return; }
    const notes = String(req.body?.notes ?? "").trim().slice(0, 2000);
    const followUp = req.body?.followUp ? String(req.body.followUp) : null;
    if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) { res.status(400).json({ error: "Bad follow-up date." }); return; }

    await createLeadActivity({
      leadId: lead.id, type: "call", direction: "outbound",
      subject: `Call: ${CALL_LABEL[outcome]}`, body: notes || null,
      sentBy: "staff:call_link", status: outcome,
    });
    const next = stageAfterCall(lead.pipelineStage, outcome);
    if (next) await updateLeadStage(lead.id, next);
    if (followUp) await setLeadFollowUp(lead.id, followUp, notes || null);
    res.json({ ok: true, stageChangedTo: next, followUp });
  });

  // "I sent this text" so the timeline shows who we texted and which message.
  app.post("/api/call/:leadId/texted", async (req: Request, res: Response) => {
    const lead = await callAuth(req, res); if (!lead) return;
    const t = callTemplates(lead).find(x => x.id === String(req.body?.templateId ?? ""));
    if (!t) { res.status(400).json({ error: "Unknown text" }); return; }
    await createLeadActivity({
      leadId: lead.id, type: "sms", direction: "outbound",
      subject: `Text: ${t.label}`, body: t.text, sentBy: "staff:call_link", status: "sent",
    });
    res.json({ ok: true });
  });

  // ─── Stage update endpoint ─────────────────────────────────────────────────
  // Used by the n8n no-show recovery workflow to mark leads as no_show / no_show_final.
  // PATCH /api/leads/:leadId/stage  body: { stage: "no_show" }
  app.patch("/api/leads/:leadId/stage", async (req: Request, res: Response) => {
    const leadId = parseInt(req.params.leadId, 10);
    if (isNaN(leadId)) {
      res.status(400).json({ error: "Invalid leadId" });
      return;
    }
    const { stage } = req.body as { stage?: string };
    if (!stage || !(VALID_STAGES as readonly string[]).includes(stage)) {
      res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(", ")}` });
      return;
    }
    await updateLeadStage(leadId, stage as PipelineStage);
    res.json({ success: true });
  });

  // ─── Ad insights endpoint ──────────────────────────────────────────────────
  // Returns aggregated Facebook ad performance data stored in MySQL.
  // n8n and Claude can call this for weekly summaries without needing FB API access.
  app.get("/api/ads/insights", async (req: Request, res: Response) => {
    const days = parseInt((req.query.days as string) ?? "7", 10);
    if (isNaN(days) || days < 1 || days > 90) {
      res.status(400).json({ error: "days must be between 1 and 90" });
      return;
    }
    const insights = await getAdInsights(days);
    res.json({ days, count: insights.length, data: insights });
  });

  // ─── Manual ad sync trigger ────────────────────────────────────────────────
  // POST /api/ads/sync — triggers an immediate pull from Facebook Marketing API.
  // Protected by a simple bearer token check using the CAPI token.
  app.post("/api/ads/sync", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || token !== process.env.FACEBOOK_CAPI_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const result = await syncAdInsights();
    res.json(result);
  });

  // ─── Kill switch: automation control status (read-only, for n8n) ───────────
  // n8n workflows GET this before running so a paused automation truly stops.
  // GET /api/controls            -> all controls
  // GET /api/controls/:key/status -> { controlKey, enabled }
  app.get("/api/controls", async (_req: Request, res: Response) => {
    res.json(await getAutomationControls());
  });
  app.get("/api/controls/:key/status", async (req: Request, res: Response) => {
    const key = req.params.key;
    const enabled = await isAutomationEnabled(key);
    res.json({ controlKey: key, enabled });
  });
}
