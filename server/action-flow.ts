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
  setPendingActionStatus, updatePendingActionPayload, getMembership, getMembershipCharge, getStudentById, updateStudent,
  updateMembership, demoteBeltRank,
  type PendingActionRow,
} from "./db";
import { sendReviewedEmail } from "./integrations";
import {
  createMembership, changeMembership, setMembershipDiscount, pauseMembership,
  resumeMembership, cancelMembership, adjustCharge, describeMembershipOp,
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
// The ASSISTANT may only reduce/waive/cancel a single month's charge — never set it
// higher (that's an invented charge) and never mark it "paid" (that would falsify the
// ledger with no money moving). Staff keep the full set on the direct dashboard path.
const chargeAdjustSchema = z.object({ chargeId: z.number().int().positive(), amountCents: z.number().int().min(0).optional(), status: z.enum(["waived", "canceled"]).optional(), note: z.string().max(255).optional() });
const cardOpSchema = z.object({ membershipId: z.number().int().positive(), paymentMethodId: z.string().min(1).max(255), cardLabel: z.string().max(120).optional() });
const studentUpdateSchema = z.object({
  studentId: z.number().int().positive(),
  name: z.string().max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  dob: z.string().max(20).optional(),
  status: z.string().max(50).optional(),
  programs: z.string().max(255).optional(),
  emergencyContact: z.string().max(255).optional(),
});
const rec = (o: object) => o as Record<string, unknown>;

// Catalog guardrail: the ASSISTANT (this confirm-flow) may only set a membership
// to a real TMA plan price, so the model can't invent an off-catalog amount like
// "4.5 day/week / $450". Staff setting a custom rate directly in the dashboard go
// through memberships.change (NOT this flow), so they keep full flexibility.
const CATALOG_PRICES_CENTS: Record<string, number[]> = {
  taekwondo: [17900, 19900],   // 2 or 3 days/week
  kickboxing: [15900],
  bjj: [15900],
  afterschool: [40000, 50000], // 2-3 or 4-5 days/week
};
function assertCatalogPrice(program: string | undefined, cents: number | undefined): void {
  if (cents === undefined) return;
  const allowed = CATALOG_PRICES_CENTS[(program || "").trim().toLowerCase()];
  // Unknown program with a price = the model may have invented both the program AND
  // the price. Refuse and route to staff, rather than letting any label through.
  if (!allowed) throw new Error(`"${program || "(unknown)"}" isn't a standard TMA program, so I can't set a price for it automatically. A staff member can set a custom price directly in the dashboard.`);
  if (!allowed.includes(cents)) {
    const opts = allowed.map(c => `$${(c / 100).toFixed(0)}`).join(" or ");
    throw new Error(`$${(cents / 100).toFixed(0)}/mo is not a TMA ${program} plan price (valid: ${opts}). Use one of those, apply a discount for a reduced rate, or have a staff member set a custom price directly in the dashboard.`);
  }
}

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
      assertCatalogPrice(p.program, p.monthlyAmountCents);
      return { title: `New membership: ${p.studentName}`, preview: describeMembershipOp("membership_create", rec(p)) };
    },
    execute: async (payload) => {
      const p = membershipCreateSchema.parse(payload);
      const r = await createMembership(p);
      return { created: true, membershipId: r.id, _undo: { type: "membership_create_undo", membershipId: r.id } };
    },
  },

  membership_change: {
    prepare: async (payload) => {
      const p = membershipChangeSchema.parse(payload);
      const m = await getMembership(p.id);
      if (!m) throw new Error("Membership not found");
      assertCatalogPrice(p.program ?? m.program, p.monthlyAmountCents);
      return { title: `Change membership: ${m.studentName}`, preview: describeMembershipOp("membership_change", rec(p), m) };
    },
    execute: async (payload) => {
      const { id, ...changes } = membershipChangeSchema.parse(payload);
      const before = await getMembership(id);
      await changeMembership(id, changes);
      return { changed: true, id, _undo: before ? { type: "membership_change", id, program: before.program, planLabel: before.planLabel, monthlyAmountCents: before.monthlyAmountCents } : undefined };
    },
  },

  membership_discount: {
    prepare: async (payload) => {
      const p = membershipDiscountSchema.parse(payload);
      const m = await getMembership(p.id);
      if (!m) throw new Error("Membership not found");
      // A discount can't exceed the base tuition (that would zero out or invert it).
      if (p.discountCents > m.monthlyAmountCents) throw new Error(`A $${(p.discountCents / 100).toFixed(0)} discount is more than the $${(m.monthlyAmountCents / 100).toFixed(0)}/mo tuition. Use a smaller discount, or have staff set a custom rate in the dashboard.`);
      return { title: `Set discount: ${m.studentName}`, preview: describeMembershipOp("membership_discount", rec(p), m) };
    },
    execute: async (payload) => {
      const p = membershipDiscountSchema.parse(payload);
      const before = await getMembership(p.id);
      await setMembershipDiscount(p.id, p.discountCents, p.note ?? null);
      return { discountSet: true, id: p.id, _undo: before ? { type: "membership_discount", id: p.id, discountCents: before.discountCents, discountNote: before.discountNote } : undefined };
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
      return { paused: true, id: p.id, _undo: { type: "resume", id: p.id } };
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
      const before = await getMembership(p.id);
      await cancelMembership(p.id, { immediate: p.immediate });
      return { canceled: true, id: p.id, immediate: p.immediate, _undo: { type: "cancel_undo", id: p.id, status: before?.status ?? "active" } };
    },
  },

  charge_adjust: {
    prepare: async (payload) => {
      const p = chargeAdjustSchema.parse(payload);
      const c = await getMembershipCharge(p.chargeId);
      if (!c) throw new Error("Charge not found");
      // The assistant may only lower a month's charge, never raise it above what's
      // already scheduled (an invented, higher charge).
      if (p.amountCents !== undefined && p.amountCents > c.amountCents) throw new Error(`$${(p.amountCents / 100).toFixed(0)} is higher than this month's $${(c.amountCents / 100).toFixed(0)} charge. The assistant can only lower or waive a charge; staff can raise it in the dashboard.`);
      const m = await getMembership(c.membershipId);
      return { title: `Adjust ${m?.studentName ?? "member"}'s ${c.periodMonth} charge`, preview: describeMembershipOp("charge_adjust", rec(p), m) };
    },
    execute: async (payload) => {
      const { chargeId, ...changes } = chargeAdjustSchema.parse(payload);
      const before = await getMembershipCharge(chargeId);
      await adjustCharge(chargeId, changes, "assistant (confirmed)");
      return { adjusted: true, chargeId, _undo: before ? { type: "charge_adjust", chargeId, amountCents: before.amountCents, status: before.status, note: before.note } : undefined };
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

  belt_promote: {
    prepare: async (payload) => {
      const p = z.object({ studentId: z.number().int().positive(), note: z.string().max(255).optional() }).parse(payload);
      const { getBeltStatus } = await import("./db");
      const st = await getBeltStatus(p.studentId);
      if (!st) throw new Error("Student not found");
      if (!st.nextRank) throw new Error(`${st.name} is already at the highest rank.`);
      return { title: `Promote ${st.name} to ${st.nextRank}`, preview: `${st.currentRank} to ${st.nextRank}. Classes since last promotion: ${st.classesSince}${st.threshold ? ` of ${st.threshold.classes}` : ""}.${st.ready ? "" : " Not currently marked ready to test."}` };
    },
    execute: async (payload) => {
      const p = z.object({ studentId: z.number().int().positive(), note: z.string().max(255).optional() }).parse(payload);
      const { promoteBeltRank } = await import("./db");
      await promoteBeltRank(p.studentId, { note: p.note, by: "assistant (confirmed)" });
      return { promoted: true, studentId: p.studentId, _undo: { type: "belt_undo", studentId: p.studentId } };
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
 *  executed action returns its prior result rather than running it again.
 *  `override` lets staff EDIT the proposed values before approving: the edited fields
 *  are merged onto the stored payload and RE-VALIDATED through the same prepare()
 *  guardrails, so an edit can't slip past the catalog/bounds checks. */
export async function confirmAction(id: number, confirmedBy: string | null, override?: Record<string, unknown>): Promise<{ status: string; result: Record<string, unknown> | null }> {
  const row = await getPendingAction(id);
  if (!row) throw new Error("Action not found");

  if (row.status === "executed") return { status: "executed", result: safeJson(row.result) };
  if (row.status === "executing") throw new Error("Action is already being processed");
  if (row.status !== "proposed") throw new Error(`Action is ${row.status}, cannot confirm`);
  if (isExpired(row)) { await setPendingActionStatus(id, "expired", confirmedBy); throw new Error("Action expired; propose it again"); }

  const handler = HANDLERS[row.actionType];
  if (!handler) { await setPendingActionStatus(id, "failed", confirmedBy); throw new Error("Unknown action type"); }

  // Apply + re-validate an edit BEFORE claiming, so an invalid edit doesn't leave the
  // row stuck in 'executing'. The merged payload runs through the same guardrails.
  let payload: unknown = JSON.parse(row.payload);
  if (override && Object.keys(override).length) {
    payload = { ...(payload as Record<string, unknown>), ...override };
    const { title, preview } = await handler.prepare(payload); // throws on an invalid edit
    await updatePendingActionPayload(id, JSON.stringify(payload), title, preview);
  }

  // Atomic claim: only one caller flips proposed->executing, so it never runs twice.
  const won = await claimPendingAction(id);
  if (!won) {
    const fresh = await getPendingAction(id);
    if (fresh?.status === "executed") return { status: "executed", result: safeJson(fresh.result) };
    throw new Error("Action was already taken");
  }

  try {
    const result = await handler.execute(payload);
    await finishPendingAction(id, { status: "executed", result: JSON.stringify(result), confirmedBy });
    return { status: "executed", result };
  } catch (e) {
    await finishPendingAction(id, { status: "failed", result: JSON.stringify({ error: (e as Error).message }), confirmedBy });
    throw e;
  }
}

/** Reverse an executed action, using the before-state captured in its result (_undo).
 *  Only within 24h, and only for action types that captured a reversible snapshot. */
export async function undoAction(id: number, by: string | null): Promise<{ ok: true }> {
  const row = await getPendingAction(id);
  if (!row) throw new Error("Action not found");
  if (row.status === "reversed") throw new Error("This action was already undone.");
  if (row.status !== "executed") throw new Error("Only an applied action can be undone.");
  const executedAt = row.executedAt ? new Date(row.executedAt).getTime() : 0;
  if (executedAt && Date.now() - executedAt > EXPIRY_MS) throw new Error("Too long ago to undo automatically; reverse it in the dashboard.");
  const undo = (safeJson(row.result)?._undo ?? null) as null | Record<string, unknown>;
  if (!undo) throw new Error("This action can't be undone automatically. Reverse it in the dashboard.");
  const u = undo as { type: string; id?: number; membershipId?: number; studentId?: number; chargeId?: number; program?: string; planLabel?: string | null; monthlyAmountCents?: number; discountCents?: number; discountNote?: string | null; amountCents?: number; status?: string; note?: string | null };
  switch (u.type) {
    case "membership_change": await changeMembership(u.id!, { program: u.program, planLabel: u.planLabel, monthlyAmountCents: u.monthlyAmountCents }); break;
    case "membership_discount": await setMembershipDiscount(u.id!, u.discountCents ?? 0, u.discountNote ?? null); break;
    case "charge_adjust": await adjustCharge(u.chargeId!, { amountCents: u.amountCents, status: u.status as "scheduled" | "waived" | "canceled" | "paid" | undefined, note: `undo: ${u.note ?? "restored"}` }, by); break;
    case "resume": await resumeMembership(u.id!); break;
    case "cancel_undo": await updateMembership(u.id!, { status: "active", cancelEffectiveDate: null, canceledAt: null }); break;
    case "membership_create_undo": await cancelMembership(u.membershipId!, { immediate: true }); break;
    case "belt_undo": await demoteBeltRank(u.studentId!); break;
    default: throw new Error("This action can't be undone automatically.");
  }
  await setPendingActionStatus(id, "reversed", by);
  return { ok: true };
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
