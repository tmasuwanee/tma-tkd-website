import { eq, desc, or, like, inArray, isNotNull, and, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import {
  InsertUser, users,
  leads, InsertLead, Lead,
  leadActivities, InsertLeadActivity, LeadActivity,
  campRegistrations, InsertCampRegistration,
  students, InsertStudent, Student,
  attendance, InsertAttendance, Attendance,
  leadSequenceQueue, InsertLeadSequenceQueue, LeadSequenceQueue,
  sequenceTemplates, InsertSequenceTemplate, SequenceTemplate,
  sequenceTemplateHistory, InsertSequenceTemplateHistory,
  sequenceTriggerRules, InsertSequenceTriggerRule, SequenceTriggerRule,
  leadLifecycleEvents, InsertLeadLifecycleEvent, LeadLifecycleEvent,
  systemAuditLog, InsertSystemAuditLog,
} from "../drizzle/schema";
import { lte } from "drizzle-orm";
import { ENV } from './_core/env';
import { getNextRank, getPreviousRank } from "../shared/beltRanks";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  const dsn = ENV.databaseUrl || process.env.DATABASE_URL;
  if (!_db && dsn) {
    try {
      _pool = _pool ?? mysql.createPool(dsn);
      _db = drizzle(_pool);
      console.log("[Database] Connected via mysql2 pool");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export async function createLead(lead: InsertLead): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Normalize email to lowercase on insert so getLeadByEmail can find it
  // reliably regardless of source casing. Defense-in-depth alongside the
  // case-insensitive LOWER() match in getLeadByEmail.
  const normalized: InsertLead = lead.email
    ? { ...lead, email: lead.email.toLowerCase().trim() }
    : lead;
  const [result] = await db.insert(leads).values(normalized);
  return (result as unknown as { insertId: number }).insertId ?? 0;
}

export async function getLeadById(id: number): Promise<Lead | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getLeadByEmail(email: string): Promise<Lead | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Case-insensitive match via SQL LOWER() to handle mixed-case emails in storage.
  // History (2026-05-20 incident): mixed-case emails stored from FB sync caused
  // getLeadByEmail to return null on case-mismatch, so upsertLeadFromFacebook
  // created duplicate rows on every FB sync cycle → 14× duplicate leads per email
  // → 14× Lead Intake v2 executions → Day 4 email bursts when 96h waits expired.
  const normalized = email.toLowerCase().trim();
  const result = await db.select().from(leads)
    .where(sql`LOWER(${leads.email}) = ${normalized}`)
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return result[0] ?? null;
}

export async function getAllLeads(): Promise<Lead[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(leads).orderBy(desc(leads.createdAt));
}

export async function getLeadsByStages(
  stages: Lead['pipelineStage'][],
  hasTrialDate?: boolean,
): Promise<Lead[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const where = hasTrialDate
    ? and(inArray(leads.pipelineStage, stages), isNotNull(leads.trialClassDate))
    : inArray(leads.pipelineStage, stages);
  return db.select().from(leads).where(where).orderBy(desc(leads.createdAt));
}

export async function updateLeadStage(
  id: number,
  stage: Lead["pipelineStage"],
  trialPaidAmount?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = { pipelineStage: stage };
  if (trialPaidAmount !== undefined) updateData.trialPaidAmount = trialPaidAmount;
  await db.update(leads).set(updateData).where(eq(leads.id, id));
}

export async function updateLeadProgram(id: number, programInterest: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set({ programInterest }).where(eq(leads.id, id));
}

export async function updateLeadNotes(id: number, internalNotes: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set({ internalNotes }).where(eq(leads.id, id));
}

export async function updateLeadTags(id: number, tags: string[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set({ tags: JSON.stringify(tags) }).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(leads).where(eq(leads.id, id));
}

// Upsert a lead from Facebook Lead Ads — matches by email.
// Existing leads: merges tags, fills blank UTM fields. Never overwrites notes, stage, or existing tags.
// New leads: inserts with utmSource=facebook and provided tags.
export async function upsertLeadFromFacebook(input: {
  parentName: string;
  kidName?: string;
  kidAge?: string;
  programInterest?: string;
  email: string;
  phone?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  tags?: string[];
}): Promise<{ id: number; isNew: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getLeadByEmail(input.email);

  if (existing) {
    const existingTags: string[] = existing.tags ? JSON.parse(existing.tags) : [];
    const newTags = input.tags ?? ["facebook_lead"];
    const mergedTags = Array.from(new Set([...existingTags, ...newTags]));

    await db.update(leads).set({
      phone: existing.phone || input.phone || existing.phone,
      utmSource: existing.utmSource || input.utmSource || "facebook",
      utmMedium: existing.utmMedium || input.utmMedium || "lead_ad",
      utmCampaign: existing.utmCampaign || input.utmCampaign,
      utmContent: existing.utmContent || input.utmContent,
      tags: JSON.stringify(mergedTags),
    }).where(eq(leads.id, existing.id));

    return { id: existing.id, isNew: false };
  }

  const id = await createLead({
    parentName: input.parentName,
    kidName: input.kidName || "",
    kidAge: input.kidAge || "",
    programInterest: input.programInterest || "summer_camp",
    email: input.email,
    phone: input.phone || "",
    utmSource: input.utmSource || "facebook",
    utmMedium: input.utmMedium || "lead_ad",
    utmCampaign: input.utmCampaign || null,
    utmContent: input.utmContent || null,
    tags: JSON.stringify(input.tags ?? ["facebook_lead"]),
  });

  return { id, isNew: true };
}

// ─── Lead Activity Log ───────────────────────────────────────────────────────

export async function createLeadActivity(activity: InsertLeadActivity): Promise<LeadActivity> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(leadActivities).values(activity);
  const insertId = (result as unknown as { insertId: number }).insertId ?? 0;
  const created = await db.select().from(leadActivities).where(eq(leadActivities.id, insertId)).limit(1);
  return created[0]!;
}

export async function getLeadActivities(leadId: number): Promise<LeadActivity[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(leadActivities)
    .where(eq(leadActivities.leadId, leadId))
    .orderBy(desc(leadActivities.createdAt));
}

// ─── Students ────────────────────────────────────────────────────────────────

export async function upsertStudents(rows: InsertStudent[]): Promise<{ added: number; updated: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(students);
  const existingByName = new Map(existing.map(s => [s.name.trim().toLowerCase(), s]));

  const toInsert: InsertStudent[] = [];

  for (const row of rows) {
    const normalizedName = (row.name ?? "").trim().toLowerCase();
    const match = existingByName.get(normalizedName);
    if (match) {
      // Update CSV-sourced fields; never overwrite manually-edited belt/attendance data
      await db.update(students).set({
        email: row.email ?? match.email,
        phone: row.phone ?? match.phone,
        programs: row.programs ?? match.programs,
        enrollmentDate: row.enrollmentDate ?? match.enrollmentDate,
        beltRank: row.beltRank ?? match.beltRank,
        status: row.status ?? match.status,
        emergencyContact: row.emergencyContact ?? match.emergencyContact,
      }).where(eq(students.id, match.id));
    } else {
      toInsert.push(row);
    }
  }

  for (let i = 0; i < toInsert.length; i += 100) {
    await db.insert(students).values(toInsert.slice(i, i + 100));
  }

  return { added: toInsert.length, updated: rows.length - toInsert.length };
}

export async function getAllStudents() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(students).orderBy(students.name);
}

