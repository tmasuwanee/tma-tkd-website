/**
 * Write-action confirm-flow — 2026-08-11
 *
 * A small, auditable state machine for side-effecting actions (e.g. an email the
 * assistant drafts). The lifecycle:
 *
 *   propose  ->  (stored, does NOTHING)  ->  human previews  ->  confirm  ->  execute once
 *                                                             \->  reject
 *
 * Nothing runs on propose. A proposed action executes only when a human confirms
 * it, exactly once (an atomic DB claim prevents double-execution), and the
 * outcome is recorded on the row. Handlers are registered per action type; adding
 * a new capability = adding a handler, not new plumbing.
 *
 * This is the safety layer the AI assistant's write capabilities ride on: the
 * model may PROPOSE, but only a person can CONFIRM.
 */
import { z } from "zod";
import {
  insertPendingAction, getPendingAction, claimPendingAction, finishPendingAction,
  setPendingActionStatus, getMembership, getMembershipCharge, getStudentById, updateStudent,
  type PendingActionRow,
} from "./db";
import { sendReviewedEmail } from "./integrations";
import {
  createMembership, changeMembership, setMembershipDiscount, pauseMembership,
  cancelMembership, adjustCharge, describeMembershipOp,
} from "./membership-ops";
import { setPayerPrimaryCard, detachPayerCard } from "./membership-billing";

const EXPIRY_MS = 24 * 60 * 60 * 1000;

type ActionHandler = {
  /** Validate the payload and build a human-readable title + preview. Throw to reject. */
  prepare: (payload: unknown) => Promise<{ title: string; preview: string }>;
  /** Perform the side effect. Returns a result object recorded on the action. */
  execute: (payload: unknown) => Promise<Record<string, unknown>>;
};

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Handler registry ────────────────────────────────────────────────────────
const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(255),
  html: z.string().min(1).max(20000),
});

const membershipCreateSchema = z.object({
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
});
const membershipChangeSchema = z.object({ id: z.number().int().positive(), program: z.string().max(40).optional(), planLabel: z.string().max(80).optional(), monthlyAmountCents: z.number().int().min(0).optional(), prorate: z.boolean().optional() });
const membershipDiscountSchema = z.object({ id: z.number().int().positive(), discountCents: z.number().int().min(0), note: z.string().max(255).optional() });
const membershipIdSchema = z.object({ id: z.number().int().positive() });
const membershipCancelSchema = z.object({ id: z.number().int().positive(), immediate: z.boolean() });
const chargeAdjustSchema = z.object({ chargeId: z.number().int().positive(), amountCents: z.number().int().min(0).optional(), status: z.enum(["scheduled", "waived", "canceled", "paid"]).optional(), note: z.string().max(255).optional() });
const cardOpSchema = z.object({ membershipId: z.number().int().positive(), paymentMethodId: z.string().min(1).max(255), cardLabel: z.string().max(120).optional() });
const studentUpdateSchema = z.object({
  studentId: z.number().int().positive(),
  name: z.string().max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  dob: z.string().max(20).optional(),
  beltRank: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  programs: z.string().max(255).optional(),
  emergencyContact: z.string().max(255).optional(),
});
const rec = (o: object) => o as Record<string, unknown>;

