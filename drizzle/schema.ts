import { int, mysqlEnum, mysqlTable, text, mediumtext, timestamp, varchar, uniqueIndex, tinyint, index, boolean } from "drizzle-orm/mysql-core";

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
  // 2026-06-08: CTIA-compliant SMS consent (Twilio toll-free verification req'd).
  // smsConsent must be true at form submission. smsConsentAt is the timestamp
  // they checked the box. smsConsentIp lets us prove the consent if Twilio asks.
  // smsConsentText is a snapshot of the exact opt-in language they agreed to.
  smsConsent: tinyint("smsConsent").default(0).notNull(),
  smsConsentAt: timestamp("smsConsentAt"),
  smsConsentIp: varchar("smsConsentIp", { length: 64 }),
  smsConsentText: text("smsConsentText"),
  // 2026-06-11: outbound voice opt-out. Set when a caller on an OUTBOUND agent
  // call asks for a human ("stop calling me with a robot"). The outbound voice
  // scheduler skips these leads. Does NOT affect inbound calls, email, or SMS
  // (each channel has its own opt-out). A human should still call them, so they
  // are prioritized in the daily call queue.
  noOutboundCalls: tinyint("noOutboundCalls").default(0).notNull(),
  noOutboundCallsAt: timestamp("noOutboundCallsAt"),
  // 2026-06-15: manual follow-up scheduling. When staff pick a date, the lead is
  // snoozed out of the daily call queue until that date, then resurfaces. Null
  // means no scheduled follow-up, so the lead follows the normal urgency ranking
  // and keeps appearing in the 8am reminders until someone acts on it.
  nextFollowUpAt: varchar("nextFollowUpAt", { length: 20 }),  // YYYY-MM-DD
  followUpNote: text("followUpNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

export const leadActivities = mysqlTable("leadActivities", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull().references(() => leads.id),
  type: mysqlEnum("type", ["email", "sms", "call", "note"]).notNull(),
  // 2026-06-06: outbound (we sent it) vs inbound (lead replied). Defaults to
  // outbound so existing rows stay correct. Inbound entries come from the Gmail
  // polling worker (replies) and from any incoming SMS/voice we wire up later.
  direction: mysqlEnum("direction", ["outbound", "inbound"]).default("outbound").notNull(),
  subject: varchar("subject", { length: 255 }),
  body: text("body"),
  // Who sent it: n8n_intake | n8n_noshow | n8n_fbsync | staff | gmail_reply_poller
  sentBy: varchar("sentBy", { length: 100 }),
  // sent | failed | opened | replied | voicemail | answered | not_interested
  status: varchar("status", { length: 50 }).default("sent"),
  // 2026-06-06: external provider message id (Gmail messageId, Resend id, Twilio sid).
  // Used by the Gmail poller to dedup so we don't double-insert the same reply.
  externalId: varchar("externalId", { length: 255 }),
  // 2026-06-09: audit-grade snapshot of the rendered HTML sent to this lead.
  // Stored at send time so the admin timeline shows exactly what was delivered,
  // not a re-render against current template state (compliance / dispute resolution).
  renderedHtml: mediumtext("renderedHtml"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  externalIdIdx: uniqueIndex("activity_external_id_uniq").on(table.externalId),
  leadIdIdx: index("activity_lead_idx").on(table.leadId, table.createdAt),
}));

export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = typeof leadActivities.$inferInsert;

export const students = mysqlTable("students", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  programs: text("programs"),
  enrollmentDate: varchar("enrollmentDate", { length: 50 }),
  // Student date of birth, stored as YYYY-MM-DD. Sourced from ZenPlanner
  // ("Birth Date") for the birthday automation. Nullable: not every student
  // has a DOB on file.
  dob: varchar("dob", { length: 20 }),
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
  // 2026-06-08: CTIA-compliant SMS consent (Twilio toll-free verification req'd).
  smsConsent: tinyint("smsConsent").default(0).notNull(),
  smsConsentAt: timestamp("smsConsentAt"),
  smsConsentIp: varchar("smsConsentIp", { length: 64 }),
  smsConsentText: text("smsConsentText"),
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

// ─── Daily Call Queue (2026-06-06) ────────────────────────────────────────────
// One row per (lead, queueDate) pair. The 8am cron picks the top N leads per
// day and writes them here. The /admin Today's Calls tab reads from here.
//
// `vertical` is denormalized from leads.programInterest at queue time so the
// tile renders without needing a join, and so retroactive program changes
// don't rewrite history.
//
// `status` tracks the call outcome. `outcomeNotes` is free-text from the
// caller. `calledAt` + `calledBy` record who actually dialed and when.
export const dailyCallQueue = mysqlTable("dailyCallQueue", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull().references(() => leads.id),
  // YYYY-MM-DD string so dedup uses a stable key independent of TZ
  queueDate: varchar("queueDate", { length: 10 }).notNull(),
  // Higher score = call sooner
  score: int("score").notNull(),
  // Human-readable: 'opened day_3 yesterday' / 'no_show + replied' / 'returning parent'
  reason: text("reason"),
  // Denormalized snapshot of which program at queue time
  vertical: varchar("vertical", { length: 100 }),
  status: mysqlEnum("status", [
    "pending",        // not yet attempted
    "answered",       // talked to the parent
    "voicemail",      // left vm
    "no_answer",      // rang out
    "booked",         // trial booked / enrolled during the call
    "not_interested", // hard no
    "callback_later", // soft no, try again
    "skipped",        // staff explicitly skipped
  ]).default("pending").notNull(),
  outcomeNotes: text("outcomeNotes"),
  calledAt: timestamp("calledAt"),
  calledBy: varchar("calledBy", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // One row per lead per day. If the cron picks the same lead twice in one
  // day (it shouldn't), the unique constraint stops the duplicate.
  leadDateUniq: uniqueIndex("call_queue_lead_date_uniq").on(table.leadId, table.queueDate),
  dateStatusIdx: index("call_queue_date_status_idx").on(table.queueDate, table.status),
}));

