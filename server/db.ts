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
  studioAssets, InsertStudioAsset, StudioAsset,
  dailyCallQueue, InsertDailyCallQueueRow, DailyCallQueueRow,
  automationControls, AutomationControl,
  callLogs, InsertCallLog, CallLog,
  adminTasks, AdminTask,
  waivers, InsertWaiver, Waiver,
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
  // Also auto-tag by program here, the one choke point every lead source flows
  // through (web forms, voice agent, FB sync, imports), so the Leads view can
  // always filter by program without each caller remembering to set the tag.
  const normalized: InsertLead = {
    ...lead,
    ...(lead.email ? { email: lead.email.toLowerCase().trim() } : {}),
    tags: mergeProgramTag(lead.tags as string | null | undefined, lead.programInterest),
  };
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
  // `leads` is referenced by FK from several child tables, so a bare delete
  // fails (FK violation) for any lead that has history. Remove the children
  // first, then the lead. systemAuditLog.leadId has no FK and is an immutable
  // audit trail, so we leave it. callLogs.leadId has no FK either; we keep the
  // call record but null the dangling link.
  await db.delete(leadActivities).where(eq(leadActivities.leadId, id));
  await db.delete(leadSequenceQueue).where(eq(leadSequenceQueue.leadId, id));
  await db.delete(leadLifecycleEvents).where(eq(leadLifecycleEvents.leadId, id));
  await db.delete(dailyCallQueue).where(eq(dailyCallQueue.leadId, id));
  await db.update(callLogs).set({ leadId: null }).where(eq(callLogs.leadId, id));
  await db.delete(leads).where(eq(leads.id, id));
}

/**
 * Set (or clear) a lead's scheduled follow-up. A future date snoozes the lead
 * out of the daily call queue until then; null clears it so the lead follows
 * the normal urgency ranking again and keeps showing in the morning reminders.
 */
export async function setLeadFollowUp(leadId: number, nextFollowUpAt: string | null, note: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set({
    nextFollowUpAt: nextFollowUpAt || null,
    followUpNote: note ?? null,
  } as any).where(eq(leads.id, leadId));
}

// ── Admin tasks (the personal "My Tasks" to-do list) ─────────────────────────
export async function listAdminTasks(): Promise<AdminTask[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminTasks).orderBy(adminTasks.done, desc(adminTasks.createdAt));
}
export async function addAdminTask(input: { title: string; notes?: string | null; dueDate?: string | null; createdBy?: string | null }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [r] = await db.insert(adminTasks).values({
    title: input.title, notes: input.notes ?? null, dueDate: input.dueDate ?? null, createdBy: input.createdBy ?? null,
  } as any);
  return (r as unknown as { insertId: number }).insertId ?? 0;
}
export async function updateAdminTask(id: number, patch: { title?: string; notes?: string | null; done?: boolean; dueDate?: string | null }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
  if (patch.done !== undefined) set.done = patch.done ? 1 : 0;
  if (Object.keys(set).length) await db.update(adminTasks).set(set as any).where(eq(adminTasks.id, id));
}
export async function deleteAdminTask(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(adminTasks).where(eq(adminTasks.id, id));
}

// ── Waivers / in-person sign-up ──────────────────────────────────────────────
// Derive a whole-number age string from a YYYY-MM-DD DOB. leads.kidAge is a
// notNull varchar, so we store "" when the DOB is missing or unparseable rather
// than guessing. Server-side date math is deterministic (unlike the voice agent,
// the rule there is the LLM must not compute dates — this is plain Node).
function ageFromDob(dob?: string | null): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? String(age) : "";
}

export async function createWaiver(input: InsertWaiver): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [r] = await db.insert(waivers).values({
    ...input,
    email: input.email ? input.email.toLowerCase().trim() : input.email,
  });
  return (r as unknown as { insertId: number }).insertId ?? 0;
}

export async function getAllWaivers(): Promise<Waiver[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(waivers).orderBy(desc(waivers.createdAt));
}

export async function getWaiversByLead(leadId: number): Promise<Waiver[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(waivers).where(eq(waivers.leadId, leadId)).orderBy(desc(waivers.createdAt));
}