const HANDLERS: Record<string, ActionHandler> = {
  send_email: {
    prepare: async (payload) => {
      const p = emailSchema.parse(payload);
      const body = stripHtml(p.html);
      return {
        title: `Email ${p.to}: ${p.subject}`,
        preview: `To: ${p.to}\nSubject: ${p.subject}\n\n${body.slice(0, 800)}${body.length > 800 ? "..." : ""}`,
      };
    },
    execute: async (payload) => {
      const p = emailSchema.parse(payload);
      await sendReviewedEmail(p.to, p.subject, p.html);
      return { sent: true, to: p.to, subject: p.subject };
    },
  },

  membership_create: {
    prepare: async (payload) => {
      const p = membershipCreateSchema.parse(payload);
      return { title: `New membership: ${p.studentName}`, preview: describeMembershipOp("membership_create", rec(p)) };
    },
    execute: async (payload) => {
      const p = membershipCreateSchema.parse(payload);
      const r = await createMembership(p);
      return { created: true, membershipId: r.id };
    },
  },

  membership_change: {
    prepare: async (payload) => {
      const p = membershipChangeSchema.parse(payload);
      const m = await getMembership(p.id);
      if (!m) throw new Error("Membership not found");
      return { title: `Change membership: ${m.studentName}`, preview: describeMembershipOp("membership_change", rec(p), m) };
    },
    execute: async (payload) => {
      const { id, ...changes } = membershipChangeSchema.parse(payload);
      await changeMembership(id, changes);
      return { changed: true, id };
    },
  },

  membership_discount: {
    prepare: async (payload) => {
      const p = membershipDiscountSchema.parse(payload);
      const m = await getMembership(p.id);
      if (!m) throw new Error("Membership not found");
      return { title: `Set discount: ${m.studentName}`, preview: describeMembershipOp("membership_discount", rec(p), m) };
    },
    execute: async (payload) => {
      const p = membershipDiscountSchema.parse(payload);
      await setMembershipDiscount(p.id, p.discountCents, p.note ?? null);
      return { discountSet: true, id: p.id };
    },
  },

  membership_pause: {
    prepare: async (payload) => {
      const p = membershipIdSchema.parse(payload);
      const m = await getMembership(p.id);
      if (!m) throw new Error("Membership not found");
      return { title: `Pause membership: ${m.studentName}`, preview: describeMembershipOp("membership_pause", rec(p), m) };
    },
    execute: async (payload) => {
      const p = membershipIdSchema.parse(payload);
      await pauseMembership(p.id);
      return { paused: true, id: p.id };
    },
  },

  membership_cancel: {
    prepare: async (payload) => {
      const p = membershipCancelSchema.parse(payload);
      const m = await getMembership(p.id);
      if (!m) throw new Error("Membership not found");
      return { title: `Cancel membership: ${m.studentName}`, preview: describeMembershipOp("membership_cancel", rec(p), m) };
    },
    execute: async (payload) => {
      const p = membershipCancelSchema.parse(payload);
      await cancelMembership(p.id, { immediate: p.immediate });
      return { canceled: true, id: p.id, immediate: p.immediate };
    },
  },

  charge_adjust: {
    prepare: async (payload) => {
      const p = chargeAdjustSchema.parse(payload);
      const c = await getMembershipCharge(p.chargeId);
      if (!c) throw new Error("Charge not found");
      const m = await getMembership(c.membershipId);
      return { title: `Adjust ${m?.studentName ?? "member"}'s ${c.periodMonth} charge`, preview: describeMembershipOp("charge_adjust", rec(p), m) };
    },
    execute: async (payload) => {
      const { chargeId, ...changes } = chargeAdjustSchema.parse(payload);
      await adjustCharge(chargeId, changes, "assistant (confirmed)");
      return { adjusted: true, chargeId };
    },
  },

  card_make_primary: {
    prepare: async (payload) => {
      const p = cardOpSchema.parse(payload);
      const m = await getMembership(p.membershipId);
      if (!m) throw new Error("Membership not found");
      return { title: `Make ${p.cardLabel ?? "card"} primary: ${m.studentName}`, preview: `${m.studentName}'s family will be charged on ${p.cardLabel ?? "the selected card"} from now on.` };
    },
    execute: async (payload) => {
      const p = cardOpSchema.parse(payload);
      const m = await getMembership(p.membershipId);
      if (!m?.payerId) throw new Error("No family payer on this membership.");
      await setPayerPrimaryCard(m.payerId, p.paymentMethodId);
      return { primarySet: true, membershipId: p.membershipId };
    },
  },

  card_remove: {
    prepare: async (payload) => {
      const p = cardOpSchema.parse(payload);
      const m = await getMembership(p.membershipId);
      if (!m) throw new Error("Membership not found");
      return { title: `Remove ${p.cardLabel ?? "card"}: ${m.studentName}`, preview: `Detach ${p.cardLabel ?? "this card"} from ${m.studentName}'s family. If it was the only card, autopay stops until a new one is added.` };
    },
    execute: async (payload) => {
      const p = cardOpSchema.parse(payload);
      const m = await getMembership(p.membershipId);
      if (!m?.payerId) throw new Error("No family payer on this membership.");
      await detachPayerCard(m.payerId, p.paymentMethodId);
      return { removed: true, membershipId: p.membershipId };
    },
  },

  student_update: {
    prepare: async (payload) => {
      const p = studentUpdateSchema.parse(payload);
      const s = await getStudentById(p.studentId);
      if (!s) throw new Error("Student not found");
      const { studentId: _sid, ...patch } = p;
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      if (entries.length === 0) throw new Error("No fields to change.");
      const before = s as unknown as Record<string, unknown>;
      const preview = entries.map(([k, v]) => `${k}: ${before[k] ?? "—"} → ${v}`).join("\n");
      return { title: `Update ${s.name}'s file`, preview };
    },
    execute: async (payload) => {
      const { studentId, ...patch } = studentUpdateSchema.parse(payload);
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      await updateStudent(studentId, clean);
      return { updated: true, studentId };
    },
  },
};

