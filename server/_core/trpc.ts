import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// ─── Default-deny admin gate (Phase 1 auth) ─────────────────────────────────
// Every appRouter procedure uses publicProcedure, so we gate at the base: when
// ENV.adminAuthEnforce is on, a procedure whose path is NOT in PUBLIC_PATHS
// requires the admin session (ctx.isAdmin). Fail-closed: new procedures are
// admin-by-default. PUBLIC_PATHS is the AUDITED allowlist of parent-facing +
// automation + session procedures (derived by grepping which tRPC procedures the
// public pages call, plus the known automation callers). See docs/ADMIN_AUTH_PLAN.md.
// Kill-switched: enforce off = no gating, so deploying this changes nothing.
const PUBLIC_PATHS = new Set<string>([
  // session / system
  "system.health", "auth.me", "auth.logout",
  // parent-facing (public site pages call these)
  "leads.submit", "leads.bookManual",
  "afterschool.submitIntake", "afterschool.createIntent", "afterschool.confirm",
  "afterschoolWaiver.submit",
  "students.getAll",                       // the public /attendance kiosk reads this
  "attendance.checkIn", "attendance.countSincePromotion", "attendance.setCount",
  "backToSchool.createIntent", "backToSchool.confirm",
  "camp.createRegistration", "camp.confirmPayment", "camp.submitWaiver",
  "christmas.createIntent", "christmas.confirm",
  "fieldTrip.createIntent", "fieldTrip.confirm",
  "supplyFee.createIntent", "supplyFee.confirm",
  "transportation.submit",
  "waiver.submit",
  // background automation (n8n dispatcher, FB sync, Gmail poller) — these callers
  // have no admin cookie. Tighten later with a machine-secret (see the doc).
  "leads.upsertFromFacebook", "leads.logActivity",
  "sequence.listByLead", "sequence.scheduleTouch", "sequence.skipTouch",
  "sequence.cancelTouch", "sequence.cancelBySequence", "sequence.overrideTouch",
  "sequence.triggerNow", "sequence.due", "sequence.markProcessing",
  "sequence.markSent", "sequence.markSkipped", "sequence.markFailed",
  "sequence.hasBeenSent", "sequence.enqueueSequence",
  "dispatcher.preSendCheck", "dispatcher.fetchAndRender", "dispatcher.confirmSent",
  "lifecycle.transition", "lifecycle.history", "lifecycle.checkLegal",
  "audit.log",
  "inbound.emailReply",
  "calls.generateToday",
  "rules.route",
  // site chat widget (if mounted on public pages)
  "chat.loadMessages", "chat.sendMessage",
]);

const adminGate = t.middleware(async ({ ctx, path, next }) => {
  if (ENV.adminAuthEnforce && !ctx.isAdmin && !PUBLIC_PATHS.has(path)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next();
});

export const publicProcedure = t.procedure.use(adminGate);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
