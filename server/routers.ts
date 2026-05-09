import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createLead, getLeadById, getAllLeads, updateLeadStage, updateLeadProgram, updateLeadNotes, deleteLead,
  createCampRegistration, updateCampRegistrationPayment,
  getCampRegistrationByPaymentIntentId, getAllCampRegistrations,
  softDeleteRegistration, restoreRegistration,
  upsertStudents, getAllStudents, searchStudents,
} from "./db";
import { sendToGoogleSheets, sendToSlack, sendEmailNotification, sendCampRegistrationConfirmation } from "./integrations";
import { fireLeadEvent, firePurchaseEvent } from "./meta-capi";
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
        agreedToTerms: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.create({
          amount: input.amountCents,
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
      }))
      .mutation(async ({ input }) => {
        try {
          const newLeadId = await createLead({
            parentName: input.parentName,
            kidName: input.kidName,
            kidAge: input.kidAge,
            programInterest: input.programInterest,
            motivation: input.motivation,
            email: input.email,
            phone: input.phone,
            additionalNotes: input.additionalNotes,
            utmSource: input.utmSource,
            utmMedium: input.utmMedium,
            utmCampaign: input.utmCampaign,
            utmContent: input.utmContent,
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

    // Admin: get all leads
    getAll: publicProcedure.query(async () => {
      return getAllLeads();
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

    // Admin: delete a lead
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteLead(input.id);
        return { success: true };
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
          program: z.string().optional(),
          enrollmentDate: z.string().optional(),
          beltRank: z.string().optional(),
          status: z.string().optional(),
          emergencyContact: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        await upsertStudents(input.rows);
        return { success: true, count: input.rows.length };
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
  }),
});

export type AppRouter = typeof appRouter;
