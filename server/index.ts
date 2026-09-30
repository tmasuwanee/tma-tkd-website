import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // Bandwidth control (2026-09-24). Render meters outbound bandwidth, and the site-media
  // videos and images are most of it. Without a max-age every new browser session re-downloads
  // them. Hashed build assets can be cached forever; media gets 30 days; index.html is never
  // cached or a deploy would not reach anyone.
  app.use(express.static(staticPath, {
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

  // Handle client-side routing. A request for a FILE that does not exist must 404 rather
  // than receive index.html, or the browser parses HTML as JavaScript and the page is blank.
  // Same rule as server/_core/vite.ts, which is the handler production actually boots.
  app.get("*", (req, res) => {
    if (/\.[a-z0-9]{2,8}$/i.test(req.path) || req.path.startsWith("/assets/")) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
