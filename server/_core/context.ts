import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { adminEmailFromRequest } from "../admin-auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  // TMA admin session (Phase 1). Populated from the signed tma_admin cookie,
  // independent of the platform OAuth `user`. tmaAdminProcedure gates on isAdmin.
  isAdmin: boolean;
  adminEmail: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const adminEmail = adminEmailFromRequest(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
    isAdmin: !!adminEmail,
    adminEmail,
  };
}