export async function searchStudents(query: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const trimmed = query.trim();
  if (!trimmed) return getAllStudents();

  const nameLike = `%${trimmed}%`;
  const digitsOnly = trimmed.replace(/\D/g, "");

  const conditions: ReturnType<typeof sql>[] = [
    sql`LOWER(${students.name}) LIKE LOWER(${nameLike})`,
  ];

  if (digitsOnly.length > 0) {
    const phoneLike = `%${digitsOnly}%`;
    conditions.push(sql`REGEXP_REPLACE(${students.phone}, '[^0-9]', '') LIKE ${phoneLike}`);
  }

  return db.select().from(students).where(or(...conditions)).orderBy(students.name);
}

/** Check if an email or name matches an active student */
export async function isExistingStudent(email: string, name?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const conditions = [like(students.email, email)];
  if (name) conditions.push(like(students.name, `%${name}%`));
  const result = await db.select({ id: students.id }).from(students).where(
    or(...conditions)
  ).limit(1);
  return result.length > 0;
}

export async function updateStudent(id: number, updates: Partial<InsertStudent>): Promise<Student | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(students).set(updates).where(eq(students.id, id));
  const result = await db.select().from(students).where(eq(students.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createStudent(student: InsertStudent): Promise<Student> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(students).values(student);
  const insertId = (result as unknown as { insertId: number }).insertId ?? 0;
  const created = await db.select().from(students).where(eq(students.id, insertId)).limit(1);
  return created[0]!;
}

// ─── Camp Registrations ───────────────────────────────────────────────────────

export async function createCampRegistration(reg: InsertCampRegistration) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(campRegistrations).values(reg);
  return result;
}

