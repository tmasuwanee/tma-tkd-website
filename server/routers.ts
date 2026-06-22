import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createLead, getLeadById, getAllLeads, updateLeadStage, updateLeadProgram, updateLeadNotes, updateLeadTags, deleteLead,
  upsertLeadFromFacebook, createLeadActivity, getLeadActivities,
  createCampRegistration, updateCampRegistrationPayment,
  getCampRegistrationByPaymentIntentId, getAllCampRegistrations,
  softDeleteRegistration, restoreRegistration,
  upsertStudents, getAllStudents, searchStudents, updateStudent, createStudent,
  // Lead Conductor (2026-05-19)
  pauseLeadAutomation, resumeLeadAutomation,
  scheduleSequenceTouch, listSequenceByLead, getSequenceTouchById,
  skipSequenceTouch, cancelSequenceTouch, cancelSequenceByLeadAndKey,
  overrideSequenceTouch, triggerSequenceNow,
  getDueSequenceTouches, markTouchProcessing, markTouchSent, markTouchSkipped, markTouchFailed,
  hasTouchBeenSent,
  // Lifecycle Architecture v1 (2026-05-20)
  listSequenceTemplates, getTemplate, getTemplateById, createTemplate, updateTemplate, getTemplateHistory,
  listTriggerRules, createTriggerRule, updateTriggerRule, deleteTriggerRule, routeLeadToSequence,
  recordLifecycleTransition, getLifecycleHistory, isLegalTransition,
  logAudit, listAuditLog, preSendGuard,
  // Phase 4 (2026-05-21): template rendering + sequence fan-out + dispatcher loop
  renderTemplate, enqueueSequenceForLead, fetchAndRenderForDispatch, confirmTouchDispatched,
  sendTemplateTestEmail,
  // Studio (2026-06-02)
  createStudioAsset, listStudioAssets, getStudioAssetById, updateStudioAsset, deleteStudioAsset,
  // Studio multi-tag (2026-06-04)
  setStudioAssetTags,
  // Call queue + inbound replies (2026-06-06)
  generateDailyCallQueue, listTodaysCalls, markCallOutcome, recordInboundEmailReply, getCallBoard,
  // Call log from the Retell webhook (2026-06-11)
  listCallLogs, getCallLog,
  // Automation controls / kill switch (2026-06-11)
  getAutomationControls, setAutomationControl, setAllAutomations,
  // Trial check-in (2026-06-11)
  getLeadsByStagesAndTrialDate,
  setLeadFollowUp,
  listAdminTasks, addAdminTask, updateAdminTask, deleteAdminTask,
  // Waivers / in-person sign-up (2026-06-15)
  submitWaiver, getAllWaivers, getWaiversByLead, deleteWaiver,
  // Manual calendar booking (2026-06-15)
  manualBookTrial,
  // $99 3-week trial enrollments (2026-06-15)
  createTrialEnrollment, getTrialByPaymentIntent, activateTrial, listTrialEnrollments, updateTrialStatus,
} from "./db";
import { sendTelegramMessage } from "./telegram";
import { storagePut, storageGet } from "./storage";
import { sendToGoogleSheets, sendToSlack, sendEmailNotification, sendCampRegistrationConfirmation, sendCampWaiverEmail, sendTrialReceipt } from "./integrations";
import { fireLeadEvent, firePurchaseEvent } from "./meta-capi";
import { getAdInsights, syncAdInsights } from "./facebook-ads";
import Stripe from "stripe";
import { ENV } from "./_core/env";

function getStripe() {
  return new Stripe(ENV.tmaStripeSecretKey);
}

// Build an admin dashboard link with the one-tap login key appended (when set), so
// Telegram links open the dashboard without a password. Mirrors the 8am cron's DASH_KEY.
function adminLink(path: string): string {
  const key = process.env.ADMIN_MAGIC_KEY;
  return `https://tmatkd.com${path}${key ? `?key=${key}` : ""}`;
}

// ─── n8n Webhook ─────────────────────────────────────────────────────────────
// Fires async (non-blocking) so a slow/offline n8n never delays lead submission.
// Set N8N_WEBHOOK_URL in Secrets to activate. Payload matches what n8n needs
// for Facebook Ads attribution and pipeline routing.
async function fireN8nWebhook(payload: {
  leadId: number;
  name: string;
  email: string;
  phone: string;
  programInterest: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  trialClassDate: string | null;
  trialClassTime: string | null;
  trialClassDay: string | null;
  timestamp: string;
}) {
  const url = ENV.n8nWebhookUrl;
  if (!url) return; // no-op until URL is configured
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000), // 8s timeout
    });
    if (!res.ok) {
      console.warn(`[n8n] Webhook responded with ${res.status}`);
    }
  } catch (err) {
    // Never throw -n8n being down must not affect lead submission
    console.warn("[n8n] Webhook fire failed (non-fatal):", err);
  }
}

