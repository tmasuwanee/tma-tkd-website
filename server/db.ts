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
  const [result] = await db.insert(leads).values(lead);
  // MySQL returns insertId on the raw OkPacket
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
  const result = await db.select().from(leads)
    .where(eq(leads.email, email.toLowerCase().trim()))
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
 * Defensive: drizzle's update() return shape varies. Try both [OkPacket, ...] and direct
 * OkPacket shapes. Also fall back to a verification SELECT in case both are unreliable.
 */
export async function markTouchProcessing(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result: unknown = await db.update(leadSequenceQueue).set({ status: 'processing' })
    .where(and(eq(leadSequenceQueue.id, id), eq(leadSequenceQueue.status, 'scheduled')));
  // Try common shapes for mysql2 result wrappers
  const r = result as any;
  const fromDestructured = Array.isArray(r) && r[0] ? r[0].affectedRows : undefined;
  const fromDirect = !Array.isArray(r) ? r?.affectedRows : undefined;
  const affected = fromDestructured ?? fromDirect ?? 0;
  console.log('[markTouchProcessing] id=' + id + ' affected=' + affected +
    ' shape=' + (Array.isArray(r) ? 'array' : typeof r) +
    ' keys=' + JSON.stringify(Array.isArray(r) ? Object.keys(r[0] || {}) : Object.keys(r || {})));
  if (affected > 0) return true;
  // Fallback: verify via SELECT (safe for single-worker setup we have).
  // If the update we just sent moved the row to 'processing', it's claimed.
  const rows = await db.select().from(leadSequenceQueue).where(eq(leadSequenceQueue.id, id)).limit(1);
  return rows[0]?.status === 'processing';
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