export async function updateCampRegistrationPayment(
  paymentIntentId: string,
  paymentStatus: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates: Record<string, unknown> = { stripePaymentStatus: paymentStatus };
  if (paymentStatus === "succeeded") {
    updates.agreedToTerms = 1;
  }
  await db
    .update(campRegistrations)
    .set(updates)
    .where(eq(campRegistrations.stripePaymentIntentId, paymentIntentId));
}

export async function getCampRegistrationById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(campRegistrations).where(eq(campRegistrations.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getCampRegistrationByPaymentIntentId(paymentIntentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(campRegistrations).where(eq(campRegistrations.stripePaymentIntentId, paymentIntentId)).limit(1);
  return result[0] ?? null;
}

export async function getAllCampRegistrations() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(campRegistrations).orderBy(campRegistrations.createdAt);
  return result;
}

export async function softDeleteRegistration(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(campRegistrations)
    .set({ isDeleted: 1, deletedAt: new Date() })
    .where(eq(campRegistrations.id, id));
}

export async function restoreRegistration(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(campRegistrations)
    .set({ isDeleted: 0, deletedAt: null })
    .where(eq(campRegistrations.id, id));
}


// ─── Attendance ──────────────────────────────────────────────────────────────

export async function checkInStudent(studentId: number, classDate: string): Promise<Attendance> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if already checked in today
  const today = new Date().toISOString().split('T')[0];
  const existing = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.studentId, studentId), eq(attendance.classDate, today)))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new attendance record
  const [result] = await db.insert(attendance).values({
    studentId,
    classDate,
    loggedBy: 'kiosk',
  });

  const insertId = (result as unknown as { insertId: number }).insertId ?? 0;
  const newRecord = await db.select().from(attendance).where(eq(attendance.id, insertId)).limit(1);
  return newRecord[0]!;
}

export async function getAttendanceSincePromotion(studentId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const student = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!student.length) return 0;

  const lastPromotedAt = student[0].lastPromotedAt;
  if (!lastPromotedAt) return 0;

  const result = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.studentId, studentId), gte(attendance.checkedInAt, lastPromotedAt)));

  return result.length;
}

export async function getEligibleStudents(): Promise<(Student & { attendanceSincePromotion: number })[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allStudents = await db.select().from(students);
  const eligible = [];

  for (const student of allStudents) {
    const count = await getAttendanceSincePromotion(student.id);
    if (count >= 15 || student.isEligibleOverride === 1) {
      eligible.push({ ...student, attendanceSincePromotion: count });
    }
  }

  return eligible;
}

// ─── Belt Rank ───────────────────────────────────────────────────────────────

export async function promoteBeltRank(studentId: number): Promise<Student | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const student = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!student.length) return null;

  const currentRank = student[0].beltRank;
  const nextRank = getNextRank(currentRank);

  if (!nextRank) return student[0]; // Already at highest rank

  await db.update(students).set({
    beltRank: nextRank,
    lastPromotedAt: new Date(),
  }).where(eq(students.id, studentId));

  const updated = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  return updated[0] ?? null;
}

export async function demoteBeltRank(studentId: number): Promise<Student | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const student = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!student.length) return null;

  const currentRank = student[0].beltRank;
  const previousRank = getPreviousRank(currentRank);

  if (!previousRank) return student[0]; // Already at lowest rank

  await db.update(students).set({
    beltRank: previousRank,
    lastPromotedAt: new Date(),
  }).where(eq(students.id, studentId));

  const updated = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  return updated[0] ?? null;
}

/**
 * Manually set the attendance count for a student since their last promotion.
 * Adds synthetic "staff" records or deletes existing records to reach the target count.
 */
