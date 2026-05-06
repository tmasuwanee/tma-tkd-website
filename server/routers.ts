import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { createLead, createCampRegistration, updateCampRegistrationPayment, getCampRegistrationById, getCampRegistrationByPaymentIntentId, getAllCampRegistrations, softDeleteRegistration, restoreRegistration } from "./db";
import { sendToGoogleSheets, sendToSlack, sendEmailNotification, sendCampRegistrationConfirmation } from "./integrations";
import Stripe from "stripe";
import { ENV } from "./_core/env";

function getStripe() {
  return new Stripe(ENV.tmaStripeSecretKey);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  camp: router({
    // Create a payment intent and save registration
    createRegistration: publicProcedure
      .input(z.object({
        // Camper 1
        camper1Name: z.string().min(1),
        camper1Dob: z.string().min(1),
        camper1Age: z.string().min(1),
        camper1Sex: z.string().min(1),
        // Camper 2 (optional)
        camper2Name: z.string().optional(),
        camper2Dob: z.string().optional(),
        camper2Age: z.string().optional(),
        camper2Sex: z.string().optional(),
        // Camper 3 (optional)
        camper3Name: z.string().optional(),
        camper3Dob: z.string().optional(),
        camper3Age: z.string().optional(),
        camper3Sex: z.string().optional(),
        // Parent info
        parentFirstName: z.string().min(1),
        parentLastName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().min(1),
        address: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(1),
        zip: z.string().min(1),
        howDidYouHear: z.string().optional(),
        // Program
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

        // Create Stripe PaymentIntent
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

        // Save registration to DB
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

    // Confirm payment after Stripe processes it
    confirmPayment: publicProcedure
      .input(z.object({
        paymentIntentId: z.string(),
      }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);
        await updateCampRegistrationPayment(
          input.paymentIntentId,
          paymentIntent.status
        );

        // Send confirmation email to parent if payment succeeded
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

  leads: router({
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
      }))
      .mutation(async ({ input }) => {
        try {
          const lead = await createLead({
            parentName: input.parentName,
            kidName: input.kidName,
            kidAge: input.kidAge,
            programInterest: input.programInterest,
            motivation: input.motivation,
            email: input.email,
            phone: input.phone,
            additionalNotes: input.additionalNotes,
          });

          // Send to integrations
          const createdLead = {
            id: 0,
            parentName: input.parentName,
            kidName: input.kidName,
            kidAge: input.kidAge,
            programInterest: input.programInterest,
            motivation: input.motivation ?? null,
            email: input.email,
            phone: input.phone,
            additionalNotes: input.additionalNotes ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Send to all integrations in parallel
          await Promise.all([
            sendToGoogleSheets(createdLead),
            sendToSlack(createdLead),
            sendEmailNotification(createdLead),
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
  }),
});

export type AppRouter = typeof appRouter;

