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
  setPendingActionStatus, type PendingActionRow,
} from "./db";
import { sendReviewedEmail } from "./integrations";

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