export async function setAttendanceCount(studentId: number, targetCount: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const currentCount = await getAttendanceSincePromotion(studentId);
  if (targetCount === currentCount) return;

  if (targetCount > currentCount) {
    const toAdd = targetCount - currentCount;
    const baseDate = new Date();
    const records: InsertAttendance[] = [];
    for (let i = 0; i < toAdd; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - (i + 1));
      const dateStr = d.toISOString().split("T")[0];
      records.push({
        studentId,
        classDate: dateStr,
        loggedBy: "staff",
        checkedInAt: d,
      });
    }
    await db.insert(attendance).values(records);
  } else {
    const toRemove = currentCount - targetCount;
    const student = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
    const lastPromotedAt = student[0]?.lastPromotedAt ?? new Date(0);
    const existing = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.studentId, studentId), gte(attendance.checkedInAt, lastPromotedAt)))
      .orderBy(desc(attendance.checkedInAt))
      .limit(toRemove);
    for (const rec of existing) {
      await db.delete(attendance).where(eq(attendance.id, rec.id));
    }
  }
}

// ============================================================================
// Lead Conductor — automation pause + sequence queue (2026-05-19)
// ============================================================================

export async function pauseLeadAutomation(
  id: number,
  pausedBy: string,
  reason: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set({
    automationPaused: 1,
    automationPausedAt: new Date(),
    automationPausedBy: pausedBy,
    automationPauseReason: reason,
  }).where(eq(leads.id, id));
}

export async function resumeLeadAutomation(id: number, resumedBy: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set({
    automationPaused: 0,
    automationPausedAt: null,
    automationPausedBy: null,
    automationPauseReason: null,
  }).where(eq(leads.id, id));
  // Caller is responsible for writing the resume note to leadActivities
}

/**
 * Improved no-show filter (Phase 1c).
 * Returns leads whose trialClassDate matches the given date (YYYY-MM-DD)
 * AND pipelineStage is in the given list AND have not been auto-enrolled.
 * Use this in the No-Show Recovery workflow instead of the broad getLeadsByStages.
 */
export async function getLeadsByStagesAndTrialDate(
  stages: Lead['pipelineStage'][],
  trialDate: string,
): Promise<Lead[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(leads).where(and(
    inArray(leads.pipelineStage, stages),
    eq(leads.trialClassDate, trialDate),
  )).orderBy(desc(leads.createdAt));
}

// ---- Sequence queue CRUD ----

export async function scheduleSequenceTouch(input: InsertLeadSequenceQueue): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(leadSequenceQueue).values(input);
  return (result as unknown as { insertId: number }).insertId ?? 0;
}

export async function listSequenceByLead(leadId: number): Promise<LeadSequenceQueue[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(leadSequenceQueue)
    .where(eq(leadSequenceQueue.leadId, leadId))
    .orderBy(desc(leadSequenceQueue.scheduledFor));
}

export async function getSequenceTouchById(id: number): Promise<LeadSequenceQueue | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(leadSequenceQueue).where(eq(leadSequenceQueue.id, id)).limit(1);
  return result[0] ?? null;
}

export async function skipSequenceTouch(id: number, reason: string, updatedBy: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leadSequenceQueue).set({
    status: 'skipped',
    skipReason: reason,
    skippedAt: new Date(),
    updatedBy,
  }).where(and(eq(leadSequenceQueue.id, id), eq(leadSequenceQueue.status, 'scheduled')));
}

export async function cancelSequenceTouch(id: number, reason: string, updatedBy: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leadSequenceQueue).set({
    status: 'cancelled',
    cancelReason: reason,
    cancelledAt: new Date(),
    updatedBy,
  }).where(and(eq(leadSequenceQueue.id, id), inArray(leadSequenceQueue.status, ['scheduled', 'processing'])));
}

export async function cancelSequenceByLeadAndKey(
  leadId: number,
  sequenceKey: string,
  reason: string,
  updatedBy: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leadSequenceQueue).set({
    status: 'cancelled',
    cancelReason: reason,
    cancelledAt: new Date(),
    updatedBy,
  }).where(and(
    eq(leadSequenceQueue.leadId, leadId),
    eq(leadSequenceQueue.sequenceKey, sequenceKey),
    eq(leadSequenceQueue.status, 'scheduled'),
  ));
}

export async function overrideSequenceTouch(
  id: number,
  override: { touchSubject?: string; touchBodyOverride?: string },
  updatedBy: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const set: Record<string, unknown> = { updatedBy };
  if (override.touchSubject !== undefined) set.touchSubject = override.touchSubject;
  if (override.touchBodyOverride !== undefined) set.touchBodyOverride = override.touchBodyOverride;
  await db.update(leadSequenceQueue).set(set)
    .where(and(eq(leadSequenceQueue.id, id), eq(leadSequenceQueue.status, 'scheduled')));
}

