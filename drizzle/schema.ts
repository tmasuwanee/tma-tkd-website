import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, uniqueIndex, tinyint } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
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

export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  parentName: varchar("parentName", { length: 255 }).notNull(),
  kidName: varchar("kidName", { length: 255 }).notNull(),
  kidAge: varchar("kidAge", { length: 50 }).notNull(),
  programInterest: varchar("programInterest", { length: 255 }).notNull(),
  motivation: varchar("motivation", { length: 255 }),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  additionalNotes: text("additionalNotes"),
  pipelineStage: mysqlEnum("pipelineStage", [
    "new_lead", "contacted", "trial_scheduled", "trial_paid",
    "trial_attended", "enrolled", "no_show", "no_show_final", "lost"
  ]).default("new_lead").notNull(),
  trialPaidAmount: int("trialPaidAmount").default(0),
  internalNotes: text("internalNotes"),
  trialClassDate: varchar("trialClassDate", { length: 20 }),
  trialClassTime: varchar("trialClassTime", { length: 20 }),
  trialClassDay: varchar("trialClassDay", { length: 20 }),
  utmSource: varchar("utmSource", { length: 255 }),
  utmMedium: varchar("utmMedium", { length: 255 }),
  utmCampaign: varchar("utmCampaign", { length: 255 }),
  utmContent: varchar("utmContent", { length: 255 }),
  // Tags array stored as JSON string, e.g. '["facebook_lead","summer_camp_2026"]'
  tags: text("tags"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

export const students = mysqlTable("students", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  programs: text("programs"), // JSON array e.g. ["Taekwondo","BJJ"]
  enrollmentDate: varchar("enrollmentDate", { length: 50 }),
  beltRank: varchar("beltRank", { length: 100 }),
  lastPromotedAt: timestamp("lastPromotedAt"),
  status: varchar("status", { length: 50 }),
  emergencyContact: varchar("emergencyContact", { length: 255 }),
  isEligibleOverride: tinyint("isEligibleOverride").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Student = typeof students.$inferSelect;
export type InsertStudent = typeof students.$inferInsert;

export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("studentId").notNull().references(() => students.id),
  checkedInAt: timestamp("checkedInAt").defaultNow().notNull(),
  classDate: varchar("classDate", { length: 20 }).notNull(),
  loggedBy: mysqlEnum("loggedBy", ["kiosk", "staff"]).default("kiosk").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;

export const campRegistrations = mysqlTable("campRegistrations", {
  id: int("id").autoincrement().primaryKey(),
  // Camper 1
  camper1Name: varchar("camper1Name", { length: 255 }).notNull(),
  camper1Dob: varchar("camper1Dob", { length: 20 }).notNull(),
  camper1Age: varchar("camper1Age", { length: 10 }).notNull(),
  camper1Sex: varchar("camper1Sex", { length: 10 }).notNull(),
  // Camper 2 (optional)
  camper2Name: varchar("camper2Name", { length: 255 }),
  camper2Dob: varchar("camper2Dob", { length: 20 }),
  camper2Age: varchar("camper2Age", { length: 10 }),
  camper2Sex: varchar("camper2Sex", { length: 10 }),
  // Camper 3 (optional)
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
  // Program & scheduling
  programType: varchar("programType", { length: 100 }).notNull(),
  numCampers: int("numCampers").notNull(),
  addFieldTrip: tinyint("addFieldTrip").default(0).notNull(),
  addExtendedCare: tinyint("addExtendedCare").default(0).notNull(),
  anticipatedWeeks: int("anticipatedWeeks").default(1).notNull(),
  futureWeeks: int("futureWeeks").default(0).notNull(),
  firstWeek: varchar("firstWeek", { length: 50 }),
  fieldTripWeeks: int("fieldTripWeeks").default(0),
  extendedCareWeeks: int("extendedCareWeeks").default(0),
  // Payment
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripePaymentStatus: varchar("stripePaymentStatus", { length: 50 }),
  amountPaid: int("amountPaid").default(0),
  agreedToTerms: tinyint("agreedToTerms").default(0).notNull(),
  // Soft delete
  isDeleted: tinyint("isDeleted").default(0).notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampRegistration = typeof campRegistrations.$inferSelect;
export type InsertCampRegistration = typeof campRegistrations.$inferInsert;

export const facebookAdInsights = mysqlTable("facebook_ad_insights", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(),
  campaignId: varchar("campaignId", { length: 64 }),
  campaignName: varchar("campaignName", { length: 255 }),
  adsetId: varchar("adsetId", { length: 64 }),
  adsetName: varchar("adsetName", { length: 255 }),
  adId: varchar("adId", { length: 64 }),
  adName: varchar("adName", { length: 255 }),
  spend: varchar("spend", { length: 32 }).default("0"),
  impressions: int("impressions").default(0),
  clicks: int("clicks").default(0),
  leads: int("leads").default(0),
  costPerLead: varchar("costPerLead", { length: 32 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  dateAdIdx: uniqueIndex("date_ad_idx").on(table.date, table.adId),
}));

export type FacebookAdInsight = typeof facebookAdInsights.$inferSelect;
export type InsertFacebookAdInsight = typeof facebookAdInsights.$inferInsert;
