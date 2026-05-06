import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Leads table for free class inquiries
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  parentName: varchar("parentName", { length: 255 }).notNull(),
  kidName: varchar("kidName", { length: 255 }).notNull(),
  kidAge: varchar("kidAge", { length: 50 }).notNull(),
  programInterest: varchar("programInterest", { length: 255 }).notNull(), // taekwondo, bjj, kickboxing, afterschool
  motivation: varchar("motivation", { length: 255 }), // self-defense, discipline, fitness, confidence, etc
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  additionalNotes: text("additionalNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// Summer camp registrations table
export const campRegistrations = mysqlTable("campRegistrations", {
  id: int("id").autoincrement().primaryKey(),
  // Camper info (up to 3)
  camper1Name: varchar("camper1Name", { length: 255 }).notNull(),
  camper1Dob: varchar("camper1Dob", { length: 20 }).notNull(),
  camper1Age: varchar("camper1Age", { length: 10 }).notNull(),
  camper1Sex: varchar("camper1Sex", { length: 10 }).notNull(),
  camper2Name: varchar("camper2Name", { length: 255 }),
  camper2Dob: varchar("camper2Dob", { length: 20 }),
  camper2Age: varchar("camper2Age", { length: 10 }),
  camper2Sex: varchar("camper2Sex", { length: 10 }),
  camper3Name: varchar("camper3Name", { length: 255 }),
  camper3Dob: varchar("camper3Dob", { length: 20 }),
  camper3Age: varchar("camper3Age", { length: 10 }),
  camper3Sex: varchar("camper3Sex", { length: 10 }),
  // Parent/guardian info
  parentFirstName: varchar("parentFirstName", { length: 255 }).notNull(),
  parentLastName: varchar("parentLastName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  address: varchar("address", { length: 500 }).notNull(),
  city: varchar("city", { length: 255 }).notNull(),
  state: varchar("state", { length: 50 }).notNull(),
  zip: varchar("zip", { length: 20 }).notNull(),
  howDidYouHear: varchar("howDidYouHear", { length: 255 }),
  // Program selection
  programType: mysqlEnum("programType", ["3day", "5day", "daily"]).notNull(),
  numCampers: int("numCampers").notNull().default(1),
  addFieldTrip: int("addFieldTrip").notNull().default(0), // 0 or 1
  addExtendedCare: int("addExtendedCare").notNull().default(0), // early drop-off + late pickup bundled
  // Weeks selected
  anticipatedWeeks: text("anticipatedWeeks"), // JSON array of week strings (paid now)
  futureWeeks: text("futureWeeks"), // JSON array of week strings (intend to pay later)
  firstWeek: varchar("firstWeek", { length: 100 }).notNull(),
  // Payment
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripePaymentStatus: varchar("stripePaymentStatus", { length: 50 }).default("pending"),
  amountPaid: int("amountPaid").notNull().default(0), // in cents
  // Terms
  agreedToTerms: int("agreedToTerms").notNull().default(0),
  // Soft delete
  isDeleted: int("isDeleted").notNull().default(0),
  deletedAt: timestamp("deletedAt"),
  // Per-week add-on tracking
  fieldTripWeeks: text("fieldTripWeeks"), // JSON array of weeks with field trip
  extendedCareWeeks: text("extendedCareWeeks"), // JSON array of weeks with extended care
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampRegistration = typeof campRegistrations.$inferSelect;
export type InsertCampRegistration = typeof campRegistrations.$inferInsert;