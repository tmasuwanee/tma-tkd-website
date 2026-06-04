import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, uniqueIndex, tinyint, index, boolean } from "drizzle-orm/mysql-core";

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
  // UNIQUE — defense in depth against the 2026-05-20 duplicate-lead incident.
  // App code already lowercases on insert (server/db.ts createLead) and uses LOWER()
  // on read (server/db.ts getLeadByEmail). This unique index is the backstop.
  // BEFORE applying this migration, Manus MUST run:
  //   UPDATE leads SET email = LOWER(TRIM(email));
  // (and resolve any remaining duplicate rows from the legacy data) or `drizzle-kit push` will fail.
  email: varchar("email", { length: 320 }).notNull().unique(),
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
  // Lead Conductor (2026-05-19): structured automation pause flag.
  // Workflows check this boolean directly instead of parsing internalNotes for '[AUTOMATION_PAUSED]'.
  automationPaused: tinyint("automationPaused").default(0).notNull(),
  automationPausedAt: timestamp("automationPausedAt"),
  automationPausedBy: varchar("automationPausedBy", { length: 100 }),
  automationPauseReason: varchar("automationPauseReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

export const leadActivities = mysqlTable("leadActivities", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull().references(() => leads.id),
  type: mysqlEnum("type", ["email", "sms", "call", "note"]).notNull(),
  subject: varchar("subject", { length: 255 }),
  body: text("body"),
  // Who sent it: n8n_intake | n8n_noshow | n8n_fbsync | staff
  sentBy: varchar("sentBy", { length: 100 }),
  // sent | failed | opened
  status: varchar("status", { length: 50 }).default("sent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = typeof leadActivities.$inferInsert;

export const students = mysqlTable("students", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  programs: text("programs"),
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
  // Camper 1 (required)
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
  // Parent / guardian info
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
  numCampers: int("numCampers").default(1).notNull(),
  addFieldTrip: int("addFieldTrip").default(0).notNull(),
  addExtendedCare: int("addExtendedCare").default(0).notNull(),
  anticipatedWeeks: text("anticipatedWeeks"),
  futureWeeks: text("futureWeeks"),
  firstWeek: varchar("firstWeek", { length: 100 }).notNull(),
  // Payment
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripePaymentStatus: varchar("stripePaymentStatus", { length: 50 }).default("pending"),
  amountPaid: int("amountPaid").default(0).notNull(),
  agreedToTerms: int("agreedToTerms").default(0).notNull(),
  // Soft delete
  isDeleted: int("isDeleted").default(0).notNull(),
  deletedAt: timestamp("deletedAt"),
  // Per-week add-on selections (JSON arrays)
  fieldTripWeeks: text("fieldTripWeeks"),
  extendedCareWeeks: text("extendedCareWeeks"),
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

// Lead Conductor (2026-05-19): planned future touches.
// The Sequence Dispatcher workflow polls this table every 5 minutes,
// finds due rows, runs pre-send checks, dispatches via Resend (email)
// or Twilio (sms, when available), then marks row sent/skipped/failed.
//
// leadActivities = immutable history of what already happened
// leadSequenceQueue = planned future touches
//
// Staff can edit, skip, cancel, or send-now any row before dispatch
// via the tRPC sequence.* procedures.
export const leadSequenceQueue = mysqlTable("leadSequenceQueue", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull().references(() => leads.id),

  scheduledFor: timestamp("scheduledFor").notNull(),

  channel: mysqlEnum("channel", ["email", "sms", "call_reminder", "internal_task"]).notNull(),
  // Logical sequence grouping (e.g. 'lead_intake_nurture', 'no_show_recovery')
  // Used for bulk cancel ("cancel all nurture for this lead").
  sequenceKey: varchar("sequenceKey", { length: 100 }),
  // Stable per-touch identifier (e.g. 'day_2_nurture_email', 'trial_24h_reminder_email').
  // Use this for idempotency checks AND UI labels.
  touchKey: varchar("touchKey", { length: 100 }).notNull(),

  touchSubject: varchar("touchSubject", { length: 255 }),
  // Template body — dispatcher uses this if no override.
  touchBodyTemplate: text("touchBodyTemplate"),
  // Per-lead override set via UI editor. Dispatcher prefers this when present.
  touchBodyOverride: text("touchBodyOverride"),

  status: mysqlEnum("status", ["scheduled", "processing", "sent", "skipped", "cancelled", "failed"])
    .default("scheduled").notNull(),

  skipReason: varchar("skipReason", { length: 255 }),
  cancelReason: varchar("cancelReason", { length: 255 }),
  failureReason: text("failureReason"),

  sentAt: timestamp("sentAt"),
  skippedAt: timestamp("skippedAt"),
  cancelledAt: timestamp("cancelledAt"),
  failedAt: timestamp("failedAt"),

  createdBy: varchar("createdBy", { length: 100 }).default("system").notNull(),
  updatedBy: varchar("updatedBy", { length: 100 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Dispatcher's main query: where scheduledFor <= NOW() AND status = 'scheduled'
  dispatchIdx: index("dispatch_idx").on(table.scheduledFor, table.status),
  // Per-lead lookups (UI Lead Conductor panel)
  leadIdx: index("queue_lead_idx").on(table.leadId),
  // Idempotency check: "has this touchKey already been scheduled/sent for this lead?"
  touchKeyIdx: index("queue_touch_key_idx").on(table.leadId, table.touchKey, table.status),
}));

export type LeadSequenceQueue = typeof leadSequenceQueue.$inferSelect;
export type InsertLeadSequenceQueue = typeof leadSequenceQueue.$inferInsert;

// =====================================================================
// LIFECYCLE ARCHITECTURE v1 (2026-05-20)
// Added in response to TMA 5/20 dupe-email + tagging-mismatch incident.
// See TMA_LIFECYCLE_ARCHITECTURE.md (Desktop) for full design rationale.
// =====================================================================

// --- Subsystem B: Editable email/SMS templates ---
// One row per (sequenceKey, touchKey). Admin UI reads/writes these.
// The Sequence Dispatcher reads the active template at dispatch time and
// snapshots subject+body into the queue row before sending — so an in-flight
// touch is not affected by mid-flight edits.
export const sequenceTemplates = mysqlTable("sequenceTemplates", {
  id: int("id").autoincrement().primaryKey(),
  sequenceKey: varchar("sequenceKey", { length: 100 }).notNull(),
  touchKey: varchar("touchKey", { length: 100 }).notNull(),
  // Display order within the sequence (for admin UI)
  orderIndex: int("orderIndex").default(0).notNull(),
  // Hours after sequence-enrollment-event that this touch fires
  delayHours: int("delayHours").default(0).notNull(),
  channel: mysqlEnum("channel", ["email", "sms", "call_reminder", "internal_task"])
    .default("email").notNull(),
  // Handlebars-style merge fields: {{firstName}}, {{trialDate}}, etc.
  subject: varchar("subject", { length: 500 }),
  bodyHtml: text("bodyHtml"),
  bodyText: text("bodyText"),
  // When false, the dispatcher logs "skipped — template inactive" and continues.
  isActive: tinyint("isActive").default(1).notNull(),
  // Human-readable label shown in admin UI list
  displayName: varchar("displayName", { length: 255 }),
  // What this template is for (admin UI tooltip)
  description: text("description"),
  createdBy: varchar("createdBy", { length: 100 }).default("system").notNull(),
  updatedBy: varchar("updatedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Unique per (sequenceKey, touchKey) — only one active template per touch
  sequenceTouchIdx: uniqueIndex("sequence_touch_idx").on(table.sequenceKey, table.touchKey),
}));

export type SequenceTemplate = typeof sequenceTemplates.$inferSelect;
export type InsertSequenceTemplate = typeof sequenceTemplates.$inferInsert;

// Append-only history of every template edit. Lets admin UI roll back.
export const sequenceTemplateHistory = mysqlTable("sequenceTemplateHistory", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull().references(() => sequenceTemplates.id),
  // Snapshot of the template state BEFORE this edit
  prevSubject: varchar("prevSubject", { length: 500 }),
  prevBodyHtml: text("prevBodyHtml"),
  prevBodyText: text("prevBodyText"),
  prevDelayHours: int("prevDelayHours"),
  prevIsActive: tinyint("prevIsActive"),
  // Who edited and when
  editedBy: varchar("editedBy", { length: 100 }).notNull(),
  editedAt: timestamp("editedAt").defaultNow().notNull(),
  // Optional note from editor explaining the change
  changeNote: varchar("changeNote", { length: 500 }),
}, (table) => ({
  templateIdx: index("template_history_idx").on(table.templateId, table.editedAt),
}));

export type SequenceTemplateHistory = typeof sequenceTemplateHistory.$inferSelect;
export type InsertSequenceTemplateHistory = typeof sequenceTemplateHistory.$inferInsert;

// --- Subsystem A: Intake routing rules ---
// First-match-wins, priority-ordered. The intake router queries this
// table once per inbound lead and routes them into the matching sequence.
// Editable from /admin/intake-rules. If zero rules match, lead goes to
// 'unsegmented' sequence which alerts staff and does NOT auto-send.
export const sequenceTriggerRules = mysqlTable("sequenceTriggerRules", {
  id: int("id").autoincrement().primaryKey(),
  // Higher priority evaluated first; ties broken by lower id
  priority: int("priority").default(100).notNull(),
  // Human-readable label
  ruleName: varchar("ruleName", { length: 255 }).notNull(),
  // What field on the lead payload to inspect:
  //   'tag'             - check if lead.tags contains a value
  //   'utmSource'       - lead.utmSource exact match
  //   'utmCampaign'     - lead.utmCampaign exact match (or contains)
  //   'programInterest' - lead.programInterest exact match (or contains)
  //   'hasTrialDate'    - boolean: lead.trialClassDate present
  matchField: mysqlEnum("matchField", [
    "tag", "utmSource", "utmCampaign", "programInterest", "hasTrialDate"
  ]).notNull(),
  // How to compare:
  //   'equals'      - exact case-insensitive match
  //   'contains'    - substring case-insensitive match (or tag-in-array)
  //   'starts_with' - prefix match
  //   'is_true'     - boolean field check (only valid for hasTrialDate)
  matchOperator: mysqlEnum("matchOperator", [
    "equals", "contains", "starts_with", "is_true"
  ]).default("equals").notNull(),
  // Value to compare against (ignored for is_true)
  matchValue: varchar("matchValue", { length: 255 }),
  // Which sequence to enroll into when this rule matches
  sequenceKey: varchar("sequenceKey", { length: 100 }).notNull(),
  // When false, rule is ignored. Use to A/B test rules.
  isActive: tinyint("isActive").default(1).notNull(),
  description: text("description"),
  createdBy: varchar("createdBy", { length: 100 }).default("system").notNull(),
  updatedBy: varchar("updatedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  priorityIdx: index("rule_priority_idx").on(table.priority, table.isActive),
}));

export type SequenceTriggerRule = typeof sequenceTriggerRules.$inferSelect;
export type InsertSequenceTriggerRule = typeof sequenceTriggerRules.$inferInsert;

// --- Subsystem C: Lifecycle state machine ---
// Append-only event log of every stage transition for every lead.
// The leads.pipelineStage column is the CURRENT state; this table is HISTORY.
// Every n8n workflow + tRPC mutation that changes stage MUST call
// lifecycle.recordTransition() instead of directly UPDATE-ing leads.pipelineStage.
// That function:
//   1. Validates the transition is legal
//   2. Updates leads.pipelineStage
//   3. Writes the row here
//   4. Applies side effects (cancel queued touches, etc.) per the new stage
export const leadLifecycleEvents = mysqlTable("leadLifecycleEvents", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull().references(() => leads.id),
  fromStage: varchar("fromStage", { length: 50 }),
  toStage: varchar("toStage", { length: 50 }).notNull(),
  // Who/what caused this:
  //   'system_auto'           - automatic (e.g., trial-date-passed)
  //   'staff_manual:<email>'  - staff member clicked in admin UI
  //   'n8n:<workflow_id>'     - n8n workflow
  //   'tRPC:<procedure>'      - direct API call
  triggeredBy: varchar("triggeredBy", { length: 100 }).notNull(),
  // Why: 'enrolled_via_reconciler', 'staff_override_to_lost', etc.
  reason: varchar("reason", { length: 255 }),
  // What side effects ran (JSON):
  //   { cancelledQueueIds: [1,2,3], enqueuedSequences: ['no_show_recovery'] }
  sideEffects: text("sideEffects"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  leadIdx: index("lifecycle_lead_idx").on(table.leadId, table.createdAt),
}));

export type LeadLifecycleEvent = typeof leadLifecycleEvents.$inferSelect;
export type InsertLeadLifecycleEvent = typeof leadLifecycleEvents.$inferInsert;

// --- System-wide audit log for failed operations, security events, deploy markers ---
// Separate from leadActivities (per-lead) and leadLifecycleEvents (per-lead-stage).
// This catches everything else: failed dispatcher runs, blocked sends due to
// opted-out lead, template-not-found errors, deploy sentinels, quota gate trips.
export const systemAuditLog = mysqlTable("systemAuditLog", {
  id: int("id").autoincrement().primaryKey(),
  // Severity for filtering
  level: mysqlEnum("level", ["info", "warn", "error", "critical"]).default("info").notNull(),
  // What component
  source: varchar("source", { length: 100 }).notNull(),
  // What happened
  event: varchar("event", { length: 255 }).notNull(),
  // JSON detail blob
  details: text("details"),
  // Optional lead context
  leadId: int("leadId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  levelTimeIdx: index("audit_level_time_idx").on(table.level, table.createdAt),
  sourceIdx: index("audit_source_idx").on(table.source, table.createdAt),
}));

export type SystemAuditLog = typeof systemAuditLog.$inferSelect;
export type InsertSystemAuditLog = typeof systemAuditLog.$inferInsert;

// ─── Studio Assets (2026-06-02) ──────────────────────────────────────────────
// Phone-shot photos and short videos uploaded by Arfa / Ms. Aniessa from
// tmatkd.com/studio. Fed into the martial-arts-ad-research skill for ad mockups.
// Files live in the Manus storage proxy under key `studio/<vertical>/<id>-<slug>`.
export const studioAssets = mysqlTable("studioAssets", {
  id: int("id").autoincrement().primaryKey(),
  vertical: mysqlEnum("vertical", [
    "afterschool", "tkd", "kickboxing", "bjj",
    "summer_camp", "spring_break_camp", "camps_general", "all_programs",
  ]).notNull(),
  // Storage key in the Manus storage proxy (and what the skill downloads by)
  storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
  // Original filename from the phone (for human eyeballing)
  originalName: varchar("originalName", { length: 255 }).notNull(),
  // image/jpeg, image/png, video/mp4, video/quicktime, etc.
  contentType: varchar("contentType", { length: 100 }).notNull(),
  // Bytes — surfaced in the gallery so Ms. Aniessa sees if she just uploaded a 300MB clip
  sizeBytes: int("sizeBytes").notNull(),
  // photo | video — derived from contentType, but stored for cheap filtering
  kind: mysqlEnum("kind", ["photo", "video"]).notNull(),
  // 2026-06-04: multi-tag support. JSON array of vertical strings,
  // e.g. '["afterschool","camps_general"]'. `vertical` above stays as the
  // "primary tag" (first element) for back-compat display. Queries check both.
  tags: text("tags"),
  // Free-text caption Ms. Aniessa can add ("Tuesday 6pm pickup, Ethan with backpack")
  caption: text("caption"),
  // Photo release for minors signed and on file? Skill flags assets without release.
  minorReleaseOnFile: boolean("minorReleaseOnFile").default(false).notNull(),
  // Email of the uploader (Arfa or Ms. Aniessa — used in the gallery)
  uploadedByEmail: varchar("uploadedByEmail", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  verticalIdx: index("studio_vertical_idx").on(table.vertical, table.createdAt),
  kindIdx: index("studio_kind_idx").on(table.kind),
}));

export type StudioAsset = typeof studioAssets.$inferSelect;
export type InsertStudioAsset = typeof studioAssets.$inferInsert;

