import { eq, desc, or, like, inArray, isNotNull, and, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import {
  InsertUser, users,
  leads, InsertLead, Lead,
  campRegistrations, InsertCampRegistration,
  students, InsertStudent, Student,
  attendance, InsertAttendance, Attendance,
} from "../drizzle/schema";
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

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(leads).where(eq(leads.id, id));
}

// ─── Students ────────────────────────────────────────────────────────────────

export async function upsertStudents(rows: InsertStudent[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Clear all existing students and replace with fresh CSV data
  await db.delete(students);
  if (rows.length > 0) {
    // Insert in batches of 100 to avoid query size limits
    for (let i = 0; i < rows.length; i += 100) {
      await db.insert(students).values(rows.slice(i, i + 100));
    }
  }
}

export async function getAllStudents() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(students).orderBy(students.name);
}

export async function searchStudents(query: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const q = `%${query}%`;
  return db.select().from(students).where(
    or(
      like(students.name, q),
      like(students.email, q),
      like(students.phone, q),
    )
  ).orderBy(students.name);
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
    if (count >= 15) {
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