export async function triggerSequenceNow(id: number, updatedBy: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leadSequenceQueue).set({
    scheduledFor: new Date(),
    updatedBy,
  }).where(and(eq(leadSequenceQueue.id, id), eq(leadSequenceQueue.status, 'scheduled')));
}

/**
 * Dispatcher query: returns up to `limit` rows that are due and still scheduled.
 * Caller MUST atomically flip each row to 'processing' before doing any send work
 * (use markTouchProcessing) to prevent double-dispatch.
 */
export async function getDueSequenceTouches(limit = 50): Promise<LeadSequenceQueue[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(leadSequenceQueue).where(and(
    eq(leadSequenceQueue.status, 'scheduled'),
    lte(leadSequenceQueue.scheduledFor, new Date()),
  )).orderBy(leadSequenceQueue.scheduledFor).limit(limit);
}

/**
 * Atomically mark a row as 'processing' — only succeeds if the row is still 'scheduled'.
 * Returns true if the CAS succeeded (caller has exclusive ownership), false otherwise.
 *
 * v3 (2026-05-19): SELECT-UPDATE-SELECT pattern. Does not depend on drizzle's update()
 * return shape at all. Safe for our single-worker n8n dispatcher; multi-worker would
 * need a token-based lock.
 */
export async function markTouchProcessing(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Read current status — only proceed if row exists and is 'scheduled'
  const before = await db.select().from(leadSequenceQueue).where(eq(leadSequenceQueue.id, id)).limit(1);
  console.log('[markTouchProcessing v3] id=' + id + ' beforeStatus=' + (before[0]?.status ?? 'NOT_FOUND'));
  if (!before[0] || before[0].status !== 'scheduled') {
    return false; // Already claimed, sent, cancelled, or doesn't exist
  }

  // 2. Conditional UPDATE (WHERE status='scheduled') — atomic in MySQL even without
  // looking at the return value. If another worker raced us, only one of us flips it.
  await db.update(leadSequenceQueue).set({ status: 'processing' })
    .where(and(eq(leadSequenceQueue.id, id), eq(leadSequenceQueue.status, 'scheduled')));

  // 3. Read back. If status is now 'processing', we (or we-raced-and-tied) claimed it.
  // For our single-worker setup, this is exclusive ownership.
  const after = await db.select().from(leadSequenceQueue).where(eq(leadSequenceQueue.id, id)).limit(1);
  const claimed = after[0]?.status === 'processing';
  console.log('[markTouchProcessing v3] id=' + id + ' afterStatus=' + (after[0]?.status ?? 'NOT_FOUND') + ' claimed=' + claimed);
  return claimed;
}

export async function markTouchSent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leadSequenceQueue).set({
    status: 'sent',
    sentAt: new Date(),
  }).where(eq(leadSequenceQueue.id, id));
}

export async function markTouchSkipped(id: number, reason: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leadSequenceQueue).set({
    status: 'skipped',
    skipReason: reason,
    skippedAt: new Date(),
  }).where(eq(leadSequenceQueue.id, id));
}

export async function markTouchFailed(id: number, reason: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leadSequenceQueue).set({
    status: 'failed',
    failureReason: reason,
    failedAt: new Date(),
  }).where(eq(leadSequenceQueue.id, id));
}

/** Idempotency check: has this exact (leadId, touchKey) already been sent? */
export async function hasTouchBeenSent(leadId: number, touchKey: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(leadSequenceQueue).where(and(
    eq(leadSequenceQueue.leadId, leadId),
    eq(leadSequenceQueue.touchKey, touchKey),
    eq(leadSequenceQueue.status, 'sent'),
  )).limit(1);
  return result.length > 0;
}

// =====================================================================
// LIFECYCLE ARCHITECTURE v1 — DB HELPERS (2026-05-20)
// See: TMA_LIFECYCLE_ARCHITECTURE.md
// =====================================================================

// --- Sequence templates (editable email content) ---

export async function listSequenceTemplates(): Promise<SequenceTemplate[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(sequenceTemplates).orderBy(sequenceTemplates.sequenceKey, sequenceTemplates.orderIndex);
}

export async function getTemplate(sequenceKey: string, touchKey: string): Promise<SequenceTemplate | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(sequenceTemplates).where(and(
    eq(sequenceTemplates.sequenceKey, sequenceKey),
    eq(sequenceTemplates.touchKey, touchKey),
  )).limit(1);
  return result[0] ?? null;
}

