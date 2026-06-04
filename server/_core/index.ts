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
  const app = express();
  const server = createServer(app);
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

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerApiRoutes(app);

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
