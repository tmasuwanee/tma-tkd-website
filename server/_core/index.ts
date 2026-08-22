import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerApiRoutes } from "../api-routes";
import type { Request, Response } from "express";
import { syncAdInsights } from "../facebook-ads";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { handleResendWebhook } from "../resend-webhook";
import { handleStripeWebhook } from "../stripe-webhook";
import { handleAssistant } from "../assistant";
import { handleVoiceSession, handleVoiceRun } from "../voice-assistant";
import { chargeDueMemberships } from "../membership-billing";
import { topUpAllChargeRunways } from "../membership-ops";
import { reconcileMembershipBilling } from "../billing-reconciliation";
import { sendTelegramMessage } from "../telegram";
import { handleMorningReport } from "../morning-report";
import { registerVoiceRoutes } from "../voice-routes";
import { handleTrialRemindersAM, handleTrialCheckinPM, handleDailyCallQueue } from "../staff-reminders";
import { handleOutboundSpeedToLead, handleOutboundNoShow, handleOutboundPostTrial, handleOutboundAfterschoolTour } from "../outbound-voice";
import { runStartupMigrations } from "../migrate";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Apply idempotent schema migrations (e.g. new columns) before serving traffic.
  // Safe + non-blocking: skips if no DB, tolerates already-applied columns.
  await runStartupMigrations();

  const app = express();
  const server = createServer(app);

  // Stripe webhook (recurring tuition). MUST be registered BEFORE express.json so
  // Stripe signature verification sees the raw request bytes (the exact sent
  // bytes, not re-serialized JSON). See docs/STRIPE_TUITION_SETUP.md; set
  // TMA_STRIPE_WEBHOOK_SECRET in Secrets.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

  // Configure body parser with larger size limit for file uploads
  // (Studio video uploads from phones can hit 60-90MB; JSON base64 inflates ~33%)
  app.use(express.json({ limit: "150mb" }));
  app.use(express.urlencoded({ limit: "150mb", extended: true }));

  // Redirect www.tmatkd.com to tmatkd.com (301 permanent redirect)
  app.use((req: Request, res: Response, next) => {
    const host = req.get('host') || '';
    if (host.startsWith('www.tmatkd.com')) {
      const newUrl = `https://tmatkd.com${req.originalUrl}`;
      return res.redirect(301, newUrl);
    }
    next();
  });

  // 2026-06-09 EMERGENCY: /camp was used in day_0 blast emails but the real route
  // is /camp-registration. 301 so all clicked links in already-sent emails work.
  app.get('/camp', (_req: Request, res: Response) => res.redirect(301, '/camp-registration'));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerApiRoutes(app);
  // Voice agent (Retell) custom-function tools: resolve-date, check-availability,
  // book-trial, route-to-human. Shared-secret protected (VOICE_AGENT_SHARED_SECRET).
  registerVoiceRoutes(app);

  // ─── Resend webhook: bounce, complaint, delivery events ─────────────────────
  // Resend POSTs signed events here in real time.
  // Setup: resend.com → Webhooks → URL = https://tmatkd.com/api/resend-webhook
  // Events: email.bounced, email.complained, email.delivered, email.delivery_delayed
  // Then set RESEND_WEBHOOK_SECRET in project Secrets.
  //
  // Raw-body capture middleware: Svix signature verification requires the exact
  // bytes Resend sent, not re-serialized JSON. We capture rawBody here before
  // express.json() parses it, then pass it through on req.rawBody.
  app.post(
    "/api/resend-webhook",
    express.raw({ type: "application/json" }),
    (req: Request, _res: Response, next) => {
      if (Buffer.isBuffer(req.body)) {
        (req as any).rawBody = req.body.toString("utf8");
        req.body = JSON.parse((req as any).rawBody);
      }
      next();
    },
    handleResendWebhook
  );

  // ─── Read-only AI assistant (admin) ─────────────────────────────────────────
  // POST /api/admin/assistant. Streams a tool-calling chat. Hard-gated on the
  // admin session inside the handler. Uses the global express.json body parser
  // (registered above), so it must be after it. See docs/AI_ASSISTANT_SPEC.md.
  app.post("/api/admin/assistant", handleAssistant);
  // Voice assistant (OpenAI Realtime): mint an ephemeral session token, and run the
  // text assistant for the voice agent's single tool. Both admin-gated.
  app.post("/api/admin/voice/session", handleVoiceSession);
  app.post("/api/admin/voice/run", handleVoiceRun);

  // Membership tuition daily job. Two steps: (1) top up every membership's forward
  // charge schedule so tuition never silently lapses when the generated months run
  // out (runs regardless of the billing switch), then (2) charge what's due — a
  // no-op unless MEMBERSHIP_AUTOCHARGE_ENFORCE=true, so it is safe to leave registered.
  app.post("/api/scheduled/membership-charges", async (_req: Request, res: Response) => {
    try {
      const runway = await topUpAllChargeRunways();
      const charged = await chargeDueMemberships();
      res.json({ runway, ...charged });
    } catch (e) { console.error("[membership-charges] error:", e); res.status(500).json({ error: "failed" }); }
  });

  // Daily billing reconciliation: Stripe vs the ledger, alert-only. Safe to leave
  // registered (read-only detection).
  app.post("/api/scheduled/reconcile-billing", async (_req: Request, res: Response) => {
    try {
      const r = await reconcileMembershipBilling(48);
      if (r.drift.length) await sendTelegramMessage(`🔎 <b>Billing reconciliation: ${r.drift.length} issue(s)</b>\n${r.drift.slice(0, 10).join("\n")}`).catch(() => {});
      res.json({ ok: true, ...r });
    } catch (e) { console.error("[reconcile-billing] error:", e); res.status(500).json({ error: "failed" }); }
  });

  // ─── Scheduled: morning blast health report ────────────────────────────────
  // Fires daily at 11:30 AM ET via Heartbeat cron (project-level, §4a).
  // Sends bounce rate, complaint rate, paused count, and enrollment count
  // to the project owner via notifyOwner().
  app.post("/api/scheduled/morning-report", handleMorningReport);

  // ─── Scheduled: Telegram staff reminders ───────────────────────────────────
  // Heartbeat crons (project-level): AM ~8:00 ET lists today's trials;
  // PM ~8:30 ET reminds staff to mark who showed up, with a dashboard link.
  app.post("/api/scheduled/trial-reminders-am", handleTrialRemindersAM);
  app.post("/api/scheduled/trial-checkin-pm", handleTrialCheckinPM);
  // Daily call queue (~8 AM ET): scores leads, fills /admin/calls, Telegrams the list.
  app.post("/api/scheduled/daily-call-queue", handleDailyCallQueue);

  // ─── Outbound voice agent triggers ─────────────────────────────────────────
  // Cron-fired. Each is gated by the voice_agent_outbound kill switch, calling
  // hours (8 AM-9 PM ET), noOutboundCalls, and per-lead dedup. SAFETY: do not
  // register the crons until the outbound agent is tested.
  app.post("/api/scheduled/outbound-speed-to-lead", handleOutboundSpeedToLead);
  app.post("/api/scheduled/outbound-noshow", handleOutboundNoShow);
  app.post("/api/scheduled/outbound-posttrial", handleOutboundPostTrial);
  app.post("/api/scheduled/outbound-afterschool-tour", handleOutboundAfterschoolTour);

  // ─── Scheduled: daily Facebook ad insights sync ──────────────────────────
  // Triggered by a Heartbeat cron (project-level, §4a).
  // The platform restricts /api/scheduled/* to cron callers only.
  app.post("/api/scheduled/sync-fb-ads", async (req: Request, res: Response) => {
    try {
      const result = await syncAdInsights(7);
      console.log("[Heartbeat] sync-fb-ads:", result);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[Heartbeat] sync-fb-ads error:", err);
      res.status(500).json({ error: String(err) });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