export async function getTemplateById(id: number): Promise<SequenceTemplate | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(sequenceTemplates).where(eq(sequenceTemplates.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createTemplate(data: InsertSequenceTemplate): Promise<SequenceTemplate> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(sequenceTemplates).values(data);
  const created = await getTemplate(data.sequenceKey, data.touchKey);
  if (!created) throw new Error("Template insert failed");
  return created;
}

/**
 * Updates a template and writes the previous state to sequenceTemplateHistory.
 * The dispatcher snapshots template content into the queue row BEFORE sending,
 * so in-flight touches are not affected by mid-flight edits.
 */
export async function updateTemplate(
  id: number,
  patch: Partial<Pick<SequenceTemplate, 'subject' | 'bodyHtml' | 'bodyText' | 'delayHours' | 'isActive' | 'displayName' | 'description'>>,
  editedBy: string,
  changeNote?: string,
): Promise<SequenceTemplate | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const before = await getTemplateById(id);
  if (!before) return null;

  // Write history row BEFORE update (so we can roll back)
  await db.insert(sequenceTemplateHistory).values({
    templateId: id,
    prevSubject: before.subject,
    prevBodyHtml: before.bodyHtml,
    prevBodyText: before.bodyText,
    prevDelayHours: before.delayHours,
    prevIsActive: before.isActive,
    editedBy,
    changeNote: changeNote ?? null,
  });

  await db.update(sequenceTemplates).set({
    ...patch,
    updatedBy: editedBy,
  }).where(eq(sequenceTemplates.id, id));

  return await getTemplateById(id);
}

export async function getTemplateHistory(templateId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(sequenceTemplateHistory)
    .where(eq(sequenceTemplateHistory.templateId, templateId))
    .orderBy(desc(sequenceTemplateHistory.editedAt));
}

// --- Intake routing rules ---

export async function listTriggerRules(activeOnly = false): Promise<SequenceTriggerRule[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const q = db.select().from(sequenceTriggerRules);
  if (activeOnly) {
    return q.where(eq(sequenceTriggerRules.isActive, 1)).orderBy(desc(sequenceTriggerRules.priority));
  }
  return q.orderBy(desc(sequenceTriggerRules.priority));
}

export async function createTriggerRule(data: InsertSequenceTriggerRule): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(sequenceTriggerRules).values(data);
}

export async function updateTriggerRule(id: number, patch: Partial<InsertSequenceTriggerRule>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(sequenceTriggerRules).set(patch).where(eq(sequenceTriggerRules.id, id));
}

export async function deleteTriggerRule(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(sequenceTriggerRules).where(eq(sequenceTriggerRules.id, id));
}

/**
 * Routes a lead to a sequence based on first-match-wins rule evaluation.
 * Returns the sequenceKey to enroll the lead into, or null if no rule matched.
 *
 * Call signature mirrors the intake payload so this can be invoked
 * either from a tRPC mutation (Lead Intake v2) or from n8n directly.
 */
export async function routeLeadToSequence(payload: {
  tags?: string[];
  utmSource?: string | null;
  utmCampaign?: string | null;
  programInterest?: string | null;
  trialClassDate?: string | null;
}): Promise<{ matchedRuleId: number | null; sequenceKey: string }> {
  const rules = await listTriggerRules(true);
  const normalize = (s: string | null | undefined) => (s ?? '').toString().toLowerCase().trim();

  for (const rule of rules) {
    const op = rule.matchOperator;
    const val = normalize(rule.matchValue);

    let matched = false;
    switch (rule.matchField) {
      case 'tag': {
        const tagsLower = (payload.tags ?? []).map(t => normalize(t));
        if (op === 'equals') matched = tagsLower.includes(val);
        else if (op === 'contains') matched = tagsLower.some(t => t.includes(val));
        else if (op === 'starts_with') matched = tagsLower.some(t => t.startsWith(val));
        break;
      }
      case 'utmSource': {
        const v = normalize(payload.utmSource);
        if (op === 'equals') matched = v === val;
        else if (op === 'contains') matched = v.includes(val);
        else if (op === 'starts_with') matched = v.startsWith(val);
        break;
      }
      case 'utmCampaign': {
        const v = normalize(payload.utmCampaign);
        if (op === 'equals') matched = v === val;
        else if (op === 'contains') matched = v.includes(val);
        else if (op === 'starts_with') matched = v.startsWith(val);
        break;
      }
      case 'programInterest': {
        const v = normalize(payload.programInterest);
        if (op === 'equals') matched = v === val;
        else if (op === 'contains') matched = v.includes(val);
        else if (op === 'starts_with') matched = v.startsWith(val);
        break;
      }
      case 'hasTrialDate': {
        matched = op === 'is_true' && !!payload.trialClassDate;
        break;
      }
    }

    if (matched) {
      return { matchedRuleId: rule.id, sequenceKey: rule.sequenceKey };
    }
  }

  // No rule matched → unsegmented fallback. Caller should alert staff.
  return { matchedRuleId: null, sequenceKey: 'unsegmented' };
}