// Submit a signed waiver: match-or-create the lead so they enter the SAME
// pipeline as web leads, then store the signed waiver on file linked to that
// lead. Match-by-email (not blind insert) is what stops the unique-email crash
// that bites returning families — the exact failure a walk-in hits when their
// email is already in the system.
export async function submitWaiver(input: {
  parentName: string;
  address?: string | null;
  email: string;
  phone: string;
  students: { name: string; dob: string }[];
  interests: string[];
  signatureData?: string | null;
  signedName?: string | null;
  signedDate: string;
  disclaimerText?: string | null;
  source?: string;
  ip?: string | null;
  smsConsent?: boolean;
  smsConsentText?: string | null;
}): Promise<{ leadId: number; waiverId: number; matchedExisting: boolean }> {
  const primary = input.students[0];
  const existing = await getLeadByEmail(input.email);
  let leadId: number;
  let matchedExisting = false;

  if (existing) {
    leadId = existing.id;
    matchedExisting = true;
  } else {
    const interestTags = input.interests.map(i => `interest_${i}`);
    leadId = await createLead({
      parentName: input.parentName,
      kidName: primary?.name || input.parentName,
      kidAge: ageFromDob(primary?.dob),
      programInterest: "In-person sign-up",
      email: input.email,
      phone: input.phone,
      additionalNotes: input.address ? `Address: ${input.address}` : undefined,
      tags: JSON.stringify(["walk_in_waiver", ...interestTags]),
      ...(input.smsConsent
        ? { smsConsent: 1, smsConsentAt: new Date(), smsConsentText: input.smsConsentText ?? null, smsConsentIp: input.ip ? String(input.ip).slice(0, 64) : null }
        : {}),
    });
  }

  const waiverId = await createWaiver({
    leadId,
    parentName: input.parentName,
    address: input.address ?? null,
    email: input.email,
    phone: input.phone,
    students: JSON.stringify(input.students),
    interests: JSON.stringify(input.interests),
    signatureData: input.signatureData ?? null,
    signedName: input.signedName ?? null,
    signedDate: input.signedDate,
    disclaimerText: input.disclaimerText ?? null,
    source: input.source ?? "walk_in",
    ipAddress: input.ip ? String(input.ip).slice(0, 64) : null,
  });

  return { leadId, waiverId, matchedExisting };
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

export async function getLeadActivities(leadId: number, limit?: number): Promise<LeadActivity[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const q = db.select().from(leadActivities)
    .where(eq(leadActivities.leadId, leadId))
    .orderBy(desc(leadActivities.createdAt));
  return limit ? await q.limit(limit) : await q;
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
  // Auto-stop 4: unsubscribed (automationPaused flag set by Resend webhook or STOP reply)
  if (lead.automationPaused) return { ok: false, reason: 'auto_stop_unsubscribed' };
  if (lead.pipelineStage === 'enrolled') return { ok: false, reason: 'lead_enrolled' };
  if (lead.pipelineStage === 'lost') return { ok: false, reason: 'lead_lost' };

  // Auto-stop 1: lead replied to any prior touch (inbound email/sms/call activity)
  const replyRows = await db
    .select({ id: leadActivities.id })
    .from(leadActivities)
    .where(
      and(
        eq(leadActivities.leadId, args.leadId),
        eq(leadActivities.direction, 'inbound'),
        inArray(leadActivities.type, ['email', 'sms', 'call'])
      )
    )
    .limit(1);
  if (replyRows.length > 0) return { ok: false, reason: 'auto_stop_replied' };

  // Auto-stop 2: lead enrolled in camp (succeeded Stripe payment)
  if (lead.email) {
    const [enrolledResult] = await db.execute(
      sql`SELECT 1 FROM campRegistrations WHERE LOWER(email) = LOWER(${lead.email}) AND stripePaymentStatus = 'succeeded' LIMIT 1`
    ) as unknown as [Array<unknown>];
    if (enrolledResult && enrolledResult.length > 0) {
      return { ok: false, reason: 'auto_stop_enrolled' };
    }
  }

  // Auto-stop 3: prior touch in this sequence hard-bounced
  const bounceRows = await db
    .select({ id: leadSequenceQueue.id })
    .from(leadSequenceQueue)
    .where(
      and(
        eq(leadSequenceQueue.leadId, args.leadId),
        eq(leadSequenceQueue.sequenceKey, args.sequenceKey),
        eq(leadSequenceQueue.status, 'failed'),
        like(leadSequenceQueue.failureReason, '%bounce%')
      )
    )
    .limit(1);
  if (bounceRows.length > 0) return { ok: false, reason: 'auto_stop_bounced' };

  const template = await getTemplate(args.sequenceKey, args.touchKey);
  if (!template) return { ok: false, reason: 'template_not_found' };
  if (!template.isActive) return { ok: false, reason: 'template_inactive' };

  return { ok: true, template };
}

// =====================================================================
// PHASE 4 — TEMPLATE RENDERING + SEQUENCE FAN-OUT + DISPATCHER FETCH/CONFIRM
// Added 2026-05-21. Powers Lead Intake v3 (segment-aware) and the
// template-driven Sequence Dispatcher refactor.
// =====================================================================

/**
 * Render template merge fields against a lead row.
 * Handlebars-style: {{firstName}}, {{parentName}}, {{kidName}},
 * {{trialDate}}, {{trialTime}}, {{programInterest}}, {{leadId}}.
 *
 * Unknown fields are replaced with an empty string (NOT left as literal {{x}})
 * so we never leak template syntax to a customer.
 *
 * Pure function — no DB access — easy to unit test.
 */
export function renderTemplate(
  templateStr: string | null | undefined,
  lead: Lead
): string {
  if (!templateStr) return '';
  // Derive firstName from parentName ("John Smith" -> "John")
  const firstName = (lead.parentName || '').trim().split(/\s+/)[0] || '';
  const trialDate = lead.trialClassDate || '';
  // Best-effort human-friendly date label if trialClassDate present
  let trialDateLabel = trialDate;
  if (trialDate && /^\d{4}-\d{2}-\d{2}$/.test(trialDate)) {
    try {
      const d = new Date(trialDate + 'T12:00:00');
      trialDateLabel = d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      });
    } catch { /* fall through to raw trialDate */ }
  }
  const fields: Record<string, string> = {
    firstName,
    parentName: lead.parentName || '',
    kidName: lead.kidName || '',
    kidAge: lead.kidAge || '',
    trialDate,
    trialDateLabel,
    trialTime: lead.trialClassTime || '',
    trialDay: lead.trialClassDay || '',
    programInterest: lead.programInterest || '',
    email: lead.email || '',
    phone: lead.phone || '',
    leadId: String(lead.id),
  };
  return templateStr.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    return fields[key] ?? '';
  });
}

/**
 * Fan-out enqueue: schedule every active touch in `sequenceKey` for `leadId`.
 *
 * For each template in the sequence, inserts a leadSequenceQueue row with
 * scheduledFor = startAt (default = now) + delayHours from template.
 *
 * IDEMPOTENT: if a queue row already exists for (leadId, touchKey) in
 * status 'scheduled' OR 'processing' OR 'sent', that touch is SKIPPED
 * (not duplicated). This is the Rule 36 defense against re-enqueueing
 * the same sequence twice for the same lead.
 *
 * Returns { enqueued: [touchKey...], skipped: [{ touchKey, reason }] }.
 */
