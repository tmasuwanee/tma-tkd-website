/**
 * REST API routes (non-tRPC)
 *
 * These endpoints are consumed by n8n, Claude, and external services
 * that prefer plain HTTP GET/POST over tRPC.
 *
 * Routes:
 *   GET  /api/leads/:leadId/status   — lead pipeline stage for n8n pre-send checks
 *   GET  /api/ads/insights?days=N    — Facebook ad performance data from MySQL
 *   POST /api/ads/sync               — manually trigger a Facebook Marketing API pull
 */

import type { Express, Request, Response } from "express";
import { getLeadById } from "./db";
import { getAdInsights, syncAdInsights } from "./facebook-ads";

export function registerApiRoutes(app: Express): void {
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
      updatedAt: lead.updatedAt?.toISOString() ?? new Date().toISOString(),
    });
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