export type DailyCallQueueRow = typeof dailyCallQueue.$inferSelect;
export type InsertDailyCallQueueRow = typeof dailyCallQueue.$inferInsert;


// ─── Automation Controls / Kill Switch (2026-06-11) ───────────────────────────
// One row per pausable automation. n8n workflows and the website check
// `enabled` before running. The /admin/controls page (password-gated) toggles
// these. Belt-and-suspenders after the 2026-05-20 spam incident: one place to
// pause everything fast.
export const automationControls = mysqlTable("automationControls", {
  controlKey: varchar("controlKey", { length: 64 }).primaryKey(),
  label: varchar("label", { length: 255 }).notNull(),
  enabled: tinyint("enabled").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: varchar("updatedBy", { length: 255 }),
});

export type AutomationControl = typeof automationControls.$inferSelect;
export type InsertAutomationControl = typeof automationControls.$inferInsert;


// ─── Call Logs (2026-06-11) ───────────────────────────────────────────────────
// One row per Retell voice call (inbound + outbound), written by the Retell
// call_analyzed webhook. Powers the dashboard call log (summary + transcript)
// and the "every call" Telegram ping. Call-centric, not per-lead, because spam
// and brand-new callers have no lead; leadId is an optional best-effort match
// (no FK so a call without a lead still logs).
export const callLogs = mysqlTable("callLogs", {
  id: int("id").autoincrement().primaryKey(),
  callId: varchar("callId", { length: 128 }).notNull(),       // Retell call_id (unique)
  agentId: varchar("agentId", { length: 128 }),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).default("inbound").notNull(),
  fromNumber: varchar("fromNumber", { length: 32 }),
  toNumber: varchar("toNumber", { length: 32 }),
  callerName: varchar("callerName", { length: 255 }),
  leadId: int("leadId"),
  summary: text("summary"),
  transcript: mediumtext("transcript"),
  recordingUrl: varchar("recordingUrl", { length: 512 }),
  durationSec: int("durationSec"),
  disconnectReason: varchar("disconnectReason", { length: 64 }),
  sentiment: varchar("sentiment", { length: 32 }),
  intent: varchar("intent", { length: 64 }),
  booked: tinyint("booked").default(0),
  startedAt: timestamp("startedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  callIdUniq: uniqueIndex("call_logs_call_id_uniq").on(table.callId),
  createdIdx: index("call_logs_created_idx").on(table.createdAt),
}));

export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLog = typeof callLogs.$inferInsert;

// Personal admin to-do list (the dashboard "My Tasks" tab). Not tied to a lead.
export const adminTasks = mysqlTable("adminTasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  notes: text("notes"),
  done: tinyint("done").default(0).notNull(),
  dueDate: varchar("dueDate", { length: 20 }),  // YYYY-MM-DD, optional
  createdBy: varchar("createdBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  doneIdx: index("admin_tasks_done_idx").on(table.done, table.createdAt),
}));

export type AdminTask = typeof adminTasks.$inferSelect;
export type InsertAdminTask = typeof adminTasks.$inferInsert;

// ─── Waivers / in-person sign-up (2026-06-15) ─────────────────────────────────
// The digital version of the JotForm guest waiver. A walk-in (or anyone with the
// QR / iPad link) fills this out, which (a) creates or matches a lead so they land
// in the same pipeline as web leads, and (b) stores the signed waiver on file here.
// One row per submission. students/interests are JSON arrays. signatureData is the
// drawn signature as a PNG data URL. disclaimerText snapshots the exact waiver
// wording they agreed to, so the signed record stands on its own as a legal record.
export const waivers = mysqlTable("waivers", {
  id: int("id").autoincrement().primaryKey(),
  // Nullable so a waiver is never lost even if the lead match/create hiccups.
  leadId: int("leadId"),
  parentName: varchar("parentName", { length: 255 }).notNull(),
  address: text("address"),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  // JSON: [{ "name": "...", "dob": "YYYY-MM-DD" }, ...] up to 3
  students: text("students").notNull(),
  // JSON: ["self_defense","confidence",...]
  interests: text("interests"),
  // Drawn signature, stored as a PNG data URL (mediumtext → up to 16MB).
  signatureData: mediumtext("signatureData"),
  // Printed/typed name on the signature line.
  signedName: varchar("signedName", { length: 255 }),
  signedDate: varchar("signedDate", { length: 20 }).notNull(),  // YYYY-MM-DD
  // Snapshot of the exact disclaimer wording they agreed to.
  disclaimerText: text("disclaimerText"),
  // walk_in | online | ipad — where the signature was captured.
  source: varchar("source", { length: 64 }).default("walk_in").notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  leadIdx: index("waivers_lead_idx").on(table.leadId),
  createdIdx: index("waivers_created_idx").on(table.createdAt),
}));