export async function enqueueSequenceForLead(args: {
  leadId: number;
  sequenceKey: string;
  startAt?: Date;
  createdBy?: string;
  /**
   * When true, delayHours is interpreted as delaySeconds (so a 48h template
   * touch becomes 48s, a 72h touch becomes 72s, etc). Lets the full E2E
   * sequence finish in ~2-3 minutes instead of 6 days. Used by the synthetic
   * test runner and by `_test_mode` payloads on the intake webhook.
   */
  testMode?: boolean;
}): Promise<{
  enqueued: { touchKey: string; scheduledFor: string }[];
  skipped: { touchKey: string; reason: string }[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verify lead exists
  const leadRows = await db.select().from(leads).where(eq(leads.id, args.leadId)).limit(1);
  if (!leadRows[0]) {
    await logAudit({ level: 'warn', source: 'sequence', event: 'enqueue_lead_not_found', leadId: args.leadId, details: JSON.stringify(args) });
    throw new Error(`Lead ${args.leadId} not found`);
  }

  // Fetch active templates for this sequence
  const tmpls = await db.select().from(sequenceTemplates).where(and(
    eq(sequenceTemplates.sequenceKey, args.sequenceKey),
    eq(sequenceTemplates.isActive, 1),
  )).orderBy(sequenceTemplates.orderIndex);

  if (tmpls.length === 0) {
    await logAudit({ level: 'warn', source: 'sequence', event: 'enqueue_no_templates', leadId: args.leadId, details: JSON.stringify({ sequenceKey: args.sequenceKey }) });
    return { enqueued: [], skipped: [] };
  }

  const startAt = args.startAt ?? new Date();
  const createdBy = args.createdBy || 'lead_intake_v3';

  const enqueued: { touchKey: string; scheduledFor: string }[] = [];
  const skipped: { touchKey: string; reason: string }[] = [];

  for (const t of tmpls) {
    // Idempotency check: existing row for (leadId, touchKey) in active status
    const existing = await db.select().from(leadSequenceQueue).where(and(
      eq(leadSequenceQueue.leadId, args.leadId),
      eq(leadSequenceQueue.touchKey, t.touchKey),
      inArray(leadSequenceQueue.status, ['scheduled', 'processing', 'sent']),
    )).limit(1);

    if (existing[0]) {
      skipped.push({ touchKey: t.touchKey, reason: `already_${existing[0].status}` });
      continue;
    }

    // In test mode, delayHours → delaySeconds (collapse 48h → 48s, etc).
    // In production, delayHours stays as hours.
    const delayMs = args.testMode
      ? (t.delayHours * 1000)             // seconds * ms
      : (t.delayHours * 60 * 60 * 1000);  // hours * 60 * 60 * ms
    const scheduledFor = new Date(startAt.getTime() + delayMs);

    await db.insert(leadSequenceQueue).values({
      leadId: args.leadId,
      scheduledFor,
      channel: t.channel,
      sequenceKey: args.sequenceKey,
      touchKey: t.touchKey,
      // Don't snapshot body — dispatcher fetches from templates at send time
      // so admin UI edits take effect on next dispatch cycle.
      touchSubject: null,
      touchBodyTemplate: null,
      touchBodyOverride: null,
      status: 'scheduled',
      createdBy,
    });

    enqueued.push({ touchKey: t.touchKey, scheduledFor: scheduledFor.toISOString() });
  }

  await logAudit({
    level: 'info', source: 'sequence', event: 'enqueue_complete', leadId: args.leadId,
    details: JSON.stringify({ sequenceKey: args.sequenceKey, enqueuedCount: enqueued.length, skippedCount: skipped.length }),
  });

  return { enqueued, skipped };
}

/**
 * Single endpoint the Sequence Dispatcher hits per due touch.
 *
 * Runs preSendGuard → if ok, renders subject + bodyHtml against the lead's
 * data → returns content ready to POST to Resend (or skip reason).
 *
 * Recipient is the lead's email UNLESS lead has an associated _test_mode
 * marker (future: per-lead test flag). For now recipient is always lead.email.
 */
export async function fetchAndRenderForDispatch(args: {
  leadId: number;
  sequenceKey: string;
  touchKey: string;
}): Promise<
  | { ok: true; subject: string; bodyHtml: string; bodyText: string; recipient: string; channel: string; templateId: number }
  | { ok: false; reason: string }
> {
  const guard = await preSendGuard(args);
  if (!guard.ok) return { ok: false, reason: guard.reason };

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const leadRows = await db.select().from(leads).where(eq(leads.id, args.leadId)).limit(1);
  const lead = leadRows[0];
  if (!lead) return { ok: false, reason: 'lead_not_found' };  // shouldn't happen — guard checked

  const subject = renderTemplate(guard.template.subject ?? '', lead);
  const bodyHtml = renderTemplate(guard.template.bodyHtml ?? '', lead);
  const bodyText = renderTemplate(guard.template.bodyText ?? '', lead);

  return {
    ok: true,
    subject,
    bodyHtml,
    bodyText,
    recipient: lead.email,
    channel: guard.template.channel,
    templateId: guard.template.id,
  };
}

/**
 * Send a one-off test email for a given template against a sample lead.
 * Used by /admin/sequences "Send test" button so staff can preview the
 * actual rendered email in their inbox before saving changes.
 *
 * Renders the template against either:
 *  - A real lead by leadId (uses their actual data)
 *  - A synthetic sample lead (default — uses placeholder data)
 *
 * Recipient defaults to ADMIN_EMAIL env or `tmasuwanee@gmail.com`.
 * Resend API key is read from RESEND_API_KEY env.
 */
export async function sendTemplateTestEmail(args: {
  templateId: number;
  recipient?: string;
  sampleLeadId?: number;
}): Promise<{ ok: boolean; messageId?: string; reason?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db_unavailable' };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'resend_api_key_missing' };
  }

  const template = await getTemplateById(args.templateId);
  if (!template) return { ok: false, reason: 'template_not_found' };

  // Build the lead for rendering: either real lead or synthetic sample
  let sampleLead: Lead;
  if (args.sampleLeadId) {
    const rows = await db.select().from(leads).where(eq(leads.id, args.sampleLeadId)).limit(1);
    if (!rows[0]) return { ok: false, reason: 'sample_lead_not_found' };
    sampleLead = rows[0];
  } else {
    sampleLead = {
      id: 0,
      parentName: 'Anna Sample',
      kidName: 'Sample Kid',
      kidAge: '8',
      programInterest: 'Taekwondo',
      motivation: null,
      email: 'sample@example.com',
      phone: '+17705551234',
      additionalNotes: null,
      pipelineStage: 'new_lead',
      trialPaidAmount: 0,
      internalNotes: null,
      trialClassDate: '2026-05-25',
      trialClassTime: '5:00 PM',
      trialClassDay: 'Sunday',
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      tags: null,
      automationPaused: 0,
      automationPausedAt: null,
      automationPausedBy: null,
      automationPauseReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Lead;
  }

  const subject = renderTemplate(template.subject ?? '(no subject)', sampleLead);
  const bodyHtml = renderTemplate(template.bodyHtml ?? '<p>(no body)</p>', sampleLead);
  const recipient = args.recipient || process.env.ADMIN_EMAIL || 'tmasuwanee@gmail.com';

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TMA Suwanee <hello@tmatkd.com>',
        to: [recipient],
        subject: `[PREVIEW] ${subject}`,
        html: bodyHtml,
      }),
    });
    const data = await resp.json() as { id?: string; message?: string; name?: string };
    if (!resp.ok) {
      await logAudit({ level: 'error', source: 'template_test_send', event: 'resend_error', details: JSON.stringify(data) });
      return { ok: false, reason: data.message || data.name || `http_${resp.status}` };
    }
    await logAudit({ level: 'info', source: 'template_test_send', event: 'sent', details: JSON.stringify({ templateId: args.templateId, recipient, messageId: data.id }) });
    return { ok: true, messageId: data.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logAudit({ level: 'error', source: 'template_test_send', event: 'fetch_exception', details: msg });
    return { ok: false, reason: msg };
  }
}

/**
 * Close-the-loop call from the dispatcher AFTER attempting send.
 *
 * Atomically:
 *  1. Updates queue row to sent/failed
 *  2. Logs to leadActivities (immutable history)
 *  3. Writes audit row
 *
 * Idempotent: if queue row is already in terminal state, no-op.
 */
