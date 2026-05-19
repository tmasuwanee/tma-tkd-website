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
} from "./db";
import { sendToGoogleSheets, sendToSlack, sendEmailNotification, sendCampRegistrationConfirmation } from "./integrations";
import { fireLeadEvent, firePurchaseEvent } from "./meta-capi";
import { getAdInsights, syncAdInsights } from "./facebook-ads";
import Stripe from "stripe";
import { ENV } from "./_core/env";

function getStripe() {
  return new Stripe(ENV.tmaStripeSecretKey);
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
    // Never throw — n8n being down must not affect lead submission
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
      }))
      .mutation(async ({ input }) => {
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
        // Use server-calculated amount — ignore client-provided amountCents entirely
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
            }
          } catch (emailErr) {
            console.error('[confirmPayment] Failed to send confirmation email:', emailErr);
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
      }))
      .mutation(async ({ input }) => {
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
            tags: input.tags ? JSON.stringify(input.tags) : null,
            automationPaused: 0,
            automationPausedAt: null,
            automationPausedBy: null,
            automationPauseReason: null,
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
          // Fire n8n webhook async (non-blocking) — does not delay lead submission
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

    // Admin: update tags (replaces full array — client merges before calling)
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
    // Matches by email — safe to call repeatedly; never overwrites notes, stage, or existing tags.
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
        const ok = await markTouchProcessing(input.id);
        return { claimed: ok };
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
});
export type AppRouter = typeof appRouter;

