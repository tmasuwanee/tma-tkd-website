import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createLead, getLeadById, getLeadByEmail, getAllLeads, updateLeadStage, updateLeadProgram, updateLeadNotes, updateLeadTags, deleteLead,
  searchLeads,
  getAfterschoolRegistrations,
  upsertLeadFromFacebook, createLeadActivity, getLeadActivities,
  createCampRegistration, updateCampRegistrationPayment,
  getCampRegistrationByPaymentIntentId, getCampRegistrationById, getAllCampRegistrations,
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
  createTrialEnrollment, getTrialByPaymentIntent, activateTrial, listTrialEnrollments, updateTrialStatus, updateTrialStartDate,
  linkTrialLead,
  // Camp Waivers (2026-07-21) + reader so signed camp waivers are visible (2026-08-11)
  insertCampWaiver, getCampWaivers,
  // Afterschool Roster (2026-08-04)
  getRosterStudents, addRosterStudent, updateRosterStudent, removeRosterStudent, removeRosterSchool,
  // note: sendToSlack + sendToGoogleSheets retired (see leads.submit)
  getRosterAttendance, upsertRosterAttendance,
  // One-off payments (supply fee / field trip) visibility (2026-08-11)
  insertOneOffPayment, getOneOffPayments,
  // Write-action confirm-flow (2026-08-11)
  listPendingActions,
  // Membership engine (2026-08-12)
  listMemberships, getMembership, listMembershipCharges,
  // Day camp (2026-08-12)
  insertDayCampSignup, markDayCampPaid, getDayCampSignupByPI, getDayCampSignups,
} from "./db";
import { dayCampTotalCents } from "@shared/dayCamp";
import { sendTelegramMessage } from "./telegram";
import { tuitionConfiguredFor, ensureStripeCustomer, createAfterschoolSubscription } from "./tuition";
import { proposeAction, confirmAction, rejectAction } from "./action-flow";
import { createMembership, changeMembership, setMembershipDiscount, pauseMembership, resumeMembership, cancelMembership, adjustCharge } from "./membership-ops";
import { createCardSetupSession, chargeDueMemberships } from "./membership-billing";
import { storagePut, storageGet } from "./storage";
import { sendEmailNotification, sendProShopOrderNotification, sendCampRegistrationConfirmation, sendCampWaiverEmail, sendFieldTripConfirmation, sendTransportationForm, sendTrialReceipt, sendAfterschoolConfirmation, sendAfterschoolIntake, sendWaiverNotification, sendReviewedEmail } from "./integrations";
import { fillTransportationPdf } from "./transportation-pdf";
import { buildAfterschoolIntakePdf } from "./afterschool-intake-pdf";
import { buildInvoicePdf } from "./invoice-pdf";
import { buildAfterschoolWaiverPdf } from "./afterschool-waiver-pdf";
import { afterschoolWaiverPlainText } from "@shared/afterschoolWaiver";
import { fireLeadEvent, firePurchaseEvent } from "./meta-capi";
import { computeOrderCents, buildOrderSummary } from "../shared/christmasPricing";
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
          // Card only (card also surfaces Apple Pay + Google Pay in the Payment
          // Element). This removes Klarna / Affirm / Amazon Pay / Cash App that
          // Stripe's automatic payment methods would otherwise pull in.
          payment_method_types: ["card"],
          metadata: {
            camper1Name: input.camper1Name,
            parentEmail: input.email,
            programType: input.programType,
            selectedWeeks: input.selectedWeeks.slice(0, 3).join(", "),
          },
        });

        const regResult = await createCampRegistration({
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
        const registrationId = (regResult as unknown as { insertId?: number }[])[0]?.insertId
          ?? (regResult as unknown as { insertId?: number }).insertId
          ?? null;
        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          registrationId: registrationId ?? undefined,
        };
      }),

    confirmPayment: publicProcedure
      .input(z.object({ paymentIntentId: z.string() }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);
        await updateCampRegistrationPayment(input.paymentIntentId, paymentIntent.status);

        if (paymentIntent.status === 'succeeded') {
          const registration = await getCampRegistrationByPaymentIntentId(input.paymentIntentId);
          if (registration) {
            // Staff notification first, via Telegram. This does NOT depend on
            // Resend/email deliverability, so staff are told about a paid
            // registration even if the parent's confirmation email later fails.
            void sendTelegramMessage(
              `🏕️ <b>Camp registration PAID</b>\n` +
              `${registration.parentFirstName} ${registration.parentLastName} · ${registration.camper1Name}\n` +
              `$${((registration.amountPaid ?? 0) / 100).toFixed(2)} · ${registration.programType}\n` +
              `${registration.email}\n${adminLink("/admin/camp")}`
            ).catch(() => {});

            // Parent-facing emails. If Resend fails, DON'T swallow silently:
            // alert staff on Telegram so someone can resend or follow up.
            try {
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
            } catch (emailErr) {
              console.error('[confirmPayment] Failed to send confirmation/waiver email:', emailErr);
              void sendTelegramMessage(
                `⚠️ <b>Camp confirmation email FAILED to send</b>\n` +
                `${registration.parentFirstName} ${registration.parentLastName} · ${registration.email}\n` +
                `The payment went through, but the confirmation/waiver email did not. ` +
                `Resend it manually from the Camp Registrations tab.\n${adminLink("/admin/camp")}`
              ).catch(() => {});
            }
          }
        }

        return { status: paymentIntent.status };
      }),

    // Step 5: parent submits the digital waiver after payment confirmation
    submitWaiver: publicProcedure
      .input(z.object({
        registrationId: z.number().int().positive().optional(),
        camperNames: z.string().min(1),
        camperDobs: z.string().optional(),
        campWeeks: z.string().optional(),
        parentName: z.string().min(1),
        homeAddress: z.string().optional(),
        cellPhone: z.string().optional(),
        email: z.string().email().optional(),
        emergencyContactName: z.string().min(1),
        emergencyContactRelationship: z.string().optional(),
        emergencyPhone: z.string().min(1),
        authorizedPickup1: z.string().optional(),
        authorizedPickup2: z.string().optional(),
        allergies: z.string().optional(),
        medications: z.string().optional(),
        medicalConditions: z.string().optional(),
        initialsMaritalArts: z.string().min(1),
        initialsFieldTrips: z.string().min(1),
        noPhotoConsent: z.boolean(),
        signedName: z.string().min(1),
        agreedToTerms: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        const ipAddress = (ctx as { req?: { headers?: { 'x-forwarded-for'?: string; 'x-real-ip'?: string } } }).req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
          ?? (ctx as { req?: { socket?: { remoteAddress?: string } } }).req?.socket?.remoteAddress
          ?? null;
        const waiverId = await insertCampWaiver({
          ...input,
          ipAddress,
        });
        // Staff Telegram notification
        void sendTelegramMessage(
          `📋 <b>Camp Waiver Submitted</b>\n` +
          `${input.parentName} -- ${input.camperNames}\n` +
          `Emergency: ${input.emergencyContactName} (${input.emergencyPhone})\n` +
          `Signed: ${input.signedName}\n` +
          `${adminLink("/admin/camp")}`
        ).catch(() => {});
        return { success: true, waiverId };
      }),

    // Signed camp waivers, so staff can actually see who signed. The campWaivers
    // table was previously write-only (no reader, no admin surface), so a signed
    // camp waiver only ever showed up as a one-time Telegram alert.
    listWaivers: publicProcedure.query(async () => getCampWaivers()),
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
          camper1Age: r.camper1Age ?? null,
          camper1Dob: r.camper1Dob ?? null,
          camper2Name: r.camper2Name ?? null,
          camper2Age: r.camper2Age ?? null,
          camper2Dob: r.camper2Dob ?? null,
          camper3Name: r.camper3Name ?? null,
          camper3Age: r.camper3Age ?? null,
          camper3Dob: r.camper3Dob ?? null,
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

    // Manually (re)send the camp confirmation + waiver email for a registration.
    // Used when the automatic send failed (Resend hiccup, bounce) so staff can
    // recover without re-charging the parent. Throws on failure so the UI can
    // surface it, rather than silently swallowing like the auto path once did.
    resendCampConfirmation: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const registration = await getCampRegistrationById(input.id);
        if (!registration) throw new Error("Registration not found.");
        if (!registration.email) throw new Error("This registration has no email on file.");
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
        await sendCampWaiverEmail({
          parentFirstName: registration.parentFirstName,
          parentEmail: registration.email,
          camper1Name: registration.camper1Name,
        });
        return { success: true, email: registration.email };
      }),
  }),

  // ─── Leads / CRM Pipeline ────────────────────────────────────────────────
  leads: router({
    // Public: submit a new free-class inquiry
    submit: publicProcedure
      .input(z.object({
        parentName: z.string().min(1),
        kidName: z.string().min(1),
        kidAge: z.string(),
        programInterest: z.string().min(1),
        motivation: z.string().optional(),
        email: z.string().email().optional(),
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
          const email = input.email?.trim() || `no-email-${input.phone.replace(/\D/g, "") || "unknown"}-${Date.now()}@no-email.tma`;

          // Dedupe: a real email that already exists reuses that lead instead of
          // inserting a second row (the leads.email UNIQUE index would otherwise
          // reject the insert, failing the submission). Existing fields are left
          // intact so we never clobber pipeline progress or staff notes.
          const existingByEmail = input.email?.trim() ? await getLeadByEmail(email) : null;
          const newLeadId = existingByEmail ? existingByEmail.id : await createLead({
            parentName: input.parentName,
            kidName: input.kidName,
            kidAge: input.kidAge,
            programInterest: input.programInterest,
            motivation: input.motivation,
            email,
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
            email,
            phone: input.phone,
            additionalNotes: input.additionalNotes ?? null,
            pipelineStage: "new_lead" as const,
            recordType: "prospect" as const,
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
            email,
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
            email,
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
          // Pro shop / sale orders get their own email template (order summary,
          // fulfillment framing) instead of the "New Free Class Inquiry" email.
          const isProShopOrder = (input.tags ?? []).includes("proshop_order");
          // Slack + Google Sheets retired 2026-08-05: Slack duplicated the staff
          // email for a single Telegram-based team, and the Sheets export never
          // worked (unsigned JWT stub). Staff alert = email (Telegram covers
          // real-time on paid/signed paths).
          await Promise.all([
            isProShopOrder
              ? sendProShopOrderNotification(leadForIntegrations)
              : sendEmailNotification(leadForIntegrations),
          ]);

          return {
            success: true,
            message: isProShopOrder
              ? "Thank you for your order! We will contact you within 24 hours to confirm and arrange payment."
              : "Thank you for your interest! We will contact you soon to schedule your free class.",
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
          dob: z.string().optional(),
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
        dob: z.string().nullable().optional(),
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
        dob: z.string().nullable().optional(),
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
          void sendWaiverNotification({
            parentName: input.parentName,
            studentName: kids || input.parentName,
            phone: input.phone,
            email: input.email,
            sourceLabel: "In-person sign-up",
          });
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

  // ─── GCPS transportation authorization (2026-07-23) ──────────────────────
  // Our own DocuSign replacement for the GCPS Transportation Parent Authorization
  // (3026-RF). The parent fills + e-signs on /transportation; the server stamps
  // their answers + drawn signature onto the official TMA-customized PDF, stores
  // it, emails the signed PDF to the parent + staff, and records it under the
  // waivers system (source "transportation") so it shows in the dashboard.
  transportation: router({
    submit: publicProcedure
      .input(z.object({
        studentName: z.string().min(1).max(255),
        grade: z.string().max(40).optional(),
        teacher: z.string().max(120).optional(),
        homeAddress: z.string().max(300).optional(),
        aptBldg: z.string().max(40).optional(),
        homePhone: z.string().max(40).optional(),
        cellPhone: z.string().max(40).optional(),
        workPhone: z.string().max(40).optional(),
        schoolName: z.string().min(1).max(200),   // child's elementary school
        dateToBegin: z.string().max(40).optional(),
        parentEmail: z.string().email(),
        parentPhone: z.string().min(1).max(40),
        printedName: z.string().min(1).max(255),
        signedDate: z.string().min(1).max(20),
        signaturePngDataUrl: z.string().min(1),
        agreedToGuidelines: z.literal(true),
        guidelinesText: z.string().min(1).max(8000),
        smsConsentText: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const ip = (ctx?.req as any)?.ip
          || (ctx?.req as any)?.headers?.["cf-connecting-ip"]
          || (ctx?.req as any)?.headers?.["x-forwarded-for"]
          || null;

        // 1) Stamp the parent's answers + signature onto the GCPS PDF.
        const pdfBytes = await fillTransportationPdf({
          studentName: input.studentName,
          grade: input.grade,
          teacher: input.teacher,
          homeAddress: input.homeAddress,
          aptBldg: input.aptBldg,
          homePhone: input.homePhone,
          cellPhone: input.cellPhone,
          workPhone: input.workPhone,
          schoolName: input.schoolName,
          dateToBegin: input.dateToBegin,
          printedName: input.printedName,
          signedDate: input.signedDate,
          signaturePngDataUrl: input.signaturePngDataUrl,
        });
        const pdfBuffer = Buffer.from(pdfBytes);
        const pdfBase64 = pdfBuffer.toString("base64");

        // 2) Store the signed PDF.
        let pdfUrl: string | null = null;
        try {
          const safe = input.studentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
          const key = `transportation/${new Date().toISOString().slice(0, 10)}-${safe}-${Math.floor(Math.random() * 1e6)}.pdf`;
          const put = await storagePut(key, pdfBuffer, "application/pdf");
          pdfUrl = put.url;
        } catch (err) {
          console.error("[transportation] PDF storage failed (continuing):", err);
        }

        // 3) Record it under the waivers system (matches/creates the lead by email).
        const summary =
          `GCPS Transportation Parent Authorization\n` +
          `Student: ${input.studentName}${input.grade ? ` (grade ${input.grade})` : ""}` +
          `${input.teacher ? `, teacher ${input.teacher}` : ""}\n` +
          `School: ${input.schoolName}\n` +
          `Home address: ${input.homeAddress ?? "-"}${input.aptBldg ? ` Apt ${input.aptBldg}` : ""}\n` +
          `Home phone: ${input.homePhone ?? "-"} | Cell: ${input.cellPhone ?? "-"} | Work: ${input.workPhone ?? "-"}\n` +
          `Date to begin: ${input.dateToBegin ?? "-"}\n` +
          `Agreed to GCPS transportation guidelines.\n\n${input.guidelinesText}`;

        const result = await submitWaiver({
          parentName: input.printedName,
          address: input.homeAddress ?? null,
          email: input.parentEmail,
          phone: input.parentPhone,
          students: [{ name: input.studentName, dob: "" }],
          interests: [],
          signatureData: input.signaturePngDataUrl,
          signedName: input.printedName,
          signedDate: input.signedDate,
          disclaimerText: summary,
          source: "transportation",
          pdfUrl,
          ip: ip ? String(ip) : null,
          ...(input.smsConsentText ? { smsConsent: true, smsConsentText: input.smsConsentText } : {}),
        });

        // 4) Email the signed PDF to parent + staff (non-blocking).
        void sendTransportationForm({
          parentEmail: input.parentEmail,
          parentName: input.printedName,
          studentName: input.studentName,
          pdfBase64,
        });
        void sendTelegramMessage(
          `🚌 <b>Transportation form signed</b>\n${input.printedName} · ${input.studentName}\nSchool: ${input.schoolName}\n${adminLink("/admin/waivers")}`
        ).catch(() => {});

        return { success: true, pdfUrl, waiverId: result.waiverId };
      }),
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
          // Card only (card also surfaces Apple Pay + Google Pay in the Payment
          // Element). This removes Klarna / Affirm / Amazon Pay / Cash App that
          // Stripe's automatic payment methods would otherwise pull in.
          payment_method_types: ["card"],
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
          // Durable record so this one-off shows up in the dashboard, not only
          // in Stripe + Telegram. Idempotent on the PaymentIntent id.
          await insertOneOffPayment({
            product: "camp_field_trip",
            payerName: m.payerName || "Camp family",
            detail: m.detail || null,
            email: m.email || null,
            amountCents: pi.amount,
            stripePaymentIntentId: pi.id,
            stripePaymentStatus: pi.status,
          }).catch((e) => console.error("[fieldTrip] one-off record failed:", e));
          void sendTelegramMessage(
            `🎟️ <b>Field trip paid</b>\n` +
            `${m.payerName || "Camp family"} · $${(pi.amount / 100).toFixed(2)}\n` +
            `${m.detail || ""}`
          );
          if (m.email) {
            void sendFieldTripConfirmation({
              payerName: m.payerName || "",
              parentEmail: m.email,
              slots: Number(m.slots) || 0,
              amountCents: pi.amount,
              detail: m.detail || undefined,
            });
          }
        }
        return { status: pi.status };
      }),
  }),

  // ─── After-School supply fee ($65) one-off (2026-08-03) ───────────────────
  // Private payment link for the annual after-school supply fee, for families
  // who completed registration without it (includeSupplyFee=false). Fixed $65
  // server-side so a tampered URL cannot change the price. Metadata is the
  // record; confirm pings staff. Card only (+ Apple/Google Pay wallets).
  supplyFee: router({
    createIntent: publicProcedure
      .input(z.object({
        payerName: z.string().min(1).max(255),
        email: z.string().email().nullable().optional(),
        studentName: z.string().max(255).optional(),
      }))
      .mutation(async ({ input }) => {
        const amount = 65_00;
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          payment_method_types: ["card"],
          ...(input.email ? { receipt_email: input.email } : {}),
          metadata: {
            product: "afterschool_supply_fee",
            payerName: input.payerName,
            studentName: input.studentName ?? "",
            email: input.email ?? "",
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
          // Durable record so this one-off shows up in the dashboard, not only
          // in Stripe + Telegram. Idempotent on the PaymentIntent id.
          await insertOneOffPayment({
            product: "afterschool_supply_fee",
            payerName: m.payerName || "Parent",
            studentName: m.studentName || null,
            email: m.email || null,
            amountCents: pi.amount,
            stripePaymentIntentId: pi.id,
            stripePaymentStatus: pi.status,
          }).catch((e) => console.error("[supplyFee] one-off record failed:", e));
          void sendTelegramMessage(
            `🎒 <b>After-school supply fee paid</b>\n` +
            `${m.payerName || "Parent"}${m.studentName ? ` · ${m.studentName}` : ""} · $${(pi.amount / 100).toFixed(2)}`
          ).catch(() => {});
        }
        return { status: pi.status };
      }),
  }),

  // One-off payment records (supply fee, field trip) so they are reconcilable
  // in the dashboard instead of living only in Stripe + Telegram scrollback.
  payments: router({
    listOneOff: publicProcedure.query(async () => getOneOffPayments()),
  }),

  // Write-action confirm-flow: an action is proposed (does nothing), then a human
  // confirms it (executes once, idempotent) or rejects it. See server/action-flow.ts.
  actions: router({
    listPending: publicProcedure.query(async () =>
      (await listPendingActions("proposed")).map(a => ({ id: a.id, actionType: a.actionType, title: a.title, preview: a.preview, proposedBy: a.proposedBy, createdAt: a.createdAt }))),
    listRecent: publicProcedure.query(async () =>
      (await listPendingActions(undefined, 30)).map(a => ({ id: a.id, actionType: a.actionType, title: a.title, status: a.status, proposedBy: a.proposedBy, confirmedBy: a.confirmedBy, createdAt: a.createdAt, executedAt: a.executedAt }))),
    confirm: publicProcedure.input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => confirmAction(input.id, ctx.adminEmail ?? "admin")),
    reject: publicProcedure.input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => { await rejectAction(input.id, ctx.adminEmail ?? "admin"); return { ok: true }; }),
    // Manual proposer (also what the assistant will call to draft an email for review).
    proposeEmail: publicProcedure.input(z.object({ to: z.string().email(), subject: z.string().min(1).max(255), html: z.string().min(1).max(20000) }))
      .mutation(async ({ input, ctx }) => proposeAction("send_email", input, ctx.adminEmail ?? "admin")),
  }),

  // Membership engine (read). Write operations (enroll/change/pause/cancel/adjust)
  // land next as confirm-flow handlers. See docs/OPERATIONS_SOPS.md.
  memberships: router({
    list: publicProcedure.query(async () => listMemberships()),
    get: publicProcedure.input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        const membership = await getMembership(input.id);
        if (!membership) return null;
        const charges = await listMembershipCharges(input.id);
        return { membership, charges };
      }),
    // Direct staff mutations (the dashboard shows an inline confirm before calling).
    create: publicProcedure.input(z.object({
      studentName: z.string().min(1).max(255),
      parentName: z.string().max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(40).optional(),
      program: z.string().min(1).max(40),
      planLabel: z.string().max(80).optional(),
      monthlyAmountCents: z.number().int().min(0),
      discountCents: z.number().int().min(0).optional(),
      discountNote: z.string().max(255).optional(),
      startDate: z.string().max(20).optional(),
      termMonths: z.number().int().min(1).max(60).optional(),
      billingDay: z.number().int().min(1).max(28).optional(),
      contractNote: z.string().max(500).optional(),
    })).mutation(async ({ input }) => createMembership(input)),
    change: publicProcedure.input(z.object({ id: z.number().int().positive(), program: z.string().max(40).optional(), planLabel: z.string().max(80).optional(), monthlyAmountCents: z.number().int().min(0).optional(), prorate: z.boolean().optional() }))
      .mutation(async ({ input }) => { const { id, ...changes } = input; await changeMembership(id, changes); return { ok: true }; }),
    setDiscount: publicProcedure.input(z.object({ id: z.number().int().positive(), discountCents: z.number().int().min(0), note: z.string().max(255).optional() }))
      .mutation(async ({ input }) => { await setMembershipDiscount(input.id, input.discountCents, input.note ?? null); return { ok: true }; }),
    pause: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { await pauseMembership(input.id); return { ok: true }; }),
    resume: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { await resumeMembership(input.id); return { ok: true }; }),
    cancel: publicProcedure.input(z.object({ id: z.number().int().positive(), immediate: z.boolean() })).mutation(async ({ input }) => { await cancelMembership(input.id, { immediate: input.immediate }); return { ok: true }; }),
    adjustCharge: publicProcedure.input(z.object({ chargeId: z.number().int().positive(), amountCents: z.number().int().min(0).optional(), status: z.enum(["scheduled", "waived", "canceled", "paid"]).optional(), note: z.string().max(255).optional() }))
      .mutation(async ({ input, ctx }) => { const { chargeId, ...changes } = input; await adjustCharge(chargeId, changes, ctx.adminEmail ?? "admin"); return { ok: true }; }),
    // Autopay: create a Stripe Checkout (setup) link to collect the card; the
    // webhook attaches it to the membership on completion.
    setupCardSession: publicProcedure.input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const proto = String((ctx.req.headers["x-forwarded-proto"] as string) || "https").split(",")[0];
        const host = ctx.req.headers.host || "tmatkd.com";
        return createCardSetupSession(input.id, `${proto}://${host}`);
      }),
    // Manual trigger for the due-charge job (also runs on a schedule). No-op unless
    // MEMBERSHIP_AUTOCHARGE_ENFORCE is on.
    chargeDueNow: publicProcedure.mutation(async () => chargeDueMemberships()),
  }),

  // Day camp signups ($60/day). Parent-facing createIntent/confirm are public;
  // list is admin-gated by default-deny.
  dayCamp: router({
    createIntent: publicProcedure.input(z.object({
      childName: z.string().min(1).max(255),
      parentName: z.string().min(1).max(255),
      email: z.string().email().nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(30),
    })).mutation(async ({ input }) => {
      const amount = dayCampTotalCents(input.dates.length);
      const stripe = getStripe();
      const paymentIntent = await stripe.paymentIntents.create({
        amount, currency: "usd", payment_method_types: ["card"],
        ...(input.email ? { receipt_email: input.email } : {}),
        metadata: { product: "day_camp", childName: input.childName, parentName: input.parentName, email: input.email ?? "", dates: input.dates.join(", "), dayCount: String(input.dates.length) },
      });
      await insertDayCampSignup({ childName: input.childName, parentName: input.parentName, email: input.email ?? null, phone: input.phone ?? null, dates: input.dates, amountCents: amount, stripePaymentIntentId: paymentIntent.id });
      return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, amount };
    }),
    confirm: publicProcedure.input(z.object({ paymentIntentId: z.string() })).mutation(async ({ input }) => {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
      await markDayCampPaid(pi.id, pi.status);
      if (pi.status === "succeeded") {
        const s = await getDayCampSignupByPI(pi.id);
        const m = pi.metadata || {};
        void sendTelegramMessage(`☀️ <b>Day camp signup PAID</b>\n${m.childName || s?.childName} · ${m.dates || ""}\n$${(pi.amount / 100).toFixed(2)} · ${m.parentName || s?.parentName}`).catch(() => {});
        if (m.email) void sendReviewedEmail(m.email, "Your TMA day-camp signup is confirmed", `<div style="font-family:Arial,sans-serif;color:#1a2233;">Thanks ${m.parentName || ""}! ${m.childName || "Your child"} is signed up for day camp on <strong>${m.dates || "the selected day(s)"}</strong>. Total paid: $${(pi.amount / 100).toFixed(2)}. Morning drop-off. Questions? Call or text (770) 277-3009.</div>`).catch(() => {});
      }
      return { status: pi.status };
    }),
    list: publicProcedure.query(async () => getDayCampSignups()),
  }),

  // Global admin search (Cmd/Ctrl-K palette): find a lead, student, or afterschool
  // child fast across the many admin views. Server-side LIKE, small result cap.
  search: router({
    query: publicProcedure
      .input(z.object({ q: z.string().trim().min(1).max(100) }))
      .query(async ({ input }) => {
        const q = input.q;
        const [leadHits, studentHits, roster] = await Promise.all([
          searchLeads(q, 8),
          searchStudents(q),
          getRosterStudents(),
        ]);
        const needle = q.toLowerCase();
        const students = studentHits as Array<{ id: number; name: string; email: string | null; phone: string | null }>;
        return [
          ...leadHits.map(l => ({
            type: "lead" as const,
            id: l.id,
            title: l.kidName || l.parentName,
            subtitle: `${l.parentName}${l.pipelineStage ? ` · ${l.pipelineStage.replace(/_/g, " ")}` : ""}`,
            href: `/admin/leads?focus=lead:${l.id}`,
          })),
          ...students.slice(0, 8).map(s => ({
            type: "student" as const,
            id: s.id,
            title: s.name,
            subtitle: [s.email, s.phone].filter(Boolean).join(" · ") || "Student",
            href: `/admin/students`,
          })),
          ...roster
            .filter(r => `${r.childName} ${r.schoolName} ${r.phone ?? ""}`.toLowerCase().includes(needle))
            .slice(0, 8)
            .map(r => ({
              type: "roster" as const,
              id: r.id,
              title: r.childName,
              subtitle: `Afterschool · ${r.schoolName}`,
              href: `/admin/afterschool-roster`,
            })),
        ].slice(0, 24);
      }),
  }),

  // ─── After-School waiver only (2026-08-05) ────────────────────────────────
  // Standalone waiver signing (no registration questions / no payment) for a
  // parent who just needs to sign the After-School waiver + policies. Stamps a
  // signed PDF, stores it, and files it under the waivers system with source
  // "afterschool-waiver" (recordType form_only, so it never enters the call pile).
  afterschoolWaiver: router({
    submit: publicProcedure
      .input(z.object({
        parentName: z.string().min(1).max(255),
        email: z.string().email(),
        phone: z.string().min(1).max(40),
        studentName: z.string().min(1).max(255),
        signedRelationship: z.string().max(120).optional(),
        signedDate: z.string().min(1).max(40),
        waiverInitials: z.record(z.string(), z.string().max(6)),
        signaturePngDataUrl: z.string().min(1),
        agreedToGuidelines: z.literal(true),
        smsConsentText: z.string().max(2000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const ip = (ctx?.req as any)?.ip
          || (ctx?.req as any)?.headers?.["cf-connecting-ip"]
          || (ctx?.req as any)?.headers?.["x-forwarded-for"]
          || null;

        const pdfBytes = await buildAfterschoolWaiverPdf({
          parentName: input.parentName,
          studentName: input.studentName,
          signedRelationship: input.signedRelationship,
          signedDate: input.signedDate,
          waiverInitials: input.waiverInitials,
          signaturePngDataUrl: input.signaturePngDataUrl,
        });
        const pdfBuffer = Buffer.from(pdfBytes);

        let pdfUrl: string | null = null;
        try {
          const safe = input.studentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
          const key = `afterschool-waiver/${new Date().toISOString().slice(0, 10)}-${safe}-${Math.floor(Math.random() * 1e6)}.pdf`;
          const put = await storagePut(key, pdfBuffer, "application/pdf");
          pdfUrl = put.url;
        } catch (err) {
          console.error("[afterschool-waiver] PDF storage failed (continuing):", err);
        }

        let waiverId: number | undefined;
        try {
          const result = await submitWaiver({
            parentName: input.parentName,
            email: input.email,
            phone: input.phone,
            students: [{ name: input.studentName, dob: "" }],
            interests: ["afterschool"],
            signatureData: input.signaturePngDataUrl,
            signedName: input.parentName,
            signedDate: input.signedDate,
            disclaimerText: `After School Waiver & Policies\nStudent: ${input.studentName}\n\n${afterschoolWaiverPlainText()}`,
            source: "afterschool-waiver",
            recordType: "form_only",
            pdfUrl,
            ip: ip ? String(ip) : null,
            ...(input.smsConsentText ? { smsConsent: true, smsConsentText: input.smsConsentText } : {}),
          });
          waiverId = result.waiverId;
        } catch (err) {
          console.error("[afterschool-waiver] waiver record failed (continuing):", err);
        }

        void sendTelegramMessage(
          `📝 <b>After-school waiver signed</b>\n${input.parentName} · ${input.studentName}\n${adminLink("/admin/waivers")}`
        ).catch(() => {});
        void sendWaiverNotification({
          parentName: input.parentName,
          studentName: input.studentName,
          phone: input.phone,
          email: input.email,
          sourceLabel: "After-School Waiver",
        });

        return { success: true, pdfUrl, waiverId };
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
          // Card only (card also surfaces Apple Pay + Google Pay in the Payment
          // Element). This removes Klarna / Affirm / Amazon Pay / Cash App that
          // Stripe's automatic payment methods would otherwise pull in.
          payment_method_types: ["card"],
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
          // Link the paid trial to its CRM lead so it stops being a separate
          // silo from the pipeline. Only touches an EXISTING lead (no fabricated
          // placeholder leads) and never regresses a lead already past trial_paid.
          try {
            if (!trial.leadId && trial.email) {
              const lead = await getLeadByEmail(trial.email);
              if (lead) {
                await linkTrialLead(trial.id, lead.id);
                if (["new_lead", "contacted", "trial_scheduled"].includes(lead.pipelineStage)) {
                  await updateLeadStage(lead.id, "trial_paid", trial.amountCents);
                }
              }
            }
          } catch (e) { console.error("[trial] lead link failed:", e); }
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
    // Reschedule the first day. Recomputes the end date (start + 21) and resets
    // the end-of-trial reminder milestones so the 7/3/2/1-day pings track the new window.
    updateStartDate: publicProcedure
      .input(z.object({ id: z.number().int().positive(), startDate: z.string().min(1).max(20) }))
      .mutation(async ({ input }) => updateTrialStartDate(input.id, input.startDate)),
  }),

  // ─── Back to School $49 two-week special (online payment) ──────────────────
  // Families pick a program and pay $49 online for two weeks. The CRM lead is
  // created up front (tagged back_to_school_2026) so nothing is invisible even
  // if the confirm round-trip is lost; confirm then marks it paid, fires the
  // Meta purchase event, and pings staff. The amount is fixed server-side so
  // the client can never set the price.
  backToSchool: router({
    createIntent: publicProcedure
      .input(z.object({
        program: z.string().min(1).max(100),
        parentName: z.string().min(1).max(255),
        kidName: z.string().min(1).max(255),
        kidAge: z.string().max(20).nullable().optional(),
        phone: z.string().min(1).max(40),
        email: z.string().email().nullable().optional(),
        smsConsentText: z.string().min(1),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmCampaign: z.string().optional(),
        utmContent: z.string().optional(),
        testMode: z.boolean().optional(), // charge 50 cents for a live test instead of $49
      }))
      .mutation(async ({ input, ctx }) => {
        const AMOUNT = input.testMode ? 50 : 4900;
        const ip = (ctx?.req as any)?.ip
          || (ctx?.req as any)?.headers?.["cf-connecting-ip"]
          || (ctx?.req as any)?.headers?.["x-forwarded-for"]
          || null;
        const leadId = await createLead({
          parentName: input.parentName,
          kidName: input.kidName,
          kidAge: input.kidAge ?? "",
          programInterest: input.program,
          email: input.email ?? "",
          phone: input.phone,
          pipelineStage: "new_lead",
          recordType: "trial",
          additionalNotes: `Back to School Special: 2 weeks of ${input.program} for $${(AMOUNT / 100).toFixed(2)}. Online payment PENDING.`,
          tags: JSON.stringify(["back_to_school_2026"]),
          utmSource: input.utmSource,
          utmMedium: input.utmMedium,
          utmCampaign: input.utmCampaign,
          utmContent: input.utmContent,
          smsConsent: 1,
          smsConsentAt: new Date(),
          smsConsentIp: ip ? String(ip).slice(0, 64) : null,
          smsConsentText: input.smsConsentText,
        });
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.create({
          amount: AMOUNT,
          currency: "usd",
          // Card only (card also surfaces Apple Pay + Google Pay in the Payment
          // Element). This removes Klarna / Affirm / Amazon Pay / Cash App that
          // Stripe's automatic payment methods would otherwise pull in.
          payment_method_types: ["card"],
          receipt_email: input.email ?? undefined,
          metadata: {
            product: "back_to_school_49",
            leadId: String(leadId),
            program: input.program,
            parentName: input.parentName,
            phone: input.phone,
          },
        });
        return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, leadId };
      }),

    confirm: publicProcedure
      .input(z.object({ paymentIntentId: z.string() }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
        if (pi.status !== "succeeded") return { status: pi.status };

        const leadId = Number(pi.metadata?.leadId ?? 0);
        if (!leadId) return { status: pi.status };
        const lead = await getLeadById(leadId);
        if (!lead) return { status: pi.status };

        // Idempotent: side effects fire only on the first successful confirm.
        const currentTags = lead.tags ? (JSON.parse(lead.tags) as string[]) : [];
        if (!currentTags.includes("paid")) {
          await updateLeadTags(leadId, [...currentTags, "paid"]);
          await updateLeadNotes(
            leadId,
            `Back to School Special: PAID $${(pi.amount / 100).toFixed(2)} online on ${new Date().toLocaleString()}. Program: ${pi.metadata?.program ?? lead.programInterest}. 2 weeks.`
          );
          void firePurchaseEvent({ leadId, email: lead.email, phone: lead.phone, valueUsd: pi.amount / 100 });
          void sendTelegramMessage(
            `🎒 Back to School $49 PAID\n${lead.parentName}${lead.kidName ? ` (${lead.kidName})` : ""} · ${pi.metadata?.program ?? lead.programInterest}\n$${(pi.amount / 100).toFixed(2)}\n${adminLink("/admin/leads")}`
          ).catch(() => {});
        }
        return { status: pi.status, leadId };
      }),
  }),

  // ─── Christmas in July sale checkout (2026-07) ────────────────────────────
  // The cart has pro shop items, tuition bundles, sibling discounts, private
  // lessons and belt testing. The client sends ONLY raw selections (no prices);
  // the amount is recomputed here from shared/christmasPricing so a tampered
  // client cannot set its own price. Same module the client renders from, so
  // the displayed total and the charged total cannot drift.
  christmas: router({
    createIntent: publicProcedure
      .input(z.object({
        selections: z.object({
          quantities: z.record(z.string(), z.number()).optional(),
          maProgram: z.string().nullable().optional(),
          maDuration: z.union([z.literal(3), z.literal(6)]).nullable().optional(),
          afterschoolProgram: z.string().nullable().optional(),
          afterschoolDuration: z.union([z.literal(3), z.literal(6)]).nullable().optional(),
          afterschoolAdditionalKids: z.number().min(0).max(4).optional(),
          additionalKidNames: z.array(z.string().max(255)).max(4).optional(),
          privateLessons: z.boolean().optional(),
          beltTesting: z.boolean().optional(),
        }),
        studentName: z.string().min(1).max(255),
        parentName: z.string().min(1).max(255),
        phone: z.string().min(1).max(40),
        email: z.string().email().nullable().optional(),
        notes: z.string().max(2000).optional(),
        smsConsentText: z.string().min(1),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmCampaign: z.string().optional(),
        utmContent: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Hard server-side sale window. The client disables the button after the
        // sale ends, but never trust the client on a payment endpoint: reject any
        // charge attempt outside the sale window so no one is billed late.
        const SALE_CLOSES_AT = new Date("2026-07-19T00:00:00-04:00");
        if (new Date() >= SALE_CLOSES_AT) {
          throw new Error("The Christmas in July sale has ended. Please contact the school if you still need to place an order.");
        }
        // Authoritative amount. Never trust the client.
        const amountCents = computeOrderCents(input.selections);
        if (amountCents < 50) {
          throw new Error("Your cart is empty or below the minimum charge. Please select at least one item.");
        }
        if (amountCents > 1_000_000) {
          throw new Error("Order total is too large to process online. Please call the school.");
        }

        const summary = buildOrderSummary(input.selections, input.notes);
        const ip = (ctx?.req as any)?.ip
          || (ctx?.req as any)?.headers?.["cf-connecting-ip"]
          || (ctx?.req as any)?.headers?.["x-forwarded-for"]
          || null;

        const programInterest = input.selections.afterschoolProgram
          ? "Afterschool"
          : input.selections.maProgram
            ? "Multiple Programs"
            : "Pro Shop";

        const leadId = await createLead({
          parentName: input.parentName,
          kidName: input.studentName,
          kidAge: "",
          programInterest,
          email: input.email ?? "",
          phone: input.phone,
          pipelineStage: "new_lead",
          recordType: "order",
          additionalNotes: `${summary}\n\nOnline payment PENDING ($${(amountCents / 100).toFixed(2)}).`,
          tags: JSON.stringify(["proshop_order", "christmas_july_2026"]),
          utmSource: input.utmSource,
          utmMedium: input.utmMedium,
          utmCampaign: input.utmCampaign,
          utmContent: input.utmContent,
          smsConsent: 1,
          smsConsentAt: new Date(),
          smsConsentIp: ip ? String(ip).slice(0, 64) : null,
          smsConsentText: input.smsConsentText,
        });

        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: "usd",
          // Card only (card also surfaces Apple Pay + Google Pay in the Payment
          // Element). This removes Klarna / Affirm / Amazon Pay / Cash App that
          // Stripe's automatic payment methods would otherwise pull in.
          payment_method_types: ["card"],
          receipt_email: input.email ?? undefined,
          metadata: {
            product: "christmas_july_2026",
            leadId: String(leadId),
            parentName: input.parentName,
            phone: input.phone,
          },
        });

        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          leadId,
          amountCents,
        };
      }),

    confirm: publicProcedure
      .input(z.object({ paymentIntentId: z.string() }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
        if (pi.status !== "succeeded") return { status: pi.status };

        const leadId = Number(pi.metadata?.leadId ?? 0);
        if (!leadId) return { status: pi.status };
        const lead = await getLeadById(leadId);
        if (!lead) return { status: pi.status };

        // Idempotent: side effects fire only on the first successful confirm.
        const currentTags = lead.tags ? (JSON.parse(lead.tags) as string[]) : [];
        if (!currentTags.includes("paid")) {
          await updateLeadTags(leadId, [...currentTags, "paid"]);
          const paidNote = (lead.additionalNotes ?? "").replace(
            /Online payment PENDING \(\$[\d.]+\)\./,
            `Online payment RECEIVED: $${(pi.amount / 100).toFixed(2)} on ${new Date().toLocaleString()}.`
          );
          await updateLeadNotes(leadId, paidNote);
          void firePurchaseEvent({ leadId, email: lead.email, phone: lead.phone, valueUsd: pi.amount / 100 });
          void sendProShopOrderNotification({ ...lead, additionalNotes: paidNote } as any).catch(() => {});
          void sendTelegramMessage(
            `🛍️ Christmas in July order PAID\n${lead.parentName}${lead.kidName ? ` (${lead.kidName})` : ""}\n$${(pi.amount / 100).toFixed(2)}\n${adminLink("/admin/leads")}`
          ).catch(() => {});
        }
        return { status: pi.status, leadId };
      }),
  }),

    // ─── After School Care registrations (2026-07-01) ─────────────────────────
  // Standalone Stripe checkout for After School Care one-time fees.
  // Families choose their plan (4-5 day or 2-3 day) and pay registration ($99),
  // uniform ($50), and supply fee ($65) upfront. No DB row needed — Stripe
  // metadata is the record. Staff is pinged on success via Telegram.
  afterschool: router({
    // Full enrollment intake: children, parents, pickup auth, about-the-child,
    // plan, and the signed waiver. Saves + emails the signed PDF FIRST (so the
    // legal record exists even if the family drops off at checkout), then
    // returns a Stripe PaymentIntent so the client can collect the one-time fees.
    submitIntake: publicProcedure
      .input(z.object({
        // children
        children: z.array(z.object({
          name: z.string().min(1).max(255),
          dob: z.string().max(40).optional(),
          gender: z.string().max(40).optional(),
        })).min(1).max(2),
        childrenAddress: z.string().max(300).optional(),
        // parents
        parentEmail: z.string().email(),
        primaryPhone: z.string().min(1).max(40),
        legalCustody: z.string().max(200).optional(),
        mother: z.object({
          name: z.string().max(255).optional(),
          phone: z.string().max(40).optional(),
          address: z.string().max(300).optional(),
          workPhone: z.string().max(40).optional(),
          cellPhone: z.string().max(40).optional(),
        }).optional(),
        father: z.object({
          name: z.string().max(255).optional(),
          phone: z.string().max(40).optional(),
          address: z.string().max(300).optional(),
          cellPhone: z.string().max(40).optional(),
        }).optional(),
        // pickup authorization
        pickupAuth: z.array(z.object({
          name: z.string().max(255),
          phone: z.string().max(40).optional(),
        })).max(3).default([]),
        custodialGuardianName: z.string().min(1).max(255),
        // about the child
        specialNeeds: z.string().max(2000).optional(),
        hadSeizures: z.boolean().default(false),
        hasTantrums: z.boolean().default(false),
        tantrumHandling: z.string().max(1000).optional(),
        pickupDays: z.array(z.string().max(12)).max(7).default([]),
        // plan + fees
        plan: z.enum(["4_5_day", "2_3_day"]),
        includeUniform: z.boolean().default(true),
        includeSupplyFee: z.boolean().default(true),
        earlyBird: z.boolean().default(false),
        startDate: z.string().max(40).optional(),
        // waiver
        waiverInitials: z.record(z.string(), z.string().max(6)),
        signedName: z.string().min(1).max(255),
        signedRelationship: z.string().max(120).optional(),
        signedDate: z.string().min(1).max(40),
        signaturePngDataUrl: z.string().min(1),
        smsConsentText: z.string().max(2000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const ip = (ctx?.req as any)?.ip
          || (ctx?.req as any)?.headers?.["cf-connecting-ip"]
          || (ctx?.req as any)?.headers?.["x-forwarded-for"]
          || null;

        const planLabel = input.plan === "4_5_day" ? "4–5 Day/Week" : "2–3 Day/Week";
        const primaryStudent = input.children[0];

        // 1) Build the signed enrollment + waiver PDF.
        const pdfBytes = await buildAfterschoolIntakePdf({
          children: input.children,
          childrenAddress: input.childrenAddress,
          parentEmail: input.parentEmail,
          legalCustody: input.legalCustody,
          primaryPhone: input.primaryPhone,
          mother: input.mother,
          father: input.father,
          pickupAuth: input.pickupAuth,
          custodialGuardianName: input.custodialGuardianName,
          aboutChild: {
            specialNeeds: input.specialNeeds,
            hadSeizures: input.hadSeizures,
            hasTantrums: input.hasTantrums,
            tantrumHandling: input.tantrumHandling,
          },
          pickupDays: input.pickupDays,
          planLabel,
          includeUniform: input.includeUniform,
          includeSupplyFee: input.includeSupplyFee,
          earlyBird: input.earlyBird,
          startDate: input.startDate,
          waiverInitials: input.waiverInitials,
          signedName: input.signedName,
          signedRelationship: input.signedRelationship,
          signedDate: input.signedDate,
          signaturePngDataUrl: input.signaturePngDataUrl,
        });
        const pdfBuffer = Buffer.from(pdfBytes);
        const pdfBase64 = pdfBuffer.toString("base64");

        // 2) Store the signed PDF.
        let pdfUrl: string | null = null;
        try {
          const safe = primaryStudent.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
          const key = `afterschool/${new Date().toISOString().slice(0, 10)}-${safe}-${Math.floor(Math.random() * 1e6)}.pdf`;
          const put = await storagePut(key, pdfBuffer, "application/pdf");
          pdfUrl = put.url;
        } catch (err) {
          console.error("[afterschool] PDF storage failed (continuing):", err);
        }

        // 3) Record it under the waivers system (matches/creates the lead by email).
        let waiverId: number | undefined;
        try {
          const summary =
            `After School Enrollment + Waiver\n` +
            `Students: ${input.children.map(c => c.name + (c.dob ? ` (DOB ${c.dob})` : "")).join("; ")}\n` +
            `Plan: ${planLabel}\n` +
            `Pick-up days: ${input.pickupDays.join(", ") || "-"}\n` +
            `Custodial guardian: ${input.custodialGuardianName}\n\n` +
            afterschoolWaiverPlainText();
          const result = await submitWaiver({
            parentName: input.signedName,
            address: input.childrenAddress ?? null,
            email: input.parentEmail,
            phone: input.primaryPhone,
            students: input.children.map(c => ({ name: c.name, dob: c.dob ?? "" })),
            interests: ["afterschool"],
            signatureData: input.signaturePngDataUrl,
            signedName: input.signedName,
            signedDate: input.signedDate,
            disclaimerText: summary,
            source: "afterschool-registration",
            recordType: "enrolled",
            pdfUrl,
            ip: ip ? String(ip) : null,
            ...(input.smsConsentText ? { smsConsent: true, smsConsentText: input.smsConsentText } : {}),
          });
          waiverId = result.waiverId;
        } catch (err) {
          console.error("[afterschool] waiver record failed (continuing):", err);
        }

        // 4) Email the signed PDF to parent + staff (non-blocking).
        void sendAfterschoolIntake({
          parentEmail: input.parentEmail,
          parentName: input.signedName,
          studentName: primaryStudent.name,
          pdfBase64,
        });
        void sendTelegramMessage(
          `📝 <b>After School enrollment signed</b>\n${input.signedName} · ${primaryStudent.name}\nPlan: ${planLabel}\n${adminLink("/admin/waivers")}`
        ).catch(() => {});

        // 5) Create the Stripe PaymentIntent for the one-time fees.
        const REGISTRATION = 99_00;
        const UNIFORM = 50_00;
        const SUPPLY_FEE = 65_00;
        const MONTHLY = input.plan === "4_5_day" ? 500_00 : 400_00;
        const earlyBirdDiscount = input.earlyBird ? Math.round(MONTHLY * 0.5) : 0;
        let amount = REGISTRATION;
        if (input.includeUniform) amount += UNIFORM;
        if (input.includeSupplyFee) amount += SUPPLY_FEE;
        if (input.earlyBird) amount += earlyBirdDiscount;
        const stripe = getStripe();
        // If recurring tuition is configured for this plan, save the card to a
        // Stripe customer so the monthly subscription can charge it later. Gated:
        // no price env -> customerId null -> the PaymentIntent is unchanged.
        const tuitionOn = tuitionConfiguredFor(input.plan);
        const customerId = tuitionOn ? await ensureStripeCustomer(input.parentEmail, input.signedName) : null;
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          // Card only (card also surfaces Apple Pay + Google Pay in the Payment
          // Element). This removes Klarna / Affirm / Amazon Pay / Cash App that
          // Stripe's automatic payment methods would otherwise pull in.
          payment_method_types: ["card"],
          receipt_email: input.parentEmail,
          // Save the card for the recurring subscription (only when configured).
          ...(customerId ? { customer: customerId, setup_future_usage: "off_session" as const } : {}),
          metadata: {
            product: "afterschool_registration",
            parentName: input.signedName,
            studentName: primaryStudent.name,
            email: input.parentEmail,
            phone: input.primaryPhone,
            plan: input.plan,
            includeUniform: String(input.includeUniform),
            includeSupplyFee: String(input.includeSupplyFee),
            earlyBird: String(input.earlyBird),
            earlyBirdDiscountCents: String(earlyBirdDiscount),
            startDate: input.startDate ?? "",
            waiverId: waiverId != null ? String(waiverId) : "",
            tuition: tuitionOn ? "1" : "0",
          },
        });

        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount,
          earlyBirdDiscountCents: earlyBirdDiscount,
          pdfUrl,
          waiverId,
        };
      }),
    createIntent: publicProcedure
      .input(z.object({
        parentName: z.string().min(1).max(255),
        studentName: z.string().min(1).max(255),
        email: z.string().email().nullable().optional(),
        phone: z.string().max(20).nullable().optional(),
        plan: z.enum(["4_5_day", "2_3_day"]),
        includeUniform: z.boolean().default(true),
        includeSupplyFee: z.boolean().default(true),
        earlyBird: z.boolean().default(false),
        startDate: z.string().max(20).optional(),
      }))
      .mutation(async ({ input }) => {
        const REGISTRATION = 99_00;
        const UNIFORM = 50_00;
        const SUPPLY_FEE = 65_00;
        // Monthly tuition: 4-5 day = $500, 2-3 day = $400. Early bird = 50% off first month.
        const MONTHLY = input.plan === "4_5_day" ? 500_00 : 400_00;
        const earlyBirdDiscount = input.earlyBird ? Math.round(MONTHLY * 0.5) : 0;
        let amount = REGISTRATION;
        if (input.includeUniform) amount += UNIFORM;
        if (input.includeSupplyFee) amount += SUPPLY_FEE;
        if (input.earlyBird) amount += earlyBirdDiscount; // add discounted first month
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          // Card only (card also surfaces Apple Pay + Google Pay in the Payment
          // Element). This removes Klarna / Affirm / Amazon Pay / Cash App that
          // Stripe's automatic payment methods would otherwise pull in.
          payment_method_types: ["card"],
          ...(input.email ? { receipt_email: input.email } : {}),
          metadata: {
            product: "afterschool_registration",
            parentName: input.parentName,
            studentName: input.studentName,
            email: input.email ?? "",
            phone: input.phone ?? "",
            plan: input.plan,
            includeUniform: String(input.includeUniform),
            includeSupplyFee: String(input.includeSupplyFee),
            earlyBird: String(input.earlyBird),
            earlyBirdDiscountCents: String(earlyBirdDiscount),
            startDate: input.startDate ?? "",
          },
        });
        return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, amount, earlyBirdDiscountCents: earlyBirdDiscount };
      }),
    confirm: publicProcedure
      .input(z.object({ paymentIntentId: z.string() }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
        if (pi.status === "succeeded") {
          const m = pi.metadata || {};
          const planLabel = m.plan === "4_5_day" ? "4–5 Day/Week" : "2–3 Day/Week";
          const earlyBird = m.earlyBird === "true";
          const includeUniform = m.includeUniform === "true";
          const includeSupplyFee = m.includeSupplyFee === "true";
          const REGISTRATION = 99_00;
          const UNIFORM = 50_00;
          const SUPPLY_FEE = 65_00;
          const uniformFee = includeUniform ? UNIFORM : 0;
          const supplyFee = includeSupplyFee ? SUPPLY_FEE : 0;
          // Save to DB
          let registrationId = 0;
          try {
            const { insertAfterschoolRegistration } = await import('./db');
            registrationId = await insertAfterschoolRegistration({
              parentName: m.parentName || "",
              childName: m.studentName || "",
              childAge: null,
              email: m.email || "",
              phone: m.phone || "",
              planType: (m.plan as '4_5_day' | '2_3_day') || '4_5_day',
              registrationFee: REGISTRATION,
              uniformFee,
              supplyFee,
              earlyBird,
              totalAmountCents: pi.amount,
              stripePaymentIntentId: pi.id,
              stripePaymentStatus: pi.status,
              // Persist the waiver link carried in the PaymentIntent metadata so
              // the signed waiver + payment are one connected record, not two.
              waiverId: m.waiverId ? Number(m.waiverId) : null,
            });
          } catch (dbErr) {
            console.error('[Afterschool] DB insert failed:', dbErr);
          }

          // Recurring tuition: create the monthly subscription on the saved card.
          // Gated on tuition config + a customer/payment method on the PI, so it
          // is a no-op until Stripe prices are configured (behavior unchanged).
          if (registrationId && tuitionConfiguredFor(m.plan) && pi.customer && pi.payment_method) {
            await createAfterschoolSubscription({
              registrationId,
              plan: m.plan,
              customerId: typeof pi.customer === "string" ? pi.customer : pi.customer.id,
              paymentMethodId: typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method.id,
              startDate: m.startDate || null,
            }).catch((e) => console.error("[Afterschool] subscription create failed:", e));
          }
          // Send confirmation email
          if (m.email) {
            void sendAfterschoolConfirmation({
              parentName: m.parentName || "",
              childName: m.studentName || "",
              email: m.email,
              planType: (m.plan as '4_5_day' | '2_3_day') || '4_5_day',
              registrationFee: REGISTRATION,
              uniformFee,
              supplyFee,
              earlyBird,
              totalAmountCents: pi.amount,
            });
          }
          // Notify staff via Telegram
          void sendTelegramMessage(
            `🏫 <b>After School Care registration paid</b>\n` +
            `Parent: ${m.parentName || "—"}\n` +
            `Student: ${m.studentName || "—"}\n` +
            `Plan: ${planLabel}\n` +
            `Amount: $${(pi.amount / 100).toFixed(2)}\n` +
            `Email: ${m.email || "—"} · Phone: ${m.phone || "—"}` +
            (earlyBird ? "\n🎉 Early Bird (July 31 deadline)" : "")
          );
        }
        return { status: pi.status };
      }),
    // Paid after-school registrations, so they are visible in the dashboard
    // (Enrolled Families) instead of only existing in Stripe + the DB.
    listRegistrations: publicProcedure.query(async () => getAfterschoolRegistrations()),
  }),

  // ─── Afterschool Roster (2026-08-04) ──────────────────────────────────────
  roster: router({
    list: publicProcedure.query(async () => getRosterStudents()),
    add: publicProcedure
      .input(z.object({
        schoolName: z.string().min(1).max(100),
        childName: z.string().min(1).max(255),
        grade: z.string().max(20).nullable().optional(),
        groupLabel: z.string().max(50).nullable().optional(),
        phone: z.string().max(30).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await addRosterStudent(input);
        return { id };
      }),
    update: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        schoolName: z.string().min(1).max(100).optional(),
        childName: z.string().min(1).max(255).optional(),
        grade: z.string().max(20).nullable().optional(),
        groupLabel: z.string().max(50).nullable().optional(),
        phone: z.string().max(30).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...params } = input;
        await updateRosterStudent(id, params);
        return { ok: true };
      }),
    remove: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await removeRosterStudent(input.id);
        return { ok: true };
      }),
    removeSchool: publicProcedure
      .input(z.object({ schoolName: z.string().min(1).max(100) }))
      .mutation(async ({ input }) => {
        await removeRosterSchool(input.schoolName);
        return { ok: true };
      }),
    getAttendance: publicProcedure
      .input(z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(async ({ input }) => getRosterAttendance(input.weekStart)),
    setAttendance: publicProcedure
      .input(z.object({
        rosterId: z.number().int().positive(),
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dayIdx: z.number().int().min(0).max(4),
        which: z.enum(['in', 'out']),
        checked: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        await upsertRosterAttendance(input.rosterId, input.weekStart, input.dayIdx, input.which, input.checked);
        return { ok: true };
      }),
  }),
  // ─── Invoices (2026-08-03) ────────────────────────────────────────────────
  // Per-customer invoice / paid-receipt generator. searchPayments pulls a
  // customer's TMA Stripe charges as line items; the dashboard lets staff edit
  // them and add payments made another way (ZenPlanner, cash) before generating
  // the branded PDF. NOTE: like the rest of the admin API this is a
  // publicProcedure gated only by the client password; the whole admin surface
  // should move to real server auth (tracked separately).
  invoices: router({
    searchPayments: publicProcedure
      .input(z.object({ query: z.string().min(2).max(120) }))
      .query(async ({ input }) => {
        const stripe = getStripe();
        const q = input.query.trim().toLowerCase();
        const gte = Math.floor(Date.now() / 1000) - 18 * 30 * 86400; // ~18 months
        const fmt = (created: number) =>
          new Date(created * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
        const desc = (c: any): string => {
          const md = c.metadata || {};
          if (md.selectedWeeks) return `Summer Camp - ${md.selectedWeeks}${md.programType ? ` (${md.programType})` : ""}`;
          if (md.product === "afterschool_registration") return `After School Registration${md.plan ? ` (${md.plan})` : ""}`;
          if (md.product === "3_week_99") return "3-Week Trial";
          if (md.product) return String(md.product).replace(/_/g, " ");
          return c.description || c.calculated_statement_descriptor || "Payment";
        };
        const names = new Map<string, number>();
        const emails = new Map<string, number>();
        const rows: { created: number; date: string; description: string; ref: string; amountCents: number }[] = [];
        let startingAfter: string | undefined;
        for (let page = 0; page < 6; page++) {
          const res = await stripe.charges.list({ limit: 100, created: { gte }, ...(startingAfter ? { starting_after: startingAfter } : {}) });
          for (const c of res.data) {
            if (c.status !== "succeeded" || c.refunded) continue;
            const md = (c.metadata || {}) as Record<string, string>;
            const name = c.billing_details?.name || md.camper1Name || md.studentName || md.parentName || "";
            const email = c.billing_details?.email || md.parentEmail || md.email || c.receipt_email || "";
            const hay = `${name} ${email} ${JSON.stringify(md)}`.toLowerCase();
            if (!hay.includes(q)) continue;
            if (name) names.set(name, (names.get(name) || 0) + 1);
            if (email) emails.set(email, (emails.get(email) || 0) + 1);
            rows.push({ created: c.created, date: fmt(c.created), description: desc(c), ref: "Card", amountCents: c.amount });
          }
          if (!res.has_more || res.data.length === 0) break;
          startingAfter = res.data[res.data.length - 1].id;
        }
        rows.sort((a, b) => a.created - b.created);
        const top = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
        return {
          items: rows.map(({ created, ...r }) => r),
          suggestedBillTo: top(names),
          suggestedEmail: top(emails),
        };
      }),
    generate: publicProcedure
      .input(z.object({
        billTo: z.string().min(1).max(200),
        subtitle: z.string().max(120).optional(),
        invoiceNo: z.string().max(60).optional(),
        invoiceDate: z.string().max(60).optional(),
        status: z.string().max(60).optional(),
        notes: z.array(z.string().max(120)).max(6).optional(),
        items: z.array(z.object({
          date: z.string().max(40),
          description: z.string().max(120),
          ref: z.string().max(40).optional(),
          amountCents: z.number().int(),
        })).min(1).max(60),
      }))
      .mutation(async ({ input }) => {
        const bytes = await buildInvoicePdf({
          billTo: input.billTo,
          subtitle: input.subtitle,
          invoiceNo: input.invoiceNo || `TMA-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`,
          invoiceDate: input.invoiceDate || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }),
          status: input.status,
          notes: input.notes,
          items: input.items,
        });
        return {
          base64: Buffer.from(bytes).toString("base64"),
          filename: `TMA-Invoice-${input.billTo.replace(/[^a-z0-9]+/gi, "-")}.pdf`,
        };
      }),
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