export async function confirmTouchDispatched(args: {
  queueId: number;
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string;
  providerStatus?: number;
  failureReason?: string;
  skipReason?: string;
  // 2026-06-09: audit-grade snapshot of rendered HTML. Passed by the dispatcher
  // after fetchAndRender returns bodyHtml. Stored in leadActivities.renderedHtml
  // so the admin timeline shows exactly what was delivered (compliance / dispute).
  renderedHtml?: string;
}): Promise<{ ok: boolean; alreadyTerminal?: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(leadSequenceQueue).where(eq(leadSequenceQueue.id, args.queueId)).limit(1);
  const row = rows[0];
  if (!row) {
    await logAudit({ level: 'error', source: 'dispatcher', event: 'confirm_queue_not_found', details: JSON.stringify(args) });
    return { ok: false };
  }
  if (['sent', 'failed', 'cancelled', 'skipped'].includes(row.status)) {
    return { ok: true, alreadyTerminal: true };
  }

  const now = new Date();
  if (args.status === 'sent') {
    await db.update(leadSequenceQueue).set({
      status: 'sent', sentAt: now,
    }).where(eq(leadSequenceQueue.id, args.queueId));

    await createLeadActivity({
      leadId: row.leadId,
      type: row.channel === 'sms' ? 'sms' : 'email',
      subject: `${row.sequenceKey}/${row.touchKey}`,
      body: args.providerMessageId ? `provider_id=${args.providerMessageId} status=${args.providerStatus ?? ''}` : 'dispatched',
      sentBy: `n8n_dispatcher:${row.sequenceKey}`,
      status: 'sent',
      // Snapshot rendered HTML at send time for audit/compliance.
      renderedHtml: args.renderedHtml ?? null,
    } as any);
  } else if (args.status === 'failed') {
    await db.update(leadSequenceQueue).set({
      status: 'failed', failedAt: now,
      failureReason: args.failureReason ?? 'unknown',
    }).where(eq(leadSequenceQueue.id, args.queueId));

    await logAudit({
      level: 'error', source: 'dispatcher', event: 'touch_send_failed', leadId: row.leadId,
      details: JSON.stringify({ queueId: args.queueId, sequenceKey: row.sequenceKey, touchKey: row.touchKey, reason: args.failureReason, providerStatus: args.providerStatus }),
    });
  } else if (args.status === 'skipped') {
    await db.update(leadSequenceQueue).set({
      status: 'skipped', skippedAt: now,
      skipReason: args.skipReason ?? 'unknown',
    }).where(eq(leadSequenceQueue.id, args.queueId));
  }

  return { ok: true };
}

// ─── Studio Assets (2026-06-02) ──────────────────────────────────────────────

export type StudioVertical =
  | "afterschool" | "tkd" | "kickboxing" | "bjj"
  | "summer_camp" | "spring_break_camp" | "camps_general" | "all_programs";

export async function createStudioAsset(input: InsertStudioAsset): Promise<StudioAsset> {
  const db = await getDb();
  if (!db) throw new Error("Database not configured");
  const [result] = await db.insert(studioAssets).values(input).$returningId();
  const id = (result as any).id ?? (result as any).insertId;
  const [row] = await db.select().from(studioAssets).where(eq(studioAssets.id, id));
  return row;
}

export async function listStudioAssets(opts: {
  vertical?: StudioVertical;
  kind?: "photo" | "video";
  limit?: number;
}): Promise<StudioAsset[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (opts.vertical) {
    // 2026-06-04: an asset matches a vertical filter if EITHER:
    //   - its primary vertical equals the filter (back-compat with single-tag rows), OR
    //   - the filter appears in its tags JSON array
    // JSON_CONTAINS is MySQL 5.7+. JSON_QUOTE wraps the value so we match exact strings.
    conds.push(
      or(
        eq(studioAssets.vertical, opts.vertical),
        sql`JSON_CONTAINS(${studioAssets.tags}, JSON_QUOTE(${opts.vertical}))`,
      )!,
    );
  }
  if (opts.kind) conds.push(eq(studioAssets.kind, opts.kind));
  const where = conds.length ? and(...conds) : undefined;
  const q = db.select().from(studioAssets).orderBy(desc(studioAssets.createdAt)).limit(opts.limit ?? 200);
  return where ? await q.where(where) : await q;
}

export async function getStudioAssetById(id: number): Promise<StudioAsset | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(studioAssets).where(eq(studioAssets.id, id));
  return row;
}

export async function updateStudioAsset(id: number, patch: Partial<{
  caption: string | null;
  minorReleaseOnFile: boolean;
  vertical: StudioVertical;
  tags: string;  // already-stringified JSON array
}>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not configured");
  await db.update(studioAssets).set(patch as any).where(eq(studioAssets.id, id));
}

// ─── Daily Call Queue + inbound activity (2026-06-06) ─────────────────────────

export type CallOutcome =
  | "pending" | "answered" | "voicemail" | "no_answer"
  | "booked" | "not_interested" | "callback_later" | "skipped";

/**
 * Normalize programInterest into a canonical vertical bucket.
 *
 * Production data is dirty (Manus 2026-06-06 audit):
 *   "Summer Camp 2026" 90, "summer_camp" 7, "summer camp" 1, "summer" 2,
 *   "Taekwondo" 8, "taekwondo" 7,
 *   "kickboxing" 6, "bjj" 1, "something weird" 1.
 *
 * This collapses them into 5 known buckets. Anything unrecognized returns
 * "other" so it won't accidentally match a campaign filter. Use this for
 * scoring + display; do NOT mutate the underlying column (history matters).
 */
export function normalizeVertical(raw?: string | null): string {
  if (!raw) return "other";
  const s = raw.toLowerCase().trim();
  if (s.includes("camp") || s === "summer") return "summer_camp";
  if (s.includes("afterschool") || s.includes("after-school") || s.includes("after school")) return "afterschool";
  if (s.includes("taekwondo") || s === "tkd") return "tkd";
  if (s.includes("kickbox")) return "kickboxing";
  if (s.includes("bjj") || s.includes("brazilian")) return "bjj";
  return "other";
}

/**
 * Merge a program-derived tag into a JSON tags-array string. Pure + idempotent.
 * The Leads view filters by these tags, so every lead should carry the tag for
 * the program it came in on (afterschool / tkd / kickboxing / bjj / summer_camp).
 * Tolerates null and legacy non-JSON tag values. Returns a JSON string.
 */
