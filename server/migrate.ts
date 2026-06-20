import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Idempotent startup migrations.
 *
 * drizzle-kit is blocked by pre-existing schema drift (students.programs), so new
 * columns get added here instead. Each statement runs once on boot, uses
 * "ADD COLUMN IF NOT EXISTS" (TiDB supports it), and is wrapped so a failure or an
 * already-applied column never blocks the server from starting.
 *
 * To add a future column: append a { name, sql } entry. Keep every statement
 * idempotent (IF NOT EXISTS / IF EXISTS) so re-running on every boot is safe.
 */
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    // 2026-06-19: comma-list of fired end-of-trial reminder milestones (e.g. "7,3,2").
    // Drives the 7/3/2/1-day-before reminder cron without re-pinging a milestone.
    name: "trialEnrollments.remindersSent",
    sql: "ALTER TABLE trialEnrollments ADD COLUMN IF NOT EXISTS remindersSent VARCHAR(50)",
  },
];

export async function runStartupMigrations(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[migrate] No DB connection; skipping startup migrations");
    return;
  }
  for (const m of MIGRATIONS) {
    try {
      await db.execute(sql.raw(m.sql));
      console.log(`[migrate] ok: ${m.name}`);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      // Already applied (different MySQL flavors word this differently) is fine.
      if (/duplicate column|already exists/i.test(msg)) {
        console.log(`[migrate] skip (exists): ${m.name}`);
      } else {
        console.error(`[migrate] FAILED: ${m.name}: ${msg}`);
      }
    }
  }
}