// --- Lifecycle state machine ---

// Legal transitions. Used by recordTransition to reject illegal moves.
// Maps fromStage → set of allowed toStages.
const LEGAL_TRANSITIONS: Record<string, string[]> = {
  new_lead: ['contacted', 'trial_scheduled', 'lost'],
  contacted: ['trial_scheduled', 'lost', 'enrolled'],
  trial_scheduled: ['trial_paid', 'trial_attended', 'no_show', 'lost', 'enrolled'],
  trial_paid: ['trial_attended', 'no_show', 'enrolled', 'lost'],
  trial_attended: ['enrolled', 'no_show_final', 'lost'],
  no_show: ['trial_scheduled', 'no_show_final', 'enrolled', 'lost'],
  no_show_final: ['enrolled', 'lost'],
  enrolled: ['lost'], // a withdrawn student
  lost: ['new_lead', 'contacted', 'trial_scheduled'], // re-engagement allowed
};

export function isLegalTransition(from: string | null | undefined, to: string): boolean {
  if (!from) return true; // initial assignment from null is always legal
  const allowed = LEGAL_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

/**
 * Records a stage transition with side effects.
 *
 * 1. Validates the transition is legal (or allowForce=true)
 * 2. Updates leads.pipelineStage
 * 3. Writes an immutable row to leadLifecycleEvents
 * 4. Applies side effects per the new stage:
 *    - enrolled / lost (terminal): cancel all scheduled queue rows for this lead
 *    - no_show: cancel any remaining trial reminders
 *
 * Returns the new lifecycle event row.
 *
 * EVERY workflow / tRPC procedure that changes lead stage MUST call this.
 * Do not UPDATE leads.pipelineStage directly. See architecture doc.
 */
export async function recordLifecycleTransition(args: {
  leadId: number;
  toStage: 'new_lead' | 'contacted' | 'trial_scheduled' | 'trial_paid' | 'trial_attended' | 'enrolled' | 'no_show' | 'no_show_final' | 'lost';
  triggeredBy: string;
  reason?: string;
  allowForce?: boolean;
}): Promise<LeadLifecycleEvent | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Snapshot current stage
  const leadRows = await db.select().from(leads).where(eq(leads.id, args.leadId)).limit(1);
  if (!leadRows[0]) {
    await logAudit({ level: 'error', source: 'lifecycle', event: 'transition_lead_not_found', leadId: args.leadId, details: JSON.stringify(args) });
    return null;
  }
  const fromStage = leadRows[0].pipelineStage as string;

  // Same-stage = noop (idempotent)
  if (fromStage === args.toStage) {
    await logAudit({ level: 'info', source: 'lifecycle', event: 'transition_noop_same_stage', leadId: args.leadId, details: JSON.stringify({ stage: args.toStage, triggeredBy: args.triggeredBy }) });
    return null;
  }

  // Legality check
  if (!args.allowForce && !isLegalTransition(fromStage, args.toStage)) {
    await logAudit({ level: 'warn', source: 'lifecycle', event: 'transition_rejected_illegal', leadId: args.leadId, details: JSON.stringify({ fromStage, toStage: args.toStage, triggeredBy: args.triggeredBy }) });
    throw new Error(`Illegal lifecycle transition: ${fromStage} → ${args.toStage}. Pass allowForce=true to override.`);
  }

  // Apply side effects BEFORE updating stage (so a failure here doesn't leave inconsistent state)
  const sideEffects: { cancelledQueueIds?: number[]; note?: string } = {};

  if (args.toStage === 'enrolled' || args.toStage === 'lost' || args.toStage === 'no_show_final') {
    // Cancel all scheduled touches for this lead
    const scheduledRows = await db.select().from(leadSequenceQueue).where(and(
      eq(leadSequenceQueue.leadId, args.leadId),
      eq(leadSequenceQueue.status, 'scheduled'),
    ));
    const ids = scheduledRows.map(r => r.id);
    if (ids.length > 0) {
      await db.update(leadSequenceQueue).set({
        status: 'cancelled',
        cancelReason: `lifecycle_transition:${args.toStage}`,
        cancelledAt: new Date(),
        updatedBy: args.triggeredBy,
      }).where(and(
        inArray(leadSequenceQueue.id, ids),
        eq(leadSequenceQueue.status, 'scheduled'),
      ));
      sideEffects.cancelledQueueIds = ids;
    }
  }

  // Update lead.pipelineStage
  await db.update(leads).set({ pipelineStage: args.toStage }).where(eq(leads.id, args.leadId));

  // Write lifecycle event
  await db.insert(leadLifecycleEvents).values({
    leadId: args.leadId,
    fromStage,
    toStage: args.toStage,
    triggeredBy: args.triggeredBy,
    reason: args.reason ?? null,
    sideEffects: JSON.stringify(sideEffects),
  });

  // Fetch the row we just wrote
  const events = await db.select().from(leadLifecycleEvents)
    .where(eq(leadLifecycleEvents.leadId, args.leadId))
    .orderBy(desc(leadLifecycleEvents.createdAt))
    .limit(1);

  return events[0] ?? null;
}