export function mergeProgramTag(tagsJson: string | null | undefined, programRaw?: string | null): string {
  let tags: string[] = [];
  if (tagsJson) {
    try { const p = JSON.parse(tagsJson); if (Array.isArray(p)) tags = p.map(String); } catch { /* legacy non-JSON, start fresh */ }
  }
  const vertical = normalizeVertical(programRaw);
  if (vertical !== "other" && !tags.includes(vertical)) tags.push(vertical);
  return JSON.stringify(tags);
}

/**
 * Ensure an EXISTING lead carries the program tag for a given raw program string.
 * Idempotent; a no-op when the program doesn't map to a known vertical or the tag
 * is already present. Returns the vertical applied, or null if nothing changed.
 */
export async function applyProgramTag(leadId: number, programRaw?: string | null): Promise<string | null> {
  const vertical = normalizeVertical(programRaw);
  if (vertical === "other") return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!rows[0]) return null;
  const merged = mergeProgramTag(rows[0].tags as string | null, programRaw);
  if (merged === (rows[0].tags ?? "[]")) return vertical; // already tagged, no write
  await db.update(leads).set({ tags: merged }).where(eq(leads.id, leadId));
  return vertical;
}

function todayDateString(): string {
  // YYYY-MM-DD in local time (America/New_York for TMA, but cron runs server-local)
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Live call board, computed from the current state of every lead (no stored
 * snapshot, so it always matches the calendar). Two buckets:
 *   today    — call now: trials today/tomorrow (confirm), past trials still
 *              unmarked (did they show?), no-shows, came-in-not-enrolled,
 *              follow-ups due, fresh leads, anyone who asked for a human.
 *   thisWeek — coming up: trials 2-7 days out, follow-ups scheduled this week.
 *              These auto-promote to `today` as their day arrives.
 * A lead stays until its state changes (you mark it, snooze it with a follow-up
 * date, or advance the stage), so nobody gets lost. Snoozing past today removes
 * it until the follow-up date.
 */
export type CallBoardItem = { lead: Lead; reason: string; sort: number };
export async function getCallBoard(): Promise<{ today: CallBoardItem[]; thisWeek: CallBoardItem[] }> {
  const db = await getDb();
  if (!db) return { today: [], thisWeek: [] };
  const candidates = await db.select().from(leads).where(
    sql`pipelineStage NOT IN ('enrolled','lost','no_show_final')
        AND (automationPaused IS NULL OR automationPaused = 0)`
  );
  // "Today" in America/New_York, matching the calendar and check-in pages.
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const todayMs = new Date(todayStr + "T12:00:00").getTime();
  const diff = (s: string | null | undefined) =>
    s ? Math.round((new Date(s + "T12:00:00").getTime() - todayMs) / 86400000) : null;
  const now = Date.now();
  const today: CallBoardItem[] = [];
  const thisWeek: CallBoardItem[] = [];

  for (const l of candidates) {
    const stage = l.pipelineStage;
    const fu = diff((l as any).nextFollowUpAt);
    // A scheduled follow-up date controls timing: future = snooze, due = call.
    if (fu !== null && fu > 0) {
      if (fu <= 7) thisWeek.push({ lead: l, reason: `follow-up scheduled for ${(l as any).nextFollowUpAt}`, sort: 200 + fu });
      continue; // more than a week out: hidden until it gets closer
    }
    if (fu !== null && fu <= 0) {
      today.push({ lead: l, reason: fu < 0 ? "follow-up overdue" : "follow-up due today", sort: fu < 0 ? 0 : 5 });
      continue;
    }
    // No follow-up set: route by stage + trial date.
    const td = diff(l.trialClassDate);
    if (stage === "trial_scheduled") {
      if (td === null) today.push({ lead: l, reason: "trial booked, confirm the time", sort: 22 });
      else if (td < 0) today.push({ lead: l, reason: `trial was ${l.trialClassDate}, did they show? mark it`, sort: 1 });
      else if (td === 0) today.push({ lead: l, reason: "trial is TODAY, confirm", sort: 10 });
      else if (td === 1) today.push({ lead: l, reason: "trial tomorrow, confirm", sort: 11 });
      else if (td <= 7) thisWeek.push({ lead: l, reason: `trial ${l.trialClassDate}, confirm closer`, sort: 100 + td });
      continue;
    }
    if (stage === "no_show") { today.push({ lead: l, reason: "no-showed trial, rebook", sort: 30 }); continue; }
    if (stage === "trial_attended") { today.push({ lead: l, reason: "came in but didn't enroll, follow up to close", sort: 31 }); continue; }
    if (stage === "trial_paid") { today.push({ lead: l, reason: "paid trial, follow up to enroll", sort: 32 }); continue; }
    if ((l as any).noOutboundCalls === 1) { today.push({ lead: l, reason: "asked for a human, call them", sort: 2 }); continue; }
    const ageDays = (now - (l.createdAt ? new Date(l.createdAt).getTime() : now)) / 86400000;
    if (stage === "new_lead" && ageDays <= 3) { today.push({ lead: l, reason: "new lead, call fast", sort: 12 }); continue; }
    if (stage === "contacted" && ageDays >= 5) { today.push({ lead: l, reason: `contacted ${Math.floor(ageDays)}d ago, follow up`, sort: 40 }); continue; }
    // older new_lead / recently-contacted: worked through bulk lists, not the daily board
  }
  today.sort((a, b) => a.sort - b.sort);
  thisWeek.sort((a, b) => a.sort - b.sort);
  return { today, thisWeek };
}

/**
 * Pick the top N leads to call today, by score, and write to dailyCallQueue.
 *
 * Scoring (initial heuristic — refine after we have email open/click data):
 *  +50  trial_no_show_final in last 7 days        (last shot)
 *  +40  trial_scheduled in next 3 days            (confirm)
 *  +35  no_show in last 3 days                    (rebook)
 *  +30  contacted but no reply >= 5 days          (follow-up)
 *  +25  new_lead < 24h old                        (speed-to-lead)
 *  +20  programInterest matches active campaign   (summer_camp for now)
 *  +10  has phone number
 *  -100 enrolled / lost / opted out               (excluded entirely)
 *
 * Returns the inserted rows. Idempotent for (leadId, queueDate) — repeated
 * calls in the same day are no-ops thanks to the unique index.
 */
export async function generateDailyCallQueue(opts: {
  limit?: number;
  activeVertical?: string;  // e.g. "Summer Camp" — boosts matching leads
} = {}): Promise<DailyCallQueueRow[]> {
  const db = await getDb();
  if (!db) return [];
  const limit = opts.limit ?? 5;
  const date = todayDateString();

  // Pull every non-terminal lead. Volumes are small (hundreds) so we score in JS
  // rather than wrestling MySQL into ranking expressions.
  const candidates = await db.select().from(leads).where(
    sql`pipelineStage NOT IN ('enrolled','lost','no_show_final')
        AND (automationPaused IS NULL OR automationPaused = 0)`
  );

  const now = Date.now();
  const scored = candidates.map(l => {
    let s = 0;
    const stage = l.pipelineStage;
    const ageMs = now - (l.createdAt ? new Date(l.createdAt).getTime() : now);
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const reasons: string[] = [];

    // Scheduled follow-up: a future date snoozes the lead (do not nag before
    // then); once the date has arrived it jumps to the top of the list.
    const followUp = (l as any).nextFollowUpAt as string | null;
    if (followUp && followUp > date) {
      return { lead: l, score: 0, reason: "snoozed until " + followUp };
    }
    if (followUp && followUp <= date) {
      s += 50;
      reasons.push("scheduled follow-up due");
    }

    if ((l as any).noOutboundCalls === 1) {
      s += 45;
      reasons.push("asked for a human, call them");
    }
    if (stage === "trial_scheduled") {
      s += 40;
      reasons.push("trial coming up, confirm");
    }
    if (stage === "trial_attended") {
      s += 38;
      reasons.push("came in but did not enroll, follow up to close");
    }
    if (stage === "no_show") {
      s += 35;
      reasons.push("no-showed trial, rebook");
    }
    if (stage === "contacted" && ageDays >= 5) {
      s += 30;
      reasons.push(`contacted ${Math.floor(ageDays)}d ago, no progress`);
    }
    if (stage === "new_lead" && ageDays < 1) {
      s += 25;
      reasons.push("new lead, speed-to-lead");
    }
    // Match on the NORMALIZED vertical so "Summer Camp 2026" and "summer_camp"
    // both match an activeVertical of "summer_camp" or "Summer Camp".
    const leadVertical = normalizeVertical(l.programInterest);
    const wantVertical = normalizeVertical(opts.activeVertical);
    if (opts.activeVertical && leadVertical === wantVertical && leadVertical !== "other") {
      s += 20;
      reasons.push(`active campaign: ${leadVertical}`);
    }
    if (l.phone && l.phone.replace(/\D/g, "").length >= 10) {
      s += 10;
    }

    return { lead: l, score: s, reason: reasons.join(" + ") || "general follow-up" };
  })
  .filter(x => x.score > 0 && x.lead.phone)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

  const inserted: DailyCallQueueRow[] = [];
  for (const item of scored) {
    try {
      await db.insert(dailyCallQueue).values({
        leadId: item.lead.id,
        queueDate: date,
        score: item.score,
        reason: item.reason,
        // Store the NORMALIZED bucket. Raw value is still on leads.programInterest
        // if anyone needs the original string.
        vertical: normalizeVertical(item.lead.programInterest),
        status: "pending",
      } as any);
      const [row] = await db.select().from(dailyCallQueue).where(
        and(eq(dailyCallQueue.leadId, item.lead.id), eq(dailyCallQueue.queueDate, date))!
      );
      if (row) inserted.push(row);
    } catch (e) {
      // duplicate key — that lead already on today's list, fine
    }
  }
  return inserted;
}

export async function listTodaysCalls(date?: string): Promise<Array<DailyCallQueueRow & { lead: Lead | null }>> {
  const db = await getDb();
  if (!db) return [];
  const d = date ?? todayDateString();
  const rows = await db.select().from(dailyCallQueue)
    .where(eq(dailyCallQueue.queueDate, d))
    .orderBy(desc(dailyCallQueue.score));
  // Join leads in JS — small N
  const result = [];
  for (const r of rows) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, r.leadId));
    result.push({ ...r, lead: lead ?? null });
  }
  return result;
}

