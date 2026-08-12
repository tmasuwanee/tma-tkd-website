import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

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

// TMA dashboard admin gate (Phase 1). Gates on the signed tma_admin session
// cookie (ctx.isAdmin), NOT the platform OAuth user. Kill-switched: until
// ENV.adminAuthEnforce (ADMIN_AUTH_ENFORCE=true), it behaves exactly like a
// public procedure, so converting a procedure to this and deploying is a no-op
// with zero lockout risk. Turn enforcement on only after verifying login sets
// the cookie on a preview. See docs/ADMIN_AUTH_PLAN.md.
export const tmaAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (ENV.adminAuthEnforce && !ctx.isAdmin) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    return next();
  }),
);
