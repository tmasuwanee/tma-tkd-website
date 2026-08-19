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
  {
    // 2026-08-11: link a paid afterschool registration back to its signed waiver.
    // submitIntake already generates a waiverId and carries it in the Stripe
    // PaymentIntent metadata; confirm now persists it here so payment + waiver
    // stop being two unlinked rows correlated only by name/email.
    name: "afterschoolRegistrations.waiverId",
    sql: "ALTER TABLE afterschoolRegistrations ADD COLUMN IF NOT EXISTS waiverId INT NULL",
  },
  {
    // 2026-08-11: durable table for one-off payments (afterschool supply fee,
    // camp field trip) that previously had no DB row (only Stripe + Telegram),
    // so they were unreconcilable in the dashboard. Idempotent create; the
    // unique key on the PaymentIntent id backs the idempotent insert.
    name: "oneOffPayments table",
    sql: "CREATE TABLE IF NOT EXISTS oneOffPayments (" +
      "id BIGINT PRIMARY KEY AUTO_INCREMENT, " +
      "product VARCHAR(64) NOT NULL, " +
      "payerName VARCHAR(255) NOT NULL, " +
      "studentName VARCHAR(255) NULL, " +
      "detail VARCHAR(300) NULL, " +
      "email VARCHAR(255) NULL, " +
      "amountCents INT NOT NULL, " +
      "stripePaymentIntentId VARCHAR(255) NOT NULL, " +
      "stripePaymentStatus VARCHAR(32) NOT NULL, " +
      "paidAt DATETIME NULL, " +
      "UNIQUE KEY uniq_oneoff_pi (stripePaymentIntentId))",
  },
  // ── 2026-08-11: recurring tuition (Stripe Subscriptions) on afterschool
  //    registrations. One column per entry so each is independently idempotent
  //    and a single already-applied column never blocks the rest. Nullable, so
  //    existing rows + the config-gated-off path are unaffected. ──
  { name: "afterschoolRegistrations.stripeCustomerId",     sql: "ALTER TABLE afterschoolRegistrations ADD COLUMN IF NOT EXISTS stripeCustomerId VARCHAR(255) NULL" },
  { name: "afterschoolRegistrations.stripeSubscriptionId", sql: "ALTER TABLE afterschoolRegistrations ADD COLUMN IF NOT EXISTS stripeSubscriptionId VARCHAR(255) NULL" },
  { name: "afterschoolRegistrations.subscriptionStatus",   sql: "ALTER TABLE afterschoolRegistrations ADD COLUMN IF NOT EXISTS subscriptionStatus VARCHAR(32) NULL" },
  { name: "afterschoolRegistrations.monthlyAmountCents",   sql: "ALTER TABLE afterschoolRegistrations ADD COLUMN IF NOT EXISTS monthlyAmountCents INT NULL" },
  { name: "afterschoolRegistrations.currentPeriodEnd",     sql: "ALTER TABLE afterschoolRegistrations ADD COLUMN IF NOT EXISTS currentPeriodEnd DATETIME NULL" },
  { name: "afterschoolRegistrations.billingAnchor",        sql: "ALTER TABLE afterschoolRegistrations ADD COLUMN IF NOT EXISTS billingAnchor DATE NULL" },
  { name: "afterschoolRegistrations.lastPaymentStatus",    sql: "ALTER TABLE afterschoolRegistrations ADD COLUMN IF NOT EXISTS lastPaymentStatus VARCHAR(32) NULL" },
  { name: "afterschoolRegistrations.canceledAt",           sql: "ALTER TABLE afterschoolRegistrations ADD COLUMN IF NOT EXISTS canceledAt DATETIME NULL" },
  {
    // 2026-08-11: write-action confirm-flow. A proposed action (e.g. an email
    // drafted by the assistant) is stored here and does NOTHING until a human
    // confirms it, which executes it once (idempotent) and records the outcome.
    name: "pendingActions table",
    sql: "CREATE TABLE IF NOT EXISTS pendingActions (" +
      "id BIGINT PRIMARY KEY AUTO_INCREMENT, " +
      "actionType VARCHAR(64) NOT NULL, " +
      "title VARCHAR(255) NOT NULL, " +
      "preview TEXT NULL, " +
      "payload TEXT NOT NULL, " +
      "status VARCHAR(24) NOT NULL DEFAULT 'proposed', " +
      "proposedBy VARCHAR(120) NULL, " +
      "confirmedBy VARCHAR(120) NULL, " +
      "result TEXT NULL, " +
      "createdAt DATETIME NOT NULL, " +
      "executedAt DATETIME NULL, " +
      "expiresAt DATETIME NULL)",
  },
  {
    // 2026-08-12: membership engine. A membership is a student's ongoing plan
    // (program, monthly tuition, status, term, Stripe links). See
    // docs/OPERATIONS_SOPS.md.
    name: "memberships table",
    sql: "CREATE TABLE IF NOT EXISTS memberships (" +
      "id BIGINT PRIMARY KEY AUTO_INCREMENT, " +
      "studentName VARCHAR(255) NOT NULL, " +
      "parentName VARCHAR(255) NULL, " +
      "email VARCHAR(320) NULL, " +
      "phone VARCHAR(40) NULL, " +
      "leadId INT NULL, " +
      "program VARCHAR(40) NOT NULL, " +
      "planLabel VARCHAR(80) NULL, " +
      "monthlyAmountCents INT NOT NULL, " +
      "discountCents INT NOT NULL DEFAULT 0, " +
      "discountNote VARCHAR(255) NULL, " +
      "status VARCHAR(24) NOT NULL DEFAULT 'active', " +
      "startDate DATE NULL, " +
      "termMonths INT NULL DEFAULT 12, " +
      "billingDay INT NULL, " +
      "stripeCustomerId VARCHAR(255) NULL, " +
      "stripeSubscriptionId VARCHAR(255) NULL, " +
      "contractNote VARCHAR(500) NULL, " +
      "cancelEffectiveDate DATE NULL, " +
      "canceledAt DATETIME NULL, " +
      "createdAt DATETIME NOT NULL)",
  },
  {
    // 2026-08-12: per-month charges (the Financials ledger). One row per month per
    // membership; amountCents is editable per month (waive = 0, discount = partial,
    // cancel = status). baseAmountCents keeps the un-adjusted amount for reference.
    name: "membershipCharges table",
    sql: "CREATE TABLE IF NOT EXISTS membershipCharges (" +
      "id BIGINT PRIMARY KEY AUTO_INCREMENT, " +
      "membershipId BIGINT NOT NULL, " +
      "periodMonth VARCHAR(7) NOT NULL, " +
      "dueDate DATE NULL, " +
      "baseAmountCents INT NOT NULL, " +
      "amountCents INT NOT NULL, " +
      "status VARCHAR(24) NOT NULL DEFAULT 'scheduled', " +
      "note VARCHAR(255) NULL, " +
      "adjustedBy VARCHAR(120) NULL, " +
      "stripeInvoiceId VARCHAR(255) NULL, " +
      "createdAt DATETIME NOT NULL, " +
      "UNIQUE KEY uniq_membership_period (membershipId, periodMonth))",
  },
  {
    // 2026-08-12: day-camp signups ($60/day). One row per signup; dates is a JSON
    // array of YYYY-MM-DD the parent selected.
    name: "dayCampSignups table",
    sql: "CREATE TABLE IF NOT EXISTS dayCampSignups (" +
      "id BIGINT PRIMARY KEY AUTO_INCREMENT, " +
      "childName VARCHAR(255) NOT NULL, " +
      "parentName VARCHAR(255) NOT NULL, " +
      "email VARCHAR(320) NULL, " +
      "phone VARCHAR(40) NULL, " +
      "dates TEXT NOT NULL, " +
      "dayCount INT NOT NULL, " +
      "amountCents INT NOT NULL, " +
      "source VARCHAR(24) NOT NULL DEFAULT 'online', " +
      "stripePaymentIntentId VARCHAR(255) NULL, " +
      "stripePaymentStatus VARCHAR(32) NOT NULL DEFAULT 'pending', " +
      "createdAt DATETIME NOT NULL, " +
      "paidAt DATETIME NULL)",
  },
  {
    // 2026-08-12: family payer (head of household). Holds the card(s) on a single
    // Stripe customer; multiple students' memberships draw from it. The "primary"
    // card is the customer's default_payment_method. See docs/OPERATIONS_SOPS.md.
    name: "payers table",
    sql: "CREATE TABLE IF NOT EXISTS payers (" +
      "id BIGINT PRIMARY KEY AUTO_INCREMENT, " +
      "name VARCHAR(255) NOT NULL, " +
      "email VARCHAR(320) NULL, " +
      "phone VARCHAR(40) NULL, " +
      "stripeCustomerId VARCHAR(255) NULL, " +
      "createdAt DATETIME NOT NULL)",
  },
  { name: "memberships.payerId", sql: "ALTER TABLE memberships ADD COLUMN IF NOT EXISTS payerId BIGINT NULL" },
  {
    // 2026-08-14: Pro Shop "specials" — staff-managed promotions/offers (Back to
    // School, gear bundle, bring-a-friend, seasonal camp). Each has a shareable
    // signup link (an existing pay page or external URL) and a printable flyer.
    // Informational only; the actual payment still runs through the linked page,
    // so no card/PII lives here.
    name: "specials table",
    sql: "CREATE TABLE IF NOT EXISTS specials (" +
      "id BIGINT PRIMARY KEY AUTO_INCREMENT, " +
      "title VARCHAR(160) NOT NULL, " +
      "description TEXT NULL, " +
      "priceLabel VARCHAR(80) NULL, " +
      "linkUrl VARCHAR(600) NULL, " +
      "badge VARCHAR(40) NULL, " +
      "active TINYINT NOT NULL DEFAULT 1, " +
      "sortOrder INT NOT NULL DEFAULT 0, " +
      "createdAt DATETIME NOT NULL, " +
      "updatedAt DATETIME NULL)",
  },
  {
    // 2026-08-14: link a membership back to the afterschool registration it was
    // promoted from. The UNIQUE index below makes "Set up billing" idempotent even
    // under a simultaneous double-submit — the second INSERT hits the unique key
    // and the handler recovers the winning row instead of creating a duplicate.
    name: "memberships.afterschoolRegId",
    sql: "ALTER TABLE memberships ADD COLUMN IF NOT EXISTS afterschoolRegId BIGINT NULL",
  },
  {
    name: "memberships.afterschoolRegId unique index",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uniq_membership_afterschool_reg ON memberships (afterschoolRegId)",
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
      // "Duplicate key name" = the UNIQUE index already exists on re-run.
      if (/duplicate column|duplicate key name|already exists/i.test(msg)) {
        console.log(`[migrate] skip (exists): ${m.name}`);
      } else {
        console.error(`[migrate] FAILED: ${m.name}: ${msg}`);
      }
    }
  }
}