export async function markCallOutcome(args: {
  id: number;
  status: CallOutcome;
  outcomeNotes?: string | null;
  calledBy: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not configured");
  const [row] = await db.select().from(dailyCallQueue).where(eq(dailyCallQueue.id, args.id));
  if (!row) throw new Error("Call row not found");

  await db.update(dailyCallQueue).set({
    status: args.status,
    outcomeNotes: args.outcomeNotes ?? null,
    calledAt: new Date(),
    calledBy: args.calledBy,
  } as any).where(eq(dailyCallQueue.id, args.id));

  // Mirror into leadActivities so the lead's timeline shows the call.
  await db.insert(leadActivities).values({
    leadId: row.leadId,
    type: "call",
    direction: "outbound",
    subject: `Call: ${args.status}`,
    body: args.outcomeNotes ?? null,
    sentBy: args.calledBy,
    status: args.status,
  } as any);

  // Side-effect: if the outcome is "booked", pull the lead to trial_scheduled.
  // If "not_interested", drop to lost.
  if (args.status === "booked") {
    await db.update(leads).set({ pipelineStage: "trial_scheduled" } as any)
      .where(eq(leads.id, row.leadId));
  } else if (args.status === "not_interested") {
    await db.update(leads).set({ pipelineStage: "lost" } as any)
      .where(eq(leads.id, row.leadId));
  }
}

/**
 * Used by the Gmail reply poller. Looks up the lead by email, writes an
 * inbound activity row with the Gmail messageId as externalId so reprocessing
 * the same message is a no-op (unique index).
 *
 * Returns { matched: number, activityId?: number } where `matched` is the lead id
 * found by email (0 if none).
 */
export async function recordInboundEmailReply(args: {
  fromEmail: string;
  subject: string;
  body: string;
  gmailMessageId: string;
  receivedAt: Date;
}): Promise<{ matched: number; activityId?: number }> {
  const db = await getDb();
  if (!db) return { matched: 0 };

  const lookupEmail = args.fromEmail.toLowerCase().trim();
  const [lead] = await db.select().from(leads).where(
    sql`LOWER(${leads.email}) = ${lookupEmail}`
  );
  if (!lead) return { matched: 0 };

  // ── STOP / UNSUBSCRIBE keyword detection ──────────────────────────────────
  // If the body (trimmed, first line) matches an opt-out keyword, auto-flip
  // automationPaused=1 and write a distinct activity status so the admin
  // timeline shows "unsubscribed via reply" rather than a generic reply.
  const firstLine = (args.body ?? '').trim().split(/\r?\n/)[0].trim();
  const isStopRequest = /^(STOP|UNSUBSCRIBE|REMOVE ME|REMOVE|END|CANCEL|QUIT)$/i.test(firstLine);

  // Insert. Unique index on externalId stops duplicate writes for the same Gmail message.
  try {
    await db.insert(leadActivities).values({
      leadId: lead.id,
      type: "email",
      direction: "inbound",
      subject: args.subject?.slice(0, 255) ?? null,
      body: args.body?.slice(0, 65000) ?? null,
      sentBy: "gmail_reply_poller",
      status: isStopRequest ? "unsubscribed_by_reply" : "replied",
      externalId: args.gmailMessageId,
    } as any);
  } catch (e: any) {
    // duplicate key = already processed this message
    if (e?.code === "ER_DUP_ENTRY") return { matched: lead.id };
    throw e;
  }

  if (isStopRequest) {
    // Flip automation off immediately — preSendGuard checks this flag before
    // every touch so no further sequence emails will be sent to this lead.
    await db.update(leads).set({
      automationPaused: 1,
      automationPausedAt: new Date(),
      automationPausedBy: 'gmail_reply_poller',
      automationPauseReason: `STOP keyword reply: "${firstLine.slice(0, 80)}"`,
    } as any).where(eq(leads.id, lead.id));

    await logAudit({
      level: 'info',
      source: 'inbound_email',
      event: 'stop_keyword_unsubscribed',
      leadId: lead.id,
      details: JSON.stringify({ gmailMessageId: args.gmailMessageId, firstLine }),
    });

    return { matched: lead.id };
  }

  // If lead is still in early stages, the fact that they replied is a strong
  // signal — promote them to "contacted" if they were "new_lead".
  if (lead.pipelineStage === "new_lead") {
    await db.update(leads).set({ pipelineStage: "contacted" } as any)
      .where(eq(leads.id, lead.id));
  }

  return { matched: lead.id };
}

// 2026-06-04: dedicated retag endpoint. Sets BOTH the primary vertical (first tag)
// AND the JSON tags column atomically. Used by the gallery "edit tags" modal AND
// by an admin bulk-fix flow.
export async function setStudioAssetTags(id: number, tags: StudioVertical[]): Promise<void> {
  if (!tags || tags.length === 0) throw new Error("At least one tag is required");
  const db = await getDb();
  if (!db) throw new Error("Database not configured");
  await db.update(studioAssets).set({
    vertical: tags[0],
    tags: JSON.stringify(tags),
  } as any).where(eq(studioAssets.id, id));
}

export async function deleteStudioAsset(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not configured");
  await db.delete(studioAssets).where(eq(studioAssets.id, id));
}


// ─── Automation Controls / Kill Switch (2026-06-11) ───────────────────────────

export async function getAutomationControls(): Promise<AutomationControl[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(automationControls).orderBy(automationControls.label);
}

export async function isAutomationEnabled(controlKey: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // fail-open: if DB is unreachable, don't block (matches prior behavior)
  const [row] = await db.select().from(automationControls).where(eq(automationControls.controlKey, controlKey));
  // Unknown key -> treat as enabled (control not configured = not paused)
  return row ? row.enabled === 1 : true;
}

export async function setAutomationControl(controlKey: string, enabled: boolean, updatedBy: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not configured");
  await db.update(automationControls)
    .set({ enabled: enabled ? 1 : 0, updatedBy } as any)
    .where(eq(automationControls.controlKey, controlKey));
  await logAudit({
    level: enabled ? "info" : "warn",
    source: "kill_switch",
    event: enabled ? "automation_enabled" : "automation_paused",
    details: JSON.stringify({ controlKey, by: updatedBy }),
  });
}

/** Pause or resume EVERY automation at once (the big red button). */
export async function setAllAutomations(enabled: boolean, updatedBy: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not configured");
  await db.update(automationControls).set({ enabled: enabled ? 1 : 0, updatedBy } as any);
  await logAudit({
    level: enabled ? "info" : "critical",
    source: "kill_switch",
    event: enabled ? "all_automations_enabled" : "all_automations_paused",
    details: JSON.stringify({ by: updatedBy }),
  });
}

// ─── Outbound voice agent call logging (2026-06-11) ───────────────────────────

/**
 * Records the result of an OUTBOUND voice-agent call against a lead so it
 * shows in /admin/calls (dailyCallQueue) and on the lead timeline.
 */
export async function recordOutboundCall(args: {
  leadId: number;
  status: CallOutcome;
  summary: string;
  calledBy: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not configured");
  const date = todayDateString();

  const [existing] = await db.select().from(dailyCallQueue)
    .where(and(eq(dailyCallQueue.leadId, args.leadId), eq(dailyCallQueue.queueDate, date))!);
  if (existing) {
    await db.update(dailyCallQueue).set({
      status: args.status, outcomeNotes: args.summary,
      calledAt: new Date(), calledBy: args.calledBy,
    } as any).where(eq(dailyCallQueue.id, existing.id));
  } else {
    const [lead] = await db.select().from(leads).where(eq(leads.id, args.leadId));
    await db.insert(dailyCallQueue).values({
      leadId: args.leadId, queueDate: date, score: 0,
      reason: "outbound voice agent call",
      vertical: normalizeVertical(lead?.programInterest),
      status: args.status, outcomeNotes: args.summary,
      calledAt: new Date(), calledBy: args.calledBy,
    } as any);
  }

  await db.insert(leadActivities).values({
    leadId: args.leadId, type: "call", direction: "outbound",
    subject: `Outbound voice: ${args.status}`, body: args.summary,
    sentBy: args.calledBy, status: args.status,
  } as any);

  if (args.status === "not_interested") {
    await db.update(leads).set({ pipelineStage: "lost" } as any).where(eq(leads.id, args.leadId));
  }
}

/** Lead context for an outbound agent to read at the start of a call. */
export async function getLeadContextForCall(leadId: number): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return null;
  const parentMissing = !lead.parentName || lead.parentName.trim() === "" ||
    lead.parentName.trim().toLowerCase() === (lead.kidName ?? "").trim().toLowerCase();
  return {
    leadId: lead.id,
    parentName: lead.parentName ?? null,
    studentName: lead.kidName ?? null,
    studentAge: lead.kidAge ?? null,
    program: lead.programInterest ?? null,
    phone: lead.phone ?? null,
    stage: lead.pipelineStage,
    trialDate: lead.trialClassDate ?? null,
    trialTime: lead.trialClassTime ?? null,
    inquiredAbout: lead.motivation ?? lead.additionalNotes ?? null,
    note: parentMissing
      ? "No separate parent name on file; this may be the student themselves. Confirm who you're speaking with."
      : `Speaking with the parent (${lead.parentName}) about ${lead.kidName}.`,
  };
}

// ─── Outbound voice opt-out (2026-06-11) ──────────────────────────────────────
// Set when a caller on an OUTBOUND agent call asks for a human. Stops the
// outbound voice agent from calling again. Inbound/email/SMS unaffected.
export async function setNoOutboundCalls(leadId: number, on: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not configured");
  await db.update(leads).set({
    noOutboundCalls: on ? 1 : 0,
    noOutboundCallsAt: on ? new Date() : null,
  } as any).where(eq(leads.id, leadId));
}

// ─── Outbound voice candidate queries (2026-06-11) ────────────────────────────
// All exclude noOutboundCalls leads. The outbound-voice handlers add the
// kill-switch, calling-hours, and per-lead dedup guards.

// The three trial-class flows below only target trial-class programs
// (Taekwondo, Kickboxing, BJJ, Little Tigers). Afterschool has its own
// afterschool_tour flow; summer camp is email-only. Excluding both here keeps
// those leads from getting a "book a free trial" call that doesn't apply to
// them. COALESCE so leads with a NULL programInterest are NOT excluded.
const NOT_AFTERSCHOOL_OR_CAMP = sql`
    AND LOWER(COALESCE(programInterest,'')) NOT LIKE '%afterschool%'
    AND LOWER(COALESCE(programInterest,'')) NOT LIKE '%after-school%'
    AND LOWER(COALESCE(programInterest,'')) NOT LIKE '%after school%'
    AND LOWER(COALESCE(programInterest,'')) NOT LIKE '%camp%'`;

export async function getSpeedToLeadCandidates(): Promise<Lead[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).where(sql`
    pipelineStage = 'new_lead' AND trialClassDate IS NULL
    AND noOutboundCalls = 0
    ${NOT_AFTERSCHOOL_OR_CAMP}
    AND createdAt > (NOW() - INTERVAL 30 MINUTE)`);
}

