import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// TiDB Cloud (and most managed MySQL) require TLS. drizzle-kit does not enable
// it from a bare mysql:// url, so parse the DSN into components and turn TLS on
// for tidbcloud hosts. Mirrors the runtime pool config in server/db.ts.
const u = new URL(connectionString);
const isTidb = u.hostname.includes("tidbcloud.com");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: u.hostname,
    port: Number(u.port) || 4000,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || undefined,
    ...(isTidb ? { ssl: { minVersion: "TLSv1.2" } } : {}),
  },
});