export type Waiver = typeof waivers.$inferSelect;
export type InsertWaiver = typeof waivers.$inferInsert;

// ─── Trial enrollments / $99 3-week trial (2026-06-15) ───────────────────────
// The "Add Trial Student" flow in the Students tab. One row per paid trial. The
// $99 is charged through Stripe (same Payment Intent path as camp). startDate is
// the enrollment date; endDate is start + 21 days and drives the end-of-trial
// reminders. status walks pending -> active (paid) -> converted | expired | canceled.
// Built generic (productKey/amountCents) so other programs can use the same table.
export const trialEnrollments = mysqlTable("trialEnrollments", {
  id: int("id").autoincrement().primaryKey(),
  // Optional link to the CRM lead (set to trial_paid stage on payment).
  leadId: int("leadId"),
  studentName: varchar("studentName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  programInterest: varchar("programInterest", { length: 100 }),
  emergencyContact: varchar("emergencyContact", { length: 255 }),
  productKey: varchar("productKey", { length: 50 }).default("3_week_99").notNull(),
  amountCents: int("amountCents").default(9900).notNull(),
  startDate: varchar("startDate", { length: 20 }),    // YYYY-MM-DD
  endDate: varchar("endDate", { length: 20 }),        // YYYY-MM-DD (start + 21)
  status: mysqlEnum("status", ["pending", "active", "converted", "expired", "canceled"]).default("pending").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripePaymentStatus: varchar("stripePaymentStatus", { length: 50 }),
  paidAt: timestamp("paidAt"),
  // Link to a signed waiver on file, if any.
  waiverId: int("waiverId"),
  // Legacy single-reminder flag (kept for back-compat; superseded by remindersSent).
  reminderSentAt: timestamp("reminderSentAt"),
  // Comma-list of end-of-trial reminder milestones already sent, e.g. "7,3,2".
  // The 8am cron fires a ping at 7, 3, 2, and 1 days before endDate, once each.
  remindersSent: varchar("remindersSent", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusIdx: index("trial_status_idx").on(table.status, table.endDate),
  piIdx: index("trial_pi_idx").on(table.stripePaymentIntentId),
}));

export type TrialEnrollment = typeof trialEnrollments.$inferSelect;
export type InsertTrialEnrollment = typeof trialEnrollments.$inferInsert;

// ─── Camp Waivers (2026-07-21) ────────────────────────────────────────────────
// Stores the signed summer camp waiver submitted after payment in the camp
// registration flow. One row per submission. Linked to campRegistrations via registrationId.
export const campWaivers = mysqlTable("campWaivers", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId"),
  camperNames: text("camperNames").notNull(),
  camperDobs: text("camperDobs"),
  campWeeks: text("campWeeks"),
  parentName: varchar("parentName", { length: 255 }).notNull(),
  homeAddress: text("homeAddress"),
  cellPhone: varchar("cellPhone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  emergencyContactName: varchar("emergencyContactName", { length: 255 }).notNull(),
  emergencyContactRelationship: varchar("emergencyContactRelationship", { length: 100 }),
  emergencyPhone: varchar("emergencyPhone", { length: 20 }).notNull(),
  authorizedPickup1: varchar("authorizedPickup1", { length: 255 }),
  authorizedPickup2: varchar("authorizedPickup2", { length: 255 }),
  allergies: text("allergies"),
  medications: text("medications"),
  medicalConditions: text("medicalConditions"),
  initialsMaritalArts: varchar("initialsMaritalArts", { length: 20 }).notNull(),
  initialsFieldTrips: varchar("initialsFieldTrips", { length: 20 }).notNull(),
  noPhotoConsent: boolean("noPhotoConsent").default(false).notNull(),
  signedName: varchar("signedName", { length: 255 }).notNull(),
  agreedToTerms: boolean("agreedToTerms").default(false).notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
}, (table) => ({
  regIdx: index("camp_waivers_reg_idx").on(table.registrationId),
  submittedIdx: index("camp_waivers_submitted_idx").on(table.submittedAt),
}));
export type CampWaiver = typeof campWaivers.$inferSelect;
export type InsertCampWaiver = typeof campWaivers.$inferInsert;
