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
  {
    // 2026-07-11: student date of birth (YYYY-MM-DD) for the birthday automation.
    // Backfilled from ZenPlanner's "Birth Date" field via the roster CSV import.
    name: "students.dob",
    sql: "ALTER TABLE students ADD COLUMN IF NOT EXISTS dob VARCHAR(20)",
  },
  {
    // 2026-07-23: URL of a generated signed document (e.g. the GCPS transportation
    // authorization PDF) stored in object storage. Lets the dashboard link to the
    // filled + signed PDF for waiver rows that produce one.
    name: "waivers.pdfUrl",
    sql: "ALTER TABLE waivers ADD COLUMN IF NOT EXISTS pdfUrl VARCHAR(1024)",
  },
  {
    // 2026-07-25: record type separates prospects from customers/orders/forms so
    // the pipeline + call board stop surfacing already-paying people as cold leads.
    // Stored as VARCHAR to keep the ADD COLUMN idempotent across MySQL/TiDB.
    name: "leads.recordType",
    sql: "ALTER TABLE leads ADD COLUMN IF NOT EXISTS recordType VARCHAR(20) NOT NULL DEFAULT 'prospect'",
  },
  // ── One-time backfill of existing rows (idempotent: only promotes rows still at
  //    the 'prospect' default, so re-running never overrides a set value). ──
  {
    name: "leads.recordType backfill: orders",
    sql: "UPDATE leads SET recordType='order' WHERE recordType='prospect' AND (tags LIKE '%proshop_order%' OR tags LIKE '%christmas_july%')",
  },
  {
    name: "leads.recordType backfill: back-to-school trials",
    sql: "UPDATE leads SET recordType='trial' WHERE recordType='prospect' AND tags LIKE '%back_to_school_2026%'",
  },
  {
    name: "leads.recordType backfill: enrolled (stage or after-school registration)",
    sql: "UPDATE leads SET recordType='enrolled' WHERE recordType='prospect' AND (pipelineStage='enrolled' OR (tags LIKE '%walk_in_waiver%' AND tags LIKE '%interest_afterschool%'))",
  },
  {
    name: "leads.recordType backfill: form-only waiver/transportation signers",
    sql: "UPDATE leads SET recordType='form_only' WHERE recordType='prospect' AND tags LIKE '%walk_in_waiver%'",
  },
  {
    // 2026-08-03: seed Elias Gray (waiver already on file) onto the afterschool
    // roster under Benefield Elementary. Idempotent via NOT EXISTS (also matches a
    // soft-deleted row, so a later removal is not resurrected). Added by request.
    name: "afterschoolRoster seed: Elias Gray (Benefield Elementary)",
    sql: "INSERT INTO afterschoolRoster (schoolName, childName, phone, grade, groupLabel, active, sortOrder) " +
         "SELECT 'Benefield Elementary','Elias Gray','470-554-1991',NULL,NULL,1," +
         "(SELECT COALESCE(MAX(r2.sortOrder),0)+10 FROM afterschoolRoster r2) FROM DUAL " +
         "WHERE NOT EXISTS (SELECT 1 FROM afterschoolRoster r WHERE r.childName='Elias Gray' AND r.phone='470-554-1991')",
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