export async function getNoShowRecoveryCandidates(): Promise<Lead[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).where(sql`
    pipelineStage = 'no_show' AND noOutboundCalls = 0
    ${NOT_AFTERSCHOOL_OR_CAMP}
    AND updatedAt > (NOW() - INTERVAL 2 DAY)`);
}

export async function getPostTrialCandidates(): Promise<Lead[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).where(sql`
    pipelineStage = 'trial_attended' AND noOutboundCalls = 0
    ${NOT_AFTERSCHOOL_OR_CAMP}
    AND trialClassDate IS NOT NULL
    AND trialClassDate <= DATE_SUB(CURDATE(), INTERVAL 3 DAY)
    AND trialClassDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`);
}

/**
 * Afterschool leads to invite for a TOUR (not a trial). The outbound
 * afterschool_tour flow targets these. Mirrors the speed-to-lead cadence so a
 * fresh afterschool inquiry gets a quick, on-script call (book a 2-4pm M/W/F
 * tour, or staff coordinates another time).
 */
export async function getAfterschoolTourCandidates(): Promise<Lead[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).where(sql`
    pipelineStage = 'new_lead' AND trialClassDate IS NULL
    AND noOutboundCalls = 0
    AND (
      LOWER(COALESCE(programInterest,'')) LIKE '%afterschool%'
      OR LOWER(COALESCE(programInterest,'')) LIKE '%after-school%'
      OR LOWER(COALESCE(programInterest,'')) LIKE '%after school%'
    )
    AND createdAt > (NOW() - INTERVAL 30 MINUTE)`);
}

