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
import { getLeadById, getLeadsByStages, updateLeadStage } from "./db";
import { getAdInsights, syncAdInsights } from "./facebook-ads";

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
}