export function isKnownAction(type: string): boolean {
  return type in HANDLERS;
}

// ─── State transitions ───────────────────────────────────────────────────────

/** Propose an action. Validates + builds a preview, stores it as 'proposed'. Runs
 *  NO side effect. Returns the id + the human preview to show for confirmation. */
export async function proposeAction(actionType: string, payload: unknown, proposedBy: string | null): Promise<{ id: number; title: string; preview: string }> {
  const handler = HANDLERS[actionType];
  if (!handler) throw new Error(`Unknown action type: ${actionType}`);
  const { title, preview } = await handler.prepare(payload);
  const id = await insertPendingAction({
    actionType, title, preview, payload: JSON.stringify(payload),
    proposedBy, expiresAt: new Date(Date.now() + EXPIRY_MS),
  });
  return { id, title, preview };
}

/** Confirm + execute an action, exactly once. Idempotent: re-confirming an already
 *  executed action returns its prior result rather than running it again. */
export async function confirmAction(id: number, confirmedBy: string | null): Promise<{ status: string; result: Record<string, unknown> | null }> {
  const row = await getPendingAction(id);
  if (!row) throw new Error("Action not found");

  if (row.status === "executed") return { status: "executed", result: safeJson(row.result) };
  if (row.status === "executing") throw new Error("Action is already being processed");
  if (row.status !== "proposed") throw new Error(`Action is ${row.status}, cannot confirm`);
  if (isExpired(row)) { await setPendingActionStatus(id, "expired", confirmedBy); throw new Error("Action expired; propose it again"); }

  // Atomic claim: only one caller flips proposed->executing, so it never runs twice.
  const won = await claimPendingAction(id);
  if (!won) {
    const fresh = await getPendingAction(id);
    if (fresh?.status === "executed") return { status: "executed", result: safeJson(fresh.result) };
    throw new Error("Action was already taken");
  }

  const handler = HANDLERS[row.actionType];
  if (!handler) { await finishPendingAction(id, { status: "failed", result: JSON.stringify({ error: "unknown action type" }), confirmedBy }); throw new Error("Unknown action type"); }

  try {
    const result = await handler.execute(JSON.parse(row.payload));
    await finishPendingAction(id, { status: "executed", result: JSON.stringify(result), confirmedBy });
    return { status: "executed", result };
  } catch (e) {
    await finishPendingAction(id, { status: "failed", result: JSON.stringify({ error: (e as Error).message }), confirmedBy });
    throw e;
  }
}

export async function rejectAction(id: number, by: string | null): Promise<void> {
  const row = await getPendingAction(id);
  if (!row) throw new Error("Action not found");
  if (row.status !== "proposed") throw new Error(`Action is ${row.status}, cannot reject`);
  await setPendingActionStatus(id, "rejected", by);
}

function isExpired(row: PendingActionRow): boolean {
  if (!row.expiresAt) return false;
  return new Date(row.expiresAt).getTime() < Date.now();
}
function safeJson(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