export async function getLifecycleHistory(leadId: number): Promise<LeadLifecycleEvent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(leadLifecycleEvents)
    .where(eq(leadLifecycleEvents.leadId, leadId))
    .orderBy(desc(leadLifecycleEvents.createdAt));
}

// --- System audit log (errors, warnings, deploy markers, quota alerts) ---

export async function logAudit(entry: {
  level?: 'info' | 'warn' | 'error' | 'critical';
  source: string;
  event: string;
  details?: string;
  leadId?: number;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Audit] DB unavailable, log lost:", entry);
      return;
    }
    await db.insert(systemAuditLog).values({
      level: entry.level ?? 'info',
      source: entry.source,
      event: entry.event,
      details: entry.details ?? null,
      leadId: entry.leadId ?? null,
    });
  } catch (e) {
    // Never let audit logging crash the caller
    console.error("[Audit] Failed to write log:", e, "entry:", entry);
  }
}

export async function listAuditLog(args: {
  level?: 'info' | 'warn' | 'error' | 'critical';
  source?: string;
  leadId?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [];
  if (args.level) conditions.push(eq(systemAuditLog.level, args.level));
  if (args.source) conditions.push(eq(systemAuditLog.source, args.source));
  if (args.leadId) conditions.push(eq(systemAuditLog.leadId, args.leadId));
  const q = db.select().from(systemAuditLog);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return (where ? q.where(where) : q).orderBy(desc(systemAuditLog.createdAt)).limit(args.limit ?? 100);
}

// --- Pre-send guard for the dispatcher ---

/**
 * Called by the dispatcher BEFORE sending any touch.
 * Returns { ok: true } if safe to send, or { ok: false, reason } if it should be skipped.
 *
 * Skip reasons:
 *   - lead_opted_out: stage is 'lost' AND reason mentions opt-out (future: dedicated stage)
 *   - lead_enrolled: stage is 'enrolled' (terminal — nurture should have been cancelled)
 *   - automation_paused: lead.automationPaused = true
 *   - lead_not_found: leadId doesn't exist
 *   - template_inactive: template exists but isActive = false
 *   - template_not_found: template doesn't exist for (sequenceKey, touchKey)
 */
export async function preSendGuard(args: {
  leadId: number;
  sequenceKey: string;
  touchKey: string;
}): Promise<{ ok: true; template: SequenceTemplate } | { ok: false; reason: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const leadRows = await db.select().from(leads).where(eq(leads.id, args.leadId)).limit(1);
  const lead = leadRows[0];
  if (!lead) return { ok: false, reason: 'lead_not_found' };
  if (lead.automationPaused) return { ok: false, reason: 'automation_paused' };
  if (lead.pipelineStage === 'enrolled') return { ok: false, reason: 'lead_enrolled' };
  if (lead.pipelineStage === 'lost') return { ok: false, reason: 'lead_lost' };

  const template = await getTemplate(args.sequenceKey, args.touchKey);
  if (!template) return { ok: false, reason: 'template_not_found' };
  if (!template.isActive) return { ok: false, reason: 'template_inactive' };

  return { ok: true, template };
}