// Pipeline stage labels for display
export const PIPELINE_STAGES = [
  { value: "new_lead",        label: "New Lead" },
  { value: "contacted",       label: "Contacted" },
  { value: "trial_scheduled", label: "Trial Scheduled" },
  { value: "trial_paid",      label: "Trial Paid ($30)" },
  { value: "trial_attended",  label: "Trial Attended" },
  { value: "enrolled",        label: "Enrolled" },
  { value: "lost",            label: "Lost" },
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number]["value"];

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Camp Registration ───────────────────────────────────────────────────
  camp: router({
    createRegistration: publicProcedure
      .input(z.object({
        camper1Name: z.string().min(1),
        camper1Dob: z.string().min(1),
        camper1Age: z.string().min(1),
        camper1Sex: z.string().min(1),
        camper2Name: z.string().optional(),
        camper2Dob: z.string().optional(),
        camper2Age: z.string().optional(),
        camper2Sex: z.string().optional(),
        camper3Name: z.string().optional(),
        camper3Dob: z.string().optional(),
        camper3Age: z.string().optional(),
        camper3Sex: z.string().optional(),
        parentFirstName: z.string().min(1),
        parentLastName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().min(1),
        address: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(1),
        zip: z.string().min(1),
        howDidYouHear: z.string().optional(),
        programType: z.enum(["3day", "5day", "daily"]),
        numCampers: z.number().min(1).max(3),
        addFieldTrip: z.boolean(),
        addExtendedCare: z.boolean(),
        selectedWeeks: z.array(z.string()).optional().default([]),
        futureWeeks: z.array(z.string()).optional().default([]),
        amountCents: z.number().min(1),
        couponCode: z.string().optional(),
        agreedToTerms: z.boolean(),
        // 2026-06-08: Twilio CTIA-compliant SMS consent. Required true to submit.
        smsConsent: z.literal(true),
        smsConsentText: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const ip = (ctx?.req as any)?.ip
          || (ctx?.req as any)?.headers?.["cf-connecting-ip"]
          || (ctx?.req as any)?.headers?.["x-forwarded-for"]
          || null;
        // Server-side pricing constants (must match client)
        const VALID_COUPONS: Record<string, "earlybird"> = {
          EARLYBIRD2026: "earlybird",
          TMAEARLYBIRD: "earlybird",
        };
        const EARLY_BIRD_DEADLINE = new Date("2026-04-30T23:59:59");
        const isEarlyBird = new Date() <= EARLY_BIRD_DEADLINE;
        const couponType = input.couponCode ? VALID_COUPONS[input.couponCode.toUpperCase()] : undefined;
        const useDiscount = isEarlyBird || couponType === "earlybird";
        const PROGRAM_PRICES = {
          regular: { "3day": 199_00, "5day": 239_00, "daily": 70_00 },
          earlyBird: { "3day": 179_00, "5day": 209_00, "daily": 70_00 },
        };
        const FIELD_TRIP = 25_00;
        const EXTENDED_CARE = 25_00;
        const programPrice = useDiscount ? PROGRAM_PRICES.earlyBird[input.programType] : PROGRAM_PRICES.regular[input.programType];
        const numWeeks = input.programType === "daily" ? 1 : Math.max(input.selectedWeeks.length, 1);
        let serverAmount = programPrice * input.numCampers * numWeeks;
        if (input.addFieldTrip) serverAmount += FIELD_TRIP * input.numCampers * numWeeks;
        if (input.addExtendedCare) serverAmount += EXTENDED_CARE * numWeeks;
        // Use server-calculated amount -ignore client-provided amountCents entirely
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.create({
          amount: serverAmount,
          currency: "usd",
          metadata: {
            camper1Name: input.camper1Name,
            parentEmail: input.email,
            programType: input.programType,
            selectedWeeks: input.selectedWeeks.slice(0, 3).join(", "),
          },
        });

        await createCampRegistration({
          camper1Name: input.camper1Name,
          camper1Dob: input.camper1Dob,
          camper1Age: input.camper1Age,
          camper1Sex: input.camper1Sex,
          camper2Name: input.camper2Name,
          camper2Dob: input.camper2Dob,
          camper2Age: input.camper2Age,
          camper2Sex: input.camper2Sex,
          camper3Name: input.camper3Name,
          camper3Dob: input.camper3Dob,
          camper3Age: input.camper3Age,
          camper3Sex: input.camper3Sex,
          parentFirstName: input.parentFirstName,
          parentLastName: input.parentLastName,
          email: input.email,
          phone: input.phone,
          address: input.address,
          city: input.city,
          state: input.state,
          zip: input.zip,
          howDidYouHear: input.howDidYouHear,
          programType: input.programType,
          numCampers: input.numCampers,
          addFieldTrip: input.addFieldTrip ? 1 : 0,
          addExtendedCare: input.addExtendedCare ? 1 : 0,
          anticipatedWeeks: JSON.stringify(input.selectedWeeks),
          futureWeeks: JSON.stringify(input.futureWeeks),
          firstWeek: input.selectedWeeks[0] || "",
          stripePaymentIntentId: paymentIntent.id,
          stripePaymentStatus: "pending",
          amountPaid: input.amountCents,
          agreedToTerms: input.agreedToTerms ? 1 : 0,
          smsConsent: 1,
          smsConsentAt: new Date(),
          smsConsentIp: ip ? String(ip).slice(0, 64) : null,
          smsConsentText: input.smsConsentText,
        });

        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        };
      }),

    confirmPayment: publicProcedure
      .input(z.object({ paymentIntentId: z.string() }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);
        await updateCampRegistrationPayment(input.paymentIntentId, paymentIntent.status);

        if (paymentIntent.status === 'succeeded') {
          try {
            const registration = await getCampRegistrationByPaymentIntentId(input.paymentIntentId);
            if (registration) {
              await sendCampRegistrationConfirmation({
                parentFirstName: registration.parentFirstName,
                parentLastName: registration.parentLastName,
                parentEmail: registration.email,
                camper1Name: registration.camper1Name,
                programType: registration.programType,
                selectedWeeks: registration.anticipatedWeeks ? JSON.parse(registration.anticipatedWeeks) : [],
                amountPaid: registration.amountPaid ?? 0,
                addExtendedCare: registration.addExtendedCare === 1,
              });
              // Separate, dedicated waiver email so the required action stands out.
              await sendCampWaiverEmail({
                parentFirstName: registration.parentFirstName,
                parentEmail: registration.email,
                camper1Name: registration.camper1Name,
              });
            }
          } catch (emailErr) {
            console.error('[confirmPayment] Failed to send confirmation/waiver email:', emailErr);
          }
        }

        return { status: paymentIntent.status };
      }),
  }),

  // ─── Admin (Camp Registrations) ──────────────────────────────────────────
  admin: router({
    getCampRegistrations: publicProcedure
      .query(async () => {
        const registrations = await getAllCampRegistrations();
        return registrations.map(r => ({
          isDeleted: r.isDeleted === 1,
          deletedAt: r.deletedAt,
          id: r.id,
          camper1Name: r.camper1Name,
          camper2Name: r.camper2Name ?? null,
          camper3Name: r.camper3Name ?? null,
          numCampers: r.numCampers,
          parentFirstName: r.parentFirstName,
          parentLastName: r.parentLastName,
          email: r.email,
          phone: r.phone,
          programType: r.programType,
          selectedWeeks: r.anticipatedWeeks ? JSON.parse(r.anticipatedWeeks) as string[] : [],
          futureWeeks: r.futureWeeks ? JSON.parse(r.futureWeeks) as string[] : [],
          addFieldTrip: r.addFieldTrip === 1,
          addExtendedCare: r.addExtendedCare === 1,
          amountPaid: r.amountPaid,
          stripePaymentStatus: r.stripePaymentStatus,
          stripePaymentIntentId: r.stripePaymentIntentId,
          createdAt: r.createdAt,
        }));
      }),

    softDeleteRegistration: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await softDeleteRegistration(input.id);
        return { success: true };
      }),

    restoreRegistration: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await restoreRegistration(input.id);
        return { success: true };
      }),
  }),

  // ─── Leads / CRM Pipeline ────────────────────────────────────────────────
  leads: router({
    // Public: submit a new free-class inquiry
    submit: publicProcedure
      .input(z.object({
        parentName: z.string().min(1),
        kidName: z.string().min(1),
        kidAge: z.string().min(1),
        programInterest: z.string().min(1),
        motivation: z.string().optional(),
        email: z.string().email(),
        phone: z.string().min(1),
        additionalNotes: z.string().optional(),
        // UTM tracking
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmCampaign: z.string().optional(),
        utmContent: z.string().optional(),
        // Trial class scheduling
        trialClassDate: z.string().optional(),   // YYYY-MM-DD
        trialClassTime: z.string().optional(),   // e.g. "5:50 PM"
        trialClassDay: z.string().optional(),    // e.g. "Monday"
        // Tags
        tags: z.array(z.string()).optional(),
        // 2026-06-08: Twilio CTIA-compliant SMS consent. Required true to submit.
        smsConsent: z.literal(true),
        smsConsentText: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // Snapshot the IP for consent audit trail (Twilio may request)
        const ip = (ctx?.req as any)?.ip
          || (ctx?.req as any)?.headers?.["cf-connecting-ip"]
          || (ctx?.req as any)?.headers?.["x-forwarded-for"]
          || null;
        try {
          // Phase 1b (Lead Conductor): auto-progress stage to trial_scheduled when a booking is present.
          // Otherwise leave default 'new_lead'.
          const initialStage = input.trialClassDate ? 'trial_scheduled' as const : undefined;

          const newLeadId = await createLead({
            parentName: input.parentName,
            kidName: input.kidName,
            kidAge: input.kidAge,
            programInterest: input.programInterest,
            motivation: input.motivation,
            email: input.email,
            phone: input.phone,
            additionalNotes: input.additionalNotes,
            ...(initialStage ? { pipelineStage: initialStage } : {}),
            utmSource: input.utmSource,
            utmMedium: input.utmMedium,
            utmCampaign: input.utmCampaign,
            utmContent: input.utmContent,
            trialClassDate: input.trialClassDate,
            trialClassTime: input.trialClassTime,
            trialClassDay: input.trialClassDay,
            tags: input.tags ? JSON.stringify(input.tags) : null,
            smsConsent: 1,
            smsConsentAt: new Date(),
            smsConsentIp: ip ? String(ip).slice(0, 64) : null,
            smsConsentText: input.smsConsentText,
          });

          const leadForIntegrations = {
            id: 0,
            parentName: input.parentName,
            kidName: input.kidName,
            kidAge: input.kidAge,
            programInterest: input.programInterest,
            motivation: input.motivation ?? null,
            email: input.email,
            phone: input.phone,
            additionalNotes: input.additionalNotes ?? null,
            pipelineStage: "new_lead" as const,
            trialPaidAmount: 0,
            internalNotes: null,
            utmSource: input.utmSource ?? null,
            utmMedium: input.utmMedium ?? null,
            utmCampaign: input.utmCampaign ?? null,
            utmContent: input.utmContent ?? null,
            trialClassDate: input.trialClassDate ?? null,
            trialClassTime: input.trialClassTime ?? null,
            trialClassDay: input.trialClassDay ?? null,
            nextFollowUpAt: null,
            followUpNote: null,
            tags: input.tags ? JSON.stringify(input.tags) : null,
            automationPaused: 0,
            automationPausedAt: null,
            automationPausedBy: null,
            automationPauseReason: null,
            smsConsent: 1,
            smsConsentAt: new Date(),
            smsConsentIp: ip ? String(ip).slice(0, 64) : null,
            smsConsentText: input.smsConsentText,
            noOutboundCalls: 0,
            noOutboundCallsAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Fire Meta CAPI Lead event async (non-blocking)
          void fireLeadEvent({
            leadId: newLeadId,
            name: input.parentName,
            email: input.email,
            phone: input.phone,
            programInterest: input.programInterest,
            utmSource: input.utmSource,
            utmMedium: input.utmMedium,
            utmCampaign: input.utmCampaign,
            utmContent: input.utmContent,
          });
          // Fire n8n webhook async (non-blocking) -does not delay lead submission
          void fireN8nWebhook({
            leadId: newLeadId,
            name: input.parentName,
            email: input.email,
            phone: input.phone,
            programInterest: input.programInterest,
            utmSource: input.utmSource ?? null,
            utmMedium: input.utmMedium ?? null,
            utmCampaign: input.utmCampaign ?? null,
            utmContent: input.utmContent ?? null,
            trialClassDate: input.trialClassDate ?? null,
            trialClassTime: input.trialClassTime ?? null,
            trialClassDay: input.trialClassDay ?? null,
            timestamp: new Date().toISOString(),
          });
          await Promise.all([
            sendToGoogleSheets(leadForIntegrations),
            sendToSlack(leadForIntegrations),
            sendEmailNotification(leadForIntegrations),
          ]);

          return {
            success: true,
            message: "Thank you for your interest! We will contact you soon to schedule your free class.",
          };
        } catch (error) {
          console.error("Lead submission error:", error);
          throw new Error("Failed to submit lead. Please try again.");
        }
      }),

    // Admin: get all leads (tags returned as parsed array)
    getAll: publicProcedure.query(async () => {
      const allLeads = await getAllLeads();
      return allLeads.map(lead => ({
        ...lead,
        tags: lead.tags ? JSON.parse(lead.tags) as string[] : [],
      }));
    }),

    // Admin: update pipeline stage
    updateStage: publicProcedure
      .input(z.object({
        id: z.number(),
        stage: z.enum(["new_lead", "contacted", "trial_scheduled", "trial_paid", "trial_attended", "enrolled", "lost"]),
        trialPaidAmount: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateLeadStage(input.id, input.stage, input.trialPaidAmount);
        // Fire Meta CAPI Purchase event when lead is marked as enrolled
        if (input.stage === 'enrolled') {
          const lead = await getLeadById(input.id);
          if (lead) {
            const TUITION: Record<string, number> = {
              taekwondo: 159, bjj: 159, kickboxing: 149,
              afterschool: 299, multiple: 199, summer_camp: 239,
            };
            const value = TUITION[lead.programInterest] ?? 159;
            void firePurchaseEvent({ leadId: lead.id, email: lead.email, phone: lead.phone, valueUsd: value });
          }
        }
        return { success: true };
      }),

    // Admin: update program interest
    updateProgram: publicProcedure
      .input(z.object({
        id: z.number(),
        programInterest: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        await updateLeadProgram(input.id, input.programInterest);
        return { success: true };
      }),

    // Admin: update internal notes
    updateNotes: publicProcedure
      .input(z.object({
        id: z.number(),
        internalNotes: z.string(),
      }))
      .mutation(async ({ input }) => {
        await updateLeadNotes(input.id, input.internalNotes);
        return { success: true };
      }),

    // Admin: update tags (replaces full array -client merges before calling)
    updateTags: publicProcedure
      .input(z.object({
        id: z.number(),
        tags: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        await updateLeadTags(input.id, input.tags);
        return { success: true };
      }),

    // Internal: upsert a lead from Facebook Lead Ads (called by n8n sync workflow).
    // Matches by email -safe to call repeatedly; never overwrites notes, stage, or existing tags.
    upsertFromFacebook: publicProcedure
      .input(z.object({
        parentName: z.string(),
        kidName: z.string().optional().default(""),
        kidAge: z.string().optional().default(""),
        programInterest: z.string().optional().default("summer_camp"),
        email: z.string().email(),
        phone: z.string().optional().default(""),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmCampaign: z.string().optional(),
        utmContent: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await upsertLeadFromFacebook(input);

        // Only fire n8n intake sequence for brand-new leads (not updates)
        if (result.isNew) {
          void fireN8nWebhook({
            leadId: result.id,
            name: input.parentName,
            email: input.email,
            phone: input.phone || "",
            programInterest: input.programInterest || "summer_camp",
            utmSource: input.utmSource ?? "facebook",
            utmMedium: input.utmMedium ?? "lead_ad",
            utmCampaign: input.utmCampaign ?? null,
            utmContent: input.utmContent ?? null,
            trialClassDate: null,
            trialClassTime: null,
            trialClassDay: null,
            timestamp: new Date().toISOString(),
          });
        }

        return result;
      }),

    // Log an activity against a lead (called by n8n after email/sms sends)
    logActivity: publicProcedure
      .input(z.object({
        leadId: z.number(),
        type: z.enum(["email", "sms", "call", "note"]),
        subject: z.string().optional(),
        body: z.string().optional(),
        sentBy: z.string().optional(),  // n8n_intake | n8n_noshow | n8n_fbsync | staff
        status: z.string().optional(),  // sent | failed | opened
      }))
      .mutation(async ({ input }) => {
        const activity = await createLeadActivity({
          leadId: input.leadId,
          type: input.type,
          subject: input.subject ?? null,
          body: input.body ?? null,
          sentBy: input.sentBy ?? null,
          status: input.status ?? "sent",
        });
        return activity;
      }),

    // Get activity log for a lead (emails sent, SMS, calls, notes)
    getActivity: publicProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        return getLeadActivities(input.leadId);
      }),

    // ── Lead Conductor: structured automation pause (2026-05-19) ───────────
    // Workflows check leads.automationPaused boolean directly. Staff toggles via UI.
    pauseAutomation: publicProcedure
      .input(z.object({
        leadId: z.number(),
        reason: z.string().min(1).max(255),
        pausedBy: z.string().min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        await pauseLeadAutomation(input.leadId, input.pausedBy, input.reason);
        await createLeadActivity({
          leadId: input.leadId,
          type: "note",
          subject: "Automation paused",
          body: `Paused by ${input.pausedBy}. Reason: ${input.reason}`,
          sentBy: `staff:${input.pausedBy}`,
          status: "sent",
        });
        return { success: true };
      }),

    resumeAutomation: publicProcedure
      .input(z.object({
        leadId: z.number(),
        resumedBy: z.string().min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        await resumeLeadAutomation(input.leadId, input.resumedBy);
        await createLeadActivity({
          leadId: input.leadId,
          type: "note",
          subject: "Automation resumed",
          body: `Resumed by ${input.resumedBy}`,
          sentBy: `staff:${input.resumedBy}`,
          status: "sent",
        });
        return { success: true };
      }),

    // Admin: delete a lead
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteLead(input.id);
        return { success: true };
      }),

    setFollowUp: publicProcedure
      .input(z.object({
        id: z.number(),
        nextFollowUpAt: z.string().nullable(),   // "YYYY-MM-DD", or null to clear
        note: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await setLeadFollowUp(input.id, input.nextFollowUpAt, input.note ?? null);
        return { success: true };
      }),

    // Admin: manually book a trial (walk-in / phone) from the calendar.
    bookManual: publicProcedure
      .input(z.object({
        leadId: z.number().int().positive().nullable().optional(),
        parentName: z.string().min(1).max(255),
        kidName: z.string().min(1).max(255),
        kidAge: z.string().max(50).nullable().optional(),
        phone: z.string().min(7).max(20),
        email: z.string().email().nullable().optional(),
        programInterest: z.string().min(1).max(255),
        trialClassDate: z.string().min(1).max(20),    // YYYY-MM-DD
        trialClassTime: z.string().max(20).nullable().optional(),
        trialClassDay: z.string().max(20).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }))
      .mutation(async ({ input }) => manualBookTrial(input)),
  }),

  // ─── Lead Conductor: Sequence Queue (2026-05-19) ────────────────────────
  // Planned future touches per lead. The n8n Sequence Dispatcher polls
  // getDue() every 5 minutes and processes them. Staff can edit, skip,
  // cancel, or send-now any scheduled row from the Lead Conductor UI panel.
  sequence: router({
    listByLead: publicProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        return listSequenceByLead(input.leadId);
      }),

    scheduleTouch: publicProcedure
      .input(z.object({
        leadId: z.number(),
        channel: z.enum(["email", "sms", "call_reminder", "internal_task"]),
        sequenceKey: z.string().optional(),
        touchKey: z.string().min(1).max(100),
        scheduledFor: z.string(),  // ISO datetime
        touchSubject: z.string().optional(),
        touchBodyTemplate: z.string().optional(),
        createdBy: z.string().min(1).max(100).default("system"),
      }))
      .mutation(async ({ input }) => {
        const id = await scheduleSequenceTouch({
          leadId: input.leadId,
          channel: input.channel,
          sequenceKey: input.sequenceKey ?? null,
          touchKey: input.touchKey,
          scheduledFor: new Date(input.scheduledFor),
          touchSubject: input.touchSubject ?? null,
          touchBodyTemplate: input.touchBodyTemplate ?? null,
          createdBy: input.createdBy,
        });
        return { id };
      }),

    skipTouch: publicProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().min(1).max(255),
        updatedBy: z.string().min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        await skipSequenceTouch(input.id, input.reason, input.updatedBy);
        return { success: true };
      }),

    cancelTouch: publicProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().min(1).max(255),
        updatedBy: z.string().min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        await cancelSequenceTouch(input.id, input.reason, input.updatedBy);
        return { success: true };
      }),

    cancelBySequence: publicProcedure
      .input(z.object({
        leadId: z.number(),
        sequenceKey: z.string().min(1).max(100),
        reason: z.string().min(1).max(255),
        updatedBy: z.string().min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        await cancelSequenceByLeadAndKey(input.leadId, input.sequenceKey, input.reason, input.updatedBy);
        return { success: true };
      }),

    overrideTouch: publicProcedure
      .input(z.object({
        id: z.number(),
        touchSubject: z.string().optional(),
        touchBodyOverride: z.string().optional(),
        updatedBy: z.string().min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        await overrideSequenceTouch(
          input.id,
          { touchSubject: input.touchSubject, touchBodyOverride: input.touchBodyOverride },
          input.updatedBy,
        );
        return { success: true };
      }),

    triggerNow: publicProcedure
      .input(z.object({
        id: z.number(),
        updatedBy: z.string().min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        await triggerSequenceNow(input.id, input.updatedBy);
        return { success: true };
      }),

    // ── Dispatcher-facing endpoints (called by n8n) ──
    // List rows that are due. Caller MUST then call markProcessing to claim each.
    due: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
      .query(async ({ input }) => {
        return getDueSequenceTouches(input?.limit ?? 50);
      }),

    markProcessing: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // Deployment sentinel: if you see _version='v3-sentinel-2026-05-19' in the response,
        // the v3 code IS deployed. If you don't see it, deploys aren't taking effect.
        const beforeStatus = await getSequenceTouchById(input.id);
        const ok = await markTouchProcessing(input.id);
        const afterStatus = await getSequenceTouchById(input.id);
        return {
          claimed: ok,
          _version: 'v3-sentinel-2026-05-19',
          _debug: {
            beforeStatus: beforeStatus?.status ?? 'NOT_FOUND',
            afterStatus: afterStatus?.status ?? 'NOT_FOUND',
          },
        };
      }),

    markSent: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await markTouchSent(input.id);
        return { success: true };
      }),

    markSkipped: publicProcedure
      .input(z.object({ id: z.number(), reason: z.string().max(255) }))
      .mutation(async ({ input }) => {
        await markTouchSkipped(input.id, input.reason);
        return { success: true };
      }),

    markFailed: publicProcedure
      .input(z.object({ id: z.number(), reason: z.string().max(1000) }))
      .mutation(async ({ input }) => {
        await markTouchFailed(input.id, input.reason);
        return { success: true };
      }),

    hasBeenSent: publicProcedure
      .input(z.object({ leadId: z.number(), touchKey: z.string().min(1).max(100) }))
      .query(async ({ input }) => {
        const sent = await hasTouchBeenSent(input.leadId, input.touchKey);
        return { sent };
      }),

    /**
     * Phase 4: fan-out enqueue. Lead Intake v3 calls this with a sequenceKey
     * (resolved by rules.route). Server-side schedules every active touch
     * in that sequence with proper delays. Idempotent.
     */
    enqueueSequence: publicProcedure
      .input(z.object({
        leadId: z.number().int().positive(),
        sequenceKey: z.string().min(1).max(100),
        startAt: z.string().datetime().optional(),
        createdBy: z.string().max(100).default("lead_intake_v3"),
        // When true, delayHours → delaySeconds (48h → 48s) for fast E2E tests.
        testMode: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        return enqueueSequenceForLead({
          leadId: input.leadId,
          sequenceKey: input.sequenceKey,
          startAt: input.startAt ? new Date(input.startAt) : undefined,
          createdBy: input.createdBy,
          testMode: input.testMode,
        });
      }),
  }),

  // ─── Students (ZenPlanner CSV import) ────────────────────────────────────
  students: router({
    // Admin: replace all students from CSV data
    import: publicProcedure
      .input(z.object({
        rows: z.array(z.object({
          name: z.string(),
          email: z.string().optional(),
          phone: z.string().optional(),
          programs: z.string().optional(),
          enrollmentDate: z.string().optional(),
          beltRank: z.string().optional(),
          status: z.string().optional(),
          emergencyContact: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const result = await upsertStudents(input.rows);
        return { success: true, count: input.rows.length, added: result.added, updated: result.updated };
      }),

    // Admin: get all students
    getAll: publicProcedure.query(async () => {
      return getAllStudents();
    }),

    // Admin: search students
    search: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        if (!input.query.trim()) return getAllStudents();
        return searchStudents(input.query);
      }),
    // Get eligible students (15+ attendance since last promotion)
    getEligible: publicProcedure.query(async () => {
      const { getEligibleStudents } = await import('./db');
      return getEligibleStudents();
    }),
    // Promote a student's belt rank
    promoteBelt: publicProcedure
      .input(z.object({ studentId: z.number() }))
      .mutation(async ({ input }) => {
        const { promoteBeltRank } = await import('./db');
        return promoteBeltRank(input.studentId);
      }),
    // Demote a student's belt rank
    demoteBelt: publicProcedure
      .input(z.object({ studentId: z.number() }))
      .mutation(async ({ input }) => {
        const { demoteBeltRank } = await import('./db');
        return demoteBeltRank(input.studentId);
      }),
    // Update an existing student
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        programs: z.string().nullable().optional(),
        enrollmentDate: z.string().nullable().optional(),
        beltRank: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        emergencyContact: z.string().nullable().optional(),
        isEligibleOverride: z.number().int().min(0).max(1).optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateStudent } = await import('./db');
        const { id, ...data } = input;
        return updateStudent(id, data);
      }),
    // Create a new student
    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        programs: z.string().nullable().optional(),
        enrollmentDate: z.string().nullable().optional(),
        beltRank: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        emergencyContact: z.string().nullable().optional(),
        isEligibleOverride: z.number().int().min(0).max(1).optional(),
      }))
      .mutation(async ({ input }) => {
        const { createStudent } = await import('./db');
        return createStudent(input);
      }),
   }),
  // ─── Attendance ──────────────────────────────────────────────────────────
  attendance: router({
    // Check in a student (kiosk)
    checkIn: publicProcedure
      .input(z.object({
        studentId: z.number(),
        classDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .mutation(async ({ input }) => {
        const { checkInStudent } = await import('./db');
        return checkInStudent(input.studentId, input.classDate);
      }),
    // Get attendance count since last promotion
    countSincePromotion: publicProcedure
      .input(z.object({ studentId: z.number() }))
      .query(async ({ input }) => {
        const { getAttendanceSincePromotion } = await import('./db');
        return getAttendanceSincePromotion(input.studentId);
      }),
    // Manually set attendance count (staff override)
    setCount: publicProcedure
      .input(z.object({ studentId: z.number(), count: z.number().int().min(0).max(999) }))
      .mutation(async ({ input }) => {
        const { setAttendanceCount } = await import('./db');
        await setAttendanceCount(input.studentId, input.count);
        return { success: true };
      }),
  }),
  // ─── Facebook Ad Insights ─────────────────────────────────────────────────
  ads: router({
    // Get stored ad insights for the last N days
    getInsights: publicProcedure
      .input(z.object({ days: z.number().min(1).max(90).default(7) }))
      .query(async ({ input }) => {
        return getAdInsights(input.days);
      }),
    // Manually trigger a sync from Facebook Marketing API
    sync: publicProcedure
      .input(z.object({ days: z.number().min(1).max(30).default(7) }))
      .mutation(async ({ input }) => {
        return syncAdInsights(input.days);
      }),
  }),

  // =====================================================================
  // LIFECYCLE ARCHITECTURE v1 -tRPC ROUTERS (2026-05-20)
  // See: TMA_LIFECYCLE_ARCHITECTURE.md
  // All admin-UI editing of email content, intake rules, and stage history
  // goes through these procedures. n8n workflows also call routeLeadToSequence
  // and recordLifecycleTransition via these endpoints.
  // =====================================================================

  templates: router({
    list: publicProcedure.query(async () => listSequenceTemplates()),

    getById: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => getTemplateById(input.id)),

    get: publicProcedure
      .input(z.object({ sequenceKey: z.string().min(1), touchKey: z.string().min(1) }))
      .query(async ({ input }) => getTemplate(input.sequenceKey, input.touchKey)),

    create: publicProcedure
      .input(z.object({
        sequenceKey: z.string().min(1).max(100),
        touchKey: z.string().min(1).max(100),
        orderIndex: z.number().int().min(0).default(0),
        delayHours: z.number().int().min(0).default(0),
        channel: z.enum(["email", "sms", "call_reminder", "internal_task"]).default("email"),
        subject: z.string().max(500).optional(),
        bodyHtml: z.string().optional(),
        bodyText: z.string().optional(),
        displayName: z.string().max(255).optional(),
        description: z.string().optional(),
        createdBy: z.string().default("admin_ui"),
      }))
      .mutation(async ({ input }) => createTemplate(input)),

    update: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        editedBy: z.string().min(1),
        changeNote: z.string().max(500).optional(),
        patch: z.object({
          subject: z.string().max(500).optional(),
          bodyHtml: z.string().optional(),
          bodyText: z.string().optional(),
          delayHours: z.number().int().min(0).optional(),
          isActive: z.number().int().min(0).max(1).optional(),
          displayName: z.string().max(255).optional(),
          description: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => updateTemplate(input.id, input.patch, input.editedBy, input.changeNote)),

    history: publicProcedure
      .input(z.object({ templateId: z.number().int().positive() }))
      .query(async ({ input }) => getTemplateHistory(input.templateId)),

    /**
     * Phase 5: send a preview of the rendered template to a real inbox.
     * Used by the admin "Send test" button. Renders the template against a
     * sample lead (or a real leadId if provided), then POSTs to Resend.
     */
    sendTest: publicProcedure
      .input(z.object({
        templateId: z.number().int().positive(),
        recipient: z.string().email().optional(),
        sampleLeadId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input }) => sendTemplateTestEmail(input)),
  }),

  rules: router({
    list: publicProcedure
      .input(z.object({ activeOnly: z.boolean().default(false) }).optional())
      .query(async ({ input }) => listTriggerRules(input?.activeOnly ?? false)),

    create: publicProcedure
      .input(z.object({
        priority: z.number().int().default(100),
        ruleName: z.string().min(1).max(255),
        matchField: z.enum(["tag", "utmSource", "utmCampaign", "programInterest", "hasTrialDate"]),
        matchOperator: z.enum(["equals", "contains", "starts_with", "is_true"]).default("equals"),
        matchValue: z.string().max(255).optional(),
        sequenceKey: z.string().min(1).max(100),
        description: z.string().optional(),
        createdBy: z.string().default("admin_ui"),
      }))
      .mutation(async ({ input }) => createTriggerRule(input)),

    update: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        patch: z.object({
          priority: z.number().int().optional(),
          ruleName: z.string().min(1).max(255).optional(),
          matchField: z.enum(["tag", "utmSource", "utmCampaign", "programInterest", "hasTrialDate"]).optional(),
          matchOperator: z.enum(["equals", "contains", "starts_with", "is_true"]).optional(),
          matchValue: z.string().max(255).optional(),
          sequenceKey: z.string().min(1).max(100).optional(),
          isActive: z.number().int().min(0).max(1).optional(),
          description: z.string().optional(),
          updatedBy: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => updateTriggerRule(input.id, input.patch)),

    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => deleteTriggerRule(input.id)),

    /**
     * Routes a hypothetical lead through the active rule set.
     * Used by the admin UI "Test Rule" feature AND by Lead Intake v2's
     * intake router node (called via HTTP from n8n).
     */
    route: publicProcedure
      .input(z.object({
        tags: z.array(z.string()).optional(),
        utmSource: z.string().nullable().optional(),
        utmCampaign: z.string().nullable().optional(),
        programInterest: z.string().nullable().optional(),
        trialClassDate: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => routeLeadToSequence(input)),
  }),

  lifecycle: router({
    /**
     * Records a stage transition. Used by:
     *  - Admin UI (staff manual stage change)
     *  - n8n Lead Intake v2 (initial stage assignment)
     *  - n8n Enrollment Auto-Reconciler (lead → enrolled)
     *  - n8n No-Show Recovery (trial_scheduled → no_show after 24h)
     *
     * Side effects (auto-applied in db.ts):
     *  - enrolled / lost / no_show_final → cancel all scheduled queue rows
     *
     * Rejects illegal transitions unless allowForce=true.
     */
    transition: publicProcedure
      .input(z.object({
        leadId: z.number().int().positive(),
        toStage: z.enum([
          "new_lead", "contacted", "trial_scheduled", "trial_paid",
          "trial_attended", "enrolled", "no_show", "no_show_final", "lost"
        ]),
        triggeredBy: z.string().min(1).max(100),
        reason: z.string().max(255).optional(),
        allowForce: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => recordLifecycleTransition(input)),

    history: publicProcedure
      .input(z.object({ leadId: z.number().int().positive() }))
      .query(async ({ input }) => getLifecycleHistory(input.leadId)),

    checkLegal: publicProcedure
      .input(z.object({
        fromStage: z.string().nullable(),
        toStage: z.string().min(1),
      }))
      .query(async ({ input }) => ({ legal: isLegalTransition(input.fromStage, input.toStage) })),
  }),

  audit: router({
    log: publicProcedure
      .input(z.object({
        level: z.enum(["info", "warn", "error", "critical"]).default("info"),
        source: z.string().min(1).max(100),
        event: z.string().min(1).max(255),
        details: z.string().optional(),
        leadId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input }) => {
        await logAudit(input);
        return { ok: true };
      }),

    list: publicProcedure
      .input(z.object({
        level: z.enum(["info", "warn", "error", "critical"]).optional(),
        source: z.string().optional(),
        leadId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }).optional())
      .query(async ({ input }) => listAuditLog(input ?? {})),
  }),

  dispatcher: router({
    /**
     * Pre-send guard. Called by the Sequence Dispatcher BEFORE sending any touch.
     * Returns { ok: true, template } if safe, or { ok: false, reason } if it should be skipped.
     *
     * This is the single chokepoint that prevents:
     *   - sending to opted-out / enrolled / paused leads
     *   - sending content from inactive or missing templates
     *
     * Adding new global send-blocking rules? Add them here, not in n8n.
     */
    preSendCheck: publicProcedure
      .input(z.object({
        leadId: z.number().int().positive(),
        sequenceKey: z.string().min(1),
        touchKey: z.string().min(1),
      }))
      .mutation(async ({ input }) => preSendGuard(input)),

    /**
     * Phase 4: single endpoint the Sequence Dispatcher hits per due touch.
     * Runs preSendGuard, fetches the lead, renders the template, returns
     * everything needed to POST to Resend (subject, html, recipient).
     */
    fetchAndRender: publicProcedure
      .input(z.object({
        leadId: z.number().int().positive(),
        sequenceKey: z.string().min(1),
        touchKey: z.string().min(1),
      }))
      .mutation(async ({ input }) => fetchAndRenderForDispatch(input)),

    /**
     * Phase 4: close-the-loop after the dispatcher attempts a send.
     * Atomically updates queue row, writes activity log, writes audit.
     */
    confirmSent: publicProcedure
      .input(z.object({
        queueId: z.number().int().positive(),
        status: z.enum(["sent", "failed", "skipped"]),
        providerMessageId: z.string().max(255).optional(),
        providerStatus: z.number().int().optional(),
        failureReason: z.string().max(500).optional(),
        skipReason: z.string().max(255).optional(),
        // 2026-06-09: rendered HTML snapshot from the dispatcher (audit/compliance).
        renderedHtml: z.string().max(2000000).optional(),
      }))
      .mutation(async ({ input }) => confirmTouchDispatched(input)),
  }),

  // ─── Studio (2026-06-02) ────────────────────────────────────────────────
  // Phone-upload pipe for Arfa / Ms. Aniessa. Photos and short videos land
  // here, get tagged by vertical, and feed the martial-arts-ad-research skill.
  studio: router({
    list: publicProcedure
      .input(z.object({
        vertical: z.enum([
          "afterschool", "tkd", "kickboxing", "bjj",
          "summer_camp", "spring_break_camp", "camps_general", "all_programs",
        ]).optional(),
        kind: z.enum(["photo", "video"]).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }))
      .query(async ({ input }) => listStudioAssets(input)),

    upload: publicProcedure
      .input(z.object({
        // 2026-06-04: multi-tag. First entry is the "primary" vertical (back-compat).
        // Single-tag uploads still work (just send a 1-element array).
        // `vertical` (singular) is still accepted for legacy clients and treated as
        // a 1-element tags array if `tags` is not provided.
        vertical: z.enum([
          "afterschool", "tkd", "kickboxing", "bjj",
          "summer_camp", "spring_break_camp", "camps_general", "all_programs",
        ]).optional(),
        tags: z.array(z.enum([
          "afterschool", "tkd", "kickboxing", "bjj",
          "summer_camp", "spring_break_camp", "camps_general", "all_programs",
        ])).min(1).max(8).optional(),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(100),
        // base64-encoded file bytes -express.json limit is 150MB (covers ~100MB raw + base64 overhead)
        dataBase64: z.string().min(1),
        caption: z.string().max(2000).optional(),
        minorReleaseOnFile: z.boolean().optional(),
        // Loosened from z.string().email() to z.string() -iOS sessionStorage can hand us
        // a value that fails strict email validation (encoding edge cases), and we never
        // act on this field server-side beyond storing it.
        uploadedByEmail: z.string().max(320).optional(),
      }))
      .mutation(async ({ input }) => {
        const buf = Buffer.from(input.dataBase64, "base64");
        if (buf.length === 0) throw new Error("Empty upload");
        if (buf.length > 100 * 1024 * 1024) throw new Error("File too large (max 100MB)");
        // Resolve tags: prefer `tags` if provided, else wrap `vertical` as a 1-element array.
        const tagsArray = (input.tags && input.tags.length > 0)
          ? input.tags
          : (input.vertical ? [input.vertical] : null);
        if (!tagsArray) throw new Error("Must provide either `tags` (array) or `vertical` (single)");
        const primary = tagsArray[0];
        console.log(`[studio.upload] tags=${tagsArray.join(",")} name=${input.filename} ct=${input.contentType} size=${buf.length}`);
        const kind: "photo" | "video" = input.contentType.startsWith("video/") ? "video" : "photo";
        const safeName = input.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
        const stamp = Date.now();
        const rand = Math.random().toString(36).slice(2, 8);
        const key = `studio/${primary}/${stamp}-${rand}-${safeName}`;
        await storagePut(key, buf, input.contentType);
        return await createStudioAsset({
          vertical: primary,
          tags: JSON.stringify(tagsArray),
          storageKey: key,
          originalName: input.filename,
          contentType: input.contentType,
          sizeBytes: buf.length,
          kind,
          caption: input.caption ?? null,
          minorReleaseOnFile: input.minorReleaseOnFile ?? false,
          uploadedByEmail: input.uploadedByEmail ?? null,
        });
      }),

    // 2026-06-04: retag a single asset (changes tags + primary vertical atomically).
    // Used by the gallery edit-tags modal AND by an admin bulk-fix flow.
    setTags: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        tags: z.array(z.enum([
          "afterschool", "tkd", "kickboxing", "bjj",
          "summer_camp", "spring_break_camp", "camps_general", "all_programs",
        ])).min(1).max(8),
      }))
      .mutation(async ({ input }) => {
        await setStudioAssetTags(input.id, input.tags);
        return { success: true, primaryVertical: input.tags[0] } as const;
      }),

    getDownloadUrl: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        const asset = await getStudioAssetById(input.id);
        if (!asset) throw new Error("Asset not found");
        const { url } = await storageGet(asset.storageKey);
        return { id: asset.id, storageKey: asset.storageKey, url };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        caption: z.string().max(2000).nullable().optional(),
        minorReleaseOnFile: z.boolean().optional(),
        vertical: z.enum([
          "afterschool", "tkd", "kickboxing", "bjj",
          "summer_camp", "spring_break_camp", "camps_general", "all_programs",
        ]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...patch } = input;
        await updateStudioAsset(id, patch);
        return { success: true } as const;
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deleteStudioAsset(input.id);
        return { success: true } as const;
      }),
  }),

  // ─── Calls (2026-06-06) ───────────────────────────────────────────────────
  // Powers the /admin "Today's Calls" tab. Until the 8am cron is set up in
  // n8n, generate() is also exposed so Arfa can manually pull the day's queue
  // from the UI.
  calls: router({
    listToday: publicProcedure
      .input(z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }))
      .query(async ({ input }) => listTodaysCalls(input.date)),

    // Live, date-aware call board (today + later this week), computed from leads.
    board: publicProcedure.query(async () => getCallBoard()),

    generateToday: publicProcedure
      .input(z.object({
        limit: z.number().int().min(1).max(20).default(5),
        activeVertical: z.string().max(100).optional(),
      }))
      .mutation(async ({ input }) => generateDailyCallQueue(input)),

    markOutcome: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        status: z.enum([
          "pending", "answered", "voicemail", "no_answer",
          "booked", "not_interested", "callback_later", "skipped",
        ]),
        outcomeNotes: z.string().max(2000).optional(),
        calledBy: z.string().max(320),
      }))
      .mutation(async ({ input }) => {
        await markCallOutcome({
          id: input.id,
          status: input.status,
          outcomeNotes: input.outcomeNotes,
          calledBy: input.calledBy,
        });
        return { success: true } as const;
      }),

    // Get the last N activities for a single lead, so the call card can show
    // "last touched: opened day_3 yesterday at 4pm" without an extra round-trip.
    leadActivity: publicProcedure
      .input(z.object({
        leadId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).default(10),
      }))
      .query(async ({ input }) => getLeadActivities(input.leadId, input.limit)),
  }),

  // ─── Inbound (2026-06-06) ─────────────────────────────────────────────────
  // Receives parsed email replies from the Gmail polling worker. Worker auths
  // by sending the GMAIL_POLLER_SHARED_SECRET via the secret field; this is a
  // shared-secret check (no JWT) because the worker is server-to-server.
  inbound: router({
    emailReply: publicProcedure
      .input(z.object({
        secret: z.string().min(1),
        fromEmail: z.string().email(),
        subject: z.string().max(500),
        body: z.string().max(100000),
        gmailMessageId: z.string().min(1).max(255),
        receivedAtIso: z.string(),
      }))
      .mutation(async ({ input }) => {
        const expected = process.env.GMAIL_POLLER_SHARED_SECRET;
        if (!expected || input.secret !== expected) {
          throw new Error("Unauthorized");
        }
        const result = await recordInboundEmailReply({
          fromEmail: input.fromEmail,
          subject: input.subject,
          body: input.body,
          gmailMessageId: input.gmailMessageId,
          receivedAt: new Date(input.receivedAtIso),
        });
        return result;
      }),
  }),

  // ─── Automation Controls / Kill Switch (2026-06-11) ───────────────────────
  // Password-gated on the client (same gate as the admin dashboard / studio).
  controls: router({
    list: publicProcedure.query(async () => getAutomationControls()),

    set: publicProcedure
      .input(z.object({
        controlKey: z.string().min(1).max(64),
        enabled: z.boolean(),
        updatedBy: z.string().max(255),
      }))
      .mutation(async ({ input }) => {
        await setAutomationControl(input.controlKey, input.enabled, input.updatedBy);
        return { success: true } as const;
      }),

    setAll: publicProcedure
      .input(z.object({ enabled: z.boolean(), updatedBy: z.string().max(255) }))
      .mutation(async ({ input }) => {
        await setAllAutomations(input.enabled, input.updatedBy);
        return { success: true } as const;
      }),
  }),

  // ─── Trial Check-in (2026-06-11) ──────────────────────────────────────────
  // Powers /admin/checkin: the 8:30 PM "did they show?" view. Lists today's
  // (or a given date's) trial_scheduled leads with one-tap Showed/No-show.
  checkin: router({
    listForDate: publicProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))
      .query(async ({ input }) => {
        const date = input.date ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        const leads = await getLeadsByStagesAndTrialDate(
          ["trial_scheduled", "trial_attended", "no_show", "enrolled"], date
        );
        return { date, leads };
      }),

    mark: publicProcedure
      .input(z.object({
        leadId: z.number().int().positive(),
        showed: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        await updateLeadStage(input.leadId, input.showed ? "trial_attended" : "no_show");
        return { success: true, stage: input.showed ? "trial_attended" : "no_show" } as const;
      }),
  }),

  // Personal admin to-do list (the "My Tasks" dashboard tab).
  tasks: router({
    list: publicProcedure.query(async () => listAdminTasks()),
    add: publicProcedure
      .input(z.object({
        title: z.string().min(1).max(500),
        notes: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        createdBy: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => ({ id: await addAdminTask(input) })),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        notes: z.string().nullable().optional(),
        done: z.boolean().optional(),
        dueDate: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...patch } = input;
        await updateAdminTask(id, patch);
        return { success: true };
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteAdminTask(input.id);
        return { success: true };
      }),
  }),

  // ─── Waivers / in-person sign-up (2026-06-15) ─────────────────────────────
  // Public submit: a walk-in (QR / iPad / link) signs the guest waiver. It
  // matches or creates a lead so they land in the SAME pipeline as web leads,
  // and stores the signed waiver on file. list/byLead are the admin "on file" view.
  waiver: router({
    submit: publicProcedure
      .input(z.object({
        parentName: z.string().min(1).max(255),
        address: z.string().max(500).nullable().optional(),
        email: z.string().email(),
        phone: z.string().min(7).max(20),
        students: z.array(z.object({
          name: z.string().min(1).max(255),
          dob: z.string().max(20),   // YYYY-MM-DD
        })).min(1).max(3),
        interests: z.array(z.string()).max(12).default([]),
        signatureData: z.string().nullable().optional(),   // PNG data URL
        signedName: z.string().max(255).nullable().optional(),
        signedDate: z.string().min(1).max(20),   // YYYY-MM-DD
        disclaimerText: z.string().max(8000).nullable().optional(),
        source: z.enum(["walk_in", "online", "ipad", "trial"]).default("walk_in"),
        smsConsent: z.boolean().optional(),
        smsConsentText: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const ip = (ctx?.req as any)?.ip
          || (ctx?.req as any)?.headers?.["cf-connecting-ip"]
          || (ctx?.req as any)?.headers?.["x-forwarded-for"]
          || null;
        try {
          const result = await submitWaiver({ ...input, ip: ip ? String(ip) : null });
          const kids = input.students.map(s => s.name).filter(Boolean).join(", ");
          void sendTelegramMessage(
            `📝 New in-person sign-up\n${input.parentName} signed the waiver` +
            (kids ? ` for ${kids}` : "") +
            (result.matchedExisting ? `\n(matched an existing lead)` : "") +
            `\n${adminLink("/admin/waivers")}`
          ).catch(() => {});
          return { success: true, leadId: result.leadId, matchedExisting: result.matchedExisting };
        } catch (error) {
          console.error("Waiver submission error:", error);
          throw new Error("Failed to submit waiver. Please try again.");
        }
      }),

    list: publicProcedure.query(async () => getAllWaivers()),
    byLead: publicProcedure
      .input(z.object({ leadId: z.number().int().positive() }))
      .query(async ({ input }) => getWaiversByLead(input.leadId)),
    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => { await deleteWaiver(input.id); return { success: true }; }),
  }),

  // ─── Field-trip one-off payments (2026-06-22) ────────────────────────────
  // Standalone Stripe checkout for camp field-trip fees ($25 per kid per week),
  // billed outside the camp registration (e.g. a family who enrolled for camp
  // but is paying the field-trip fee separately). The amount is computed
  // server-side from a slot count (campers x weeks) so a tampered URL cannot set
  // an arbitrary price. No DB row: the PaymentIntent metadata is the record
  // (searchable in Stripe), and confirm pings staff on success.
  fieldTrip: router({
    createIntent: publicProcedure
      .input(z.object({
        payerName: z.string().min(1).max(255),
        email: z.string().email().nullable().optional(),
        detail: z.string().max(300).optional(),
        slots: z.number().int().min(1).max(50),   // field-trip slots = campers x weeks, $25 each
      }))
      .mutation(async ({ input }) => {
        const FIELD_TRIP = 25_00;
        const amount = FIELD_TRIP * input.slots;
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          // Stripe emails the payer a receipt on success (live mode) when set.
          ...(input.email ? { receipt_email: input.email } : {}),
          metadata: {
            product: "camp_field_trip",
            payerName: input.payerName,
            email: input.email ?? "",
            detail: (input.detail ?? "").slice(0, 300),
            slots: String(input.slots),
          },
        });
        return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, amount };
      }),

    confirm: publicProcedure
      .input(z.object({ paymentIntentId: z.string() }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
        if (pi.status === "succeeded") {
          const m = pi.metadata || {};
          void sendTelegramMessage(
            `🎟️ <b>Field trip paid</b>\n` +
            `${m.payerName || "Camp family"} · $${(pi.amount / 100).toFixed(2)}\n` +
            `${m.detail || ""}`
          );
        }
        return { status: pi.status };
      }),
  }),

  // ─── $99 3-Week Trial enrollments (2026-06-15) ────────────────────────────
  // "Add Trial Student" in the Students tab. createIntent makes a $99 Stripe
  // PaymentIntent (same path as camp) + a pending enrollment; the client pays via
  // PaymentElement; confirmPayment activates it, emails a receipt, and pings staff.
  trial: router({
    createIntent: publicProcedure
      .input(z.object({
        studentName: z.string().min(1).max(255),
        email: z.string().email().nullable().optional(),
        phone: z.string().max(20).nullable().optional(),
        programInterest: z.string().max(100).nullable().optional(),
        emergencyContact: z.string().max(255).nullable().optional(),
        startDate: z.string().min(1).max(20),   // YYYY-MM-DD
        testMode: z.boolean().optional(),        // charge 50 cents for a live test instead of $99
      }))
      .mutation(async ({ input }) => {
        const AMOUNT = input.testMode ? 50 : 9900;
        const start = new Date(input.startDate + "T12:00:00");
        const end = new Date(start.getTime() + 21 * 86400000);
        const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.create({
          amount: AMOUNT,
          currency: "usd",
          metadata: { product: "3_week_99", studentName: input.studentName, email: input.email ?? "" },
        });
        const trialId = await createTrialEnrollment({
          studentName: input.studentName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          programInterest: input.programInterest ?? null,
          emergencyContact: input.emergencyContact ?? null,
          productKey: "3_week_99",
          amountCents: AMOUNT,
          startDate: input.startDate,
          endDate,
          status: "pending",
          stripePaymentIntentId: paymentIntent.id,
          stripePaymentStatus: "pending",
        });
        return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, trialId };
      }),

    confirmPayment: publicProcedure
      .input(z.object({ paymentIntentId: z.string() }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
        if (pi.status !== "succeeded") return { status: pi.status };

        const trial = await getTrialByPaymentIntent(input.paymentIntentId);
        if (!trial) return { status: pi.status };

        // Run side effects only on the first successful confirm (idempotent).
        if (trial.status !== "active") {
          await activateTrial(input.paymentIntentId, pi.status);
          if (trial.email) {
            void sendTrialReceipt({
              email: trial.email,
              studentName: trial.studentName,
              amountCents: trial.amountCents,
              startDate: trial.startDate ?? "",
              endDate: trial.endDate ?? "",
            }).catch(() => {});
          }
          void sendTelegramMessage(
            `💳 New $99 3-week trial\n${trial.studentName}${trial.programInterest ? ` · ${trial.programInterest}` : ""}` +
            (trial.endDate ? `\nTrial ends ${trial.endDate}` : "") +
            `\n${adminLink("/admin/students")}`
          ).catch(() => {});
        }
        return { status: pi.status, trialId: trial.id };
      }),

    list: publicProcedure.query(async () => listTrialEnrollments()),
    setStatus: publicProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "converted", "expired", "canceled"]) }))
      .mutation(async ({ input }) => { await updateTrialStatus(input.id, input.status); return { success: true }; }),
  }),

  // ─── Call Log (2026-06-11) ────────────────────────────────────────────────
  // Read-only view of Retell voice calls (inbound + outbound) captured by
  // /api/voice/retell-webhook. Powers /admin/call-log (Gmail-style list +
  // clickable transcript). Password-gated on the client like the rest of /admin.
  callLog: router({
    list: publicProcedure
      .input(z.object({
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }).optional())
      .query(async ({ input }) => listCallLogs(input?.limit ?? 100, input?.offset ?? 0)),

    get: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => getCallLog(input.id)),
  }),
});
export type AppRouter = typeof appRouter;

