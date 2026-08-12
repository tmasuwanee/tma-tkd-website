/**
 * Server-side admin session (Phase 1 auth) - 2026-08-11
 *
 * The admin dashboard historically authenticated ONLY in the browser (a password
 * checked in client JS), leaving the admin tRPC API callable by anyone who found
 * the URL. This adds a real server session: a signed, httpOnly cookie set on
 * password login or Telegram magic-key, verified server-side.
 *
 * Rollout is kill-switched by ENV.adminAuthEnforce (ADMIN_AUTH_ENFORCE=true).
 * Until enabled, gated procedures behave exactly like public ones (no lockout
 * risk on deploy); the cookie is still issued so login works before enforcement
 * is turned on. See docs/ADMIN_AUTH_PLAN.md.
 */
import crypto from "crypto";
import type { Request } from "express";
import { parse as parseCookie } from "cookie";
import { ENV } from "./_core/env";

export const ADMIN_COOKIE = "tma_admin";
export const ADMIN_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Shared-login allow-list (mirrors the client's ADMIN_ALLOWED_EMAILS). Kept here
// so the server, not the browser bundle, is the source of truth.
export const ADMIN_EMAILS = ["tmasuwanee@gmail.com", "coacharfasc@gmail.com"];

function secret(): string {
  // JWT_SECRET is already set for the platform session. Fall back to a constant
  // only in dev so local runs work; in production JWT_SECRET is always present.
  return ENV.cookieSecret || "tma-admin-dev-only-not-secret";
}

/** Sign a `<email>|<expiry>` payload with HMAC-SHA256. */
export function signAdminToken(email: string): string {
  const exp = Date.now() + ADMIN_COOKIE_MAX_AGE_MS;
  const payload = `${email.toLowerCase()}|${exp}`;
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

/** Verify a token; returns the admin email if valid + unexpired, else null. */
export function verifyAdminToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret()).update(b64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const [email, expStr] = Buffer.from(b64, "base64url").toString("utf8").split("|");
  if (!email || !expStr) return null;
  if (Date.now() > Number(expStr)) return null;
  return ADMIN_EMAILS.includes(email) ? email : null;
}

/** Read + verify the admin session cookie off a request. */
export function adminEmailFromRequest(req: Request): string | null {
  try {
    const cookies = parseCookie(req.headers.cookie ?? "");
    return verifyAdminToken(cookies[ADMIN_COOKIE]);
  } catch {
    return null;
  }
}
