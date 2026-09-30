import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Bandwidth control (2026-09-24). This is the static handler production actually uses, so
  // the Cache-Control rules have to live here. Without a max-age every new browser session
  // re-downloads the site-media videos, which is what ate the Render bandwidth allowance.
  // Hashed build assets can be cached forever, media gets 30 days, index.html is never cached
  // or a deploy would not reach anyone.
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      } else if (/[\\/]assets[\\/]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (/\.(mp4|webm|jpg|jpeg|png|gif|webp|svg|woff2?|ico)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=2592000");
      }
    },
  }));

  // Fall through to index.html so client-side routes work. A request that clearly asks for
  // a FILE must 404 instead (2026-09-30). Returning index.html for a missing asset was
  // causing intermittent white screens: after a deploy the hashed bundle names change, a
  // browser holding the old page asks for /assets/index-OLDHASH.js, got 200 with HTML back,
  // tried to parse that HTML as JavaScript, threw, and React never mounted.
  // NOTE: inside app.use("*") Express rewrites req.url, so req.path is always "/" here.
  // The real path is only on req.originalUrl, same as the dev handler above.
  app.use("*", (req, res) => {
    const pathname = req.originalUrl.split("?")[0];
    if (/\.[a-z0-9]{2,8}$/i.test(pathname) || pathname.startsWith("/assets/")) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