/** Has the outbound agent already attempted this lead within `hours`? (dedup) */
export async function hasOutboundAttempt(leadId: number, hours: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(leadActivities).where(sql`
    leadId = ${leadId} AND sentBy = 'voice_agent_outbound'
    AND createdAt > (NOW() - INTERVAL ${hours} HOUR)`).limit(1);
  return rows.length > 0;
}

/** Record that an outbound call was placed (dedup marker; outcome comes later via log_call_outcome). */
export async function markOutboundAttempt(leadId: number, callType: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(leadActivities).values({
    leadId, type: "call", direction: "outbound",
    subject: `Outbound ${callType}: placing call`, body: null,
    sentBy: "voice_agent_outbound", status: "attempted",
  } as any);
}

// ─── Call Logs (written by the Retell call_analyzed webhook) ──────────────────
/** Upsert a call log by Retell callId (idempotent; the webhook can retry). */
export async function upsertCallLog(row: InsertCallLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(callLogs).values(row as any).onDuplicateKeyUpdate({
    set: {
      callerName: row.callerName, summary: row.summary, transcript: row.transcript,
      recordingUrl: row.recordingUrl, durationSec: row.durationSec,
      disconnectReason: row.disconnectReason, sentiment: row.sentiment,
      intent: row.intent, booked: row.booked, leadId: row.leadId,
    } as any,
  });
}

/** Recent calls for the dashboard call log, newest first. */
export async function listCallLogs(limit = 100, offset = 0): Promise<CallLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callLogs).orderBy(desc(callLogs.createdAt)).limit(limit).offset(offset);
}

/** One call by numeric id or by Retell callId (for the transcript pane). */
export async function getCallLog(idOrCallId: number | string): Promise<CallLog | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = typeof idOrCallId === "number"
    ? await db.select().from(callLogs).where(eq(callLogs.id, idOrCallId)).limit(1)
    : await db.select().from(callLogs).where(eq(callLogs.callId, idOrCallId)).limit(1);
  return rows[0] ?? null;
}

/** Best-effort: find a lead id by phone (last 10 digits) so inbound calls link
 *  to the CRM and show the saved name. Returns null if no confident match. */
export async function findLeadIdByPhone(phone: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const last10 = (phone || "").replace(/\D/g, "").slice(-10);
  if (last10.length < 10) return null;
  try {
    const rows = await db.select({ id: leads.id, parentName: leads.parentName }).from(leads)
      .where(sql`RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', ''), 10) = ${last10}`)
      .orderBy(desc(leads.id)).limit(1);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Lead name + phone by id, for resolving the caller name on a call log. */
export async function getLeadNameById(leadId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ parentName: leads.parentName }).from(leads).where(eq(leads.id, leadId)).limit(1);
  return rows[0]?.parentName ?? null;
}

/** A returning parent (their email already has a lead) is booking another trial
 *  via the voice agent, typically a second child. Update their existing lead
 *  with the new trial and append a note about the child, instead of failing on
 *  the unique-email constraint. Staff get pinged to confirm both kids. */
export async function recordReturningParentTrial(args: {
  leadId: number; studentName: string; studentAge: string; program: string;
  dateIso: string; time: string | null; existingNotes?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const when = `${args.dateIso}${args.time ? " at " + args.time : ""}`;
  const note = `[voice booking] Also booking ${args.studentName} (age ${args.studentAge}) for ${args.program} on ${when}.`;
  const internalNotes = [args.existingNotes, note].filter(Boolean).join("\n");
  await db.update(leads).set({
    pipelineStage: "trial_scheduled",
    trialClassDate: args.dateIso,
    trialClassTime: args.time ?? null,
    internalNotes,
  }).where(eq(leads.id, args.leadId));
}
