/**
 * Membership operations — 2026-08-12
 *
 * The actual side-effecting operations on memberships + their monthly charges.
 * These are the single source of truth for "what happens" and are called TWO ways:
 *   - directly by the dashboard (staff clicks a button + an inline confirm), and
 *   - by the assistant via the confirm-flow (propose -> a human confirms).
 * So the same rules apply whether a person or the AI initiates it.
 *
 * Notifications: meaningful events (enroll / change / pause / cancel) ping staff
 * on Telegram. Per-month charge edits are audited on the charge row (adjustedBy +
 * note), not Telegram, to avoid noise. See docs/OPERATIONS_SOPS.md.
 */
import {
  insertMembership, getMembership, updateMembership, upsertMembershipCharge,
  listMembershipCharges, getMembershipCharge, updateMembershipCharge,
  type MembershipRow,
} from "./db";
import { sendTelegramMessage } from "./telegram";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** YYYY-MM for `count` months starting from `from` (default this month). */
function monthKeys(count: number, from?: Date): string[] {
  const base = from ? new Date(from.getFullYear(), from.getMonth(), 1) : new Date();
  base.setDate(1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Create/refresh the next `months` scheduled charges for a membership at its
 *  current net monthly amount. Idempotent per month (won't overwrite an existing
 *  month's edited amount). */
export async function generateCharges(membershipId: number, months = 12): Promise<void> {
  const m = await getMembership(membershipId);
  if (!m) return;
  const net = Math.max(0, m.monthlyAmountCents - (m.discountCents || 0));
  const start = m.startDate ? new Date(String(m.startDate)) : new Date();
  const day = m.billingDay && m.billingDay >= 1 && m.billingDay <= 28 ? m.billingDay : 1;
  for (const period of monthKeys(months, start)) {
    const [y, mo] = period.split("-").map(Number);
    const due = `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    await upsertMembershipCharge({ membershipId, periodMonth: period, dueDate: due, baseAmountCents: net, amountCents: net });
  }
}

// ─── Operations ──────────────────────────────────────────────────────────────

export async function createMembership(input: {
  studentName: string; parentName?: string | null; email?: string | null; phone?: string | null;
  leadId?: number | null; program: string; planLabel?: string | null; monthlyAmountCents: number;
  discountCents?: number; discountNote?: string | null; startDate?: string | null;
  termMonths?: number | null; billingDay?: number | null; contractNote?: string | null;
  afterschoolRegId?: number | null;
}): Promise<{ id: number }> {
  const id = await insertMembership({ ...input, status: "active" });
  await generateCharges(id, input.termMonths ?? 12);
  void sendTelegramMessage(
    `🥋 <b>New membership</b>\n${input.studentName} · ${input.program}${input.planLabel ? ` (${input.planLabel})` : ""}\n${dollars(input.monthlyAmountCents)}/mo${input.discountCents ? ` (-${dollars(input.discountCents)} discount)` : ""}`
  ).catch(() => {});
  return { id };
}

export async function changeMembership(id: number, changes: {
  program?: string; planLabel?: string | null; monthlyAmountCents?: number; prorate?: boolean;
}): Promise<void> {
  const before = await getMembership(id);
  if (!before) throw new Error("Membership not found");
  await updateMembership(id, {
    program: changes.program, planLabel: changes.planLabel, monthlyAmountCents: changes.monthlyAmountCents,
  });
  // Re-price FUTURE scheduled charges to the new net amount (this + later months).
  // Default: change takes effect next cycle (no proration). If prorate is set, the
  // current month is left for a staff/Stripe proration step; we note it.
  const after = await getMembership(id);
  if (after && changes.monthlyAmountCents !== undefined) {
    const net = Math.max(0, after.monthlyAmountCents - (after.discountCents || 0));
    const thisMonth = monthKeys(1)[0];
    for (const c of await listMembershipCharges(id)) {
      if (c.status !== "scheduled") continue;
      if (c.periodMonth < thisMonth) continue;
      if (c.periodMonth === thisMonth && !changes.prorate) continue; // change hits next cycle
      await updateMembershipCharge(c.id, { amountCents: net, note: changes.prorate ? "re-priced (prorate requested)" : "re-priced (next cycle)" });
    }
  }
  void sendTelegramMessage(
    `🔁 <b>Membership changed</b>\n${before.studentName}\n${before.program}${before.planLabel ? ` (${before.planLabel})` : ""} → ${changes.program ?? before.program}${(changes.planLabel ?? before.planLabel) ? ` (${changes.planLabel ?? before.planLabel})` : ""}` +
    (changes.monthlyAmountCents !== undefined ? `\n${dollars(before.monthlyAmountCents)} → ${dollars(changes.monthlyAmountCents)}/mo${changes.prorate ? " (prorate requested)" : ""}` : "")
  ).catch(() => {});
}

export async function setMembershipDiscount(id: number, discountCents: number, note: string | null): Promise<void> {
  const m = await getMembership(id);
  if (!m) throw new Error("Membership not found");
  await updateMembership(id, { discountCents, discountNote: note });
  const net = Math.max(0, m.monthlyAmountCents - discountCents);
  const thisMonth = monthKeys(1)[0];
  for (const c of await listMembershipCharges(id)) {
    if (c.status === "scheduled" && c.periodMonth >= thisMonth) {
      await updateMembershipCharge(c.id, { amountCents: net, note: note || "discount applied" });
    }
  }
  void sendTelegramMessage(`🏷️ <b>Discount set</b>\n${m.studentName}: -${dollars(discountCents)}/mo${note ? ` (${note})` : ""}`).catch(() => {});
}

export async function pauseMembership(id: number): Promise<void> {
  const m = await getMembership(id);
  if (!m) throw new Error("Membership not found");
  await updateMembership(id, { status: "paused" });
  void sendTelegramMessage(`⏸️ <b>Membership paused</b>\n${m.studentName} · ${m.program}`).catch(() => {});
}

export async function resumeMembership(id: number): Promise<void> {
  const m = await getMembership(id);
  if (!m) throw new Error("Membership not found");
  await updateMembership(id, { status: "active" });
  void sendTelegramMessage(`▶️ <b>Membership resumed</b>\n${m.studentName} · ${m.program}`).catch(() => {});
}

/** Cancel. immediate=true ends it now; otherwise sets the 60-day-notice effective
 *  date (they can attend until then). */
export async function cancelMembership(id: number, opts: { immediate: boolean }): Promise<void> {
  const m = await getMembership(id);
  if (!m) throw new Error("Membership not found");
  if (opts.immediate) {
    await updateMembership(id, { status: "canceled", canceledAt: new Date().toISOString().slice(0, 19).replace("T", " ") });
    void sendTelegramMessage(`🚫 <b>Membership canceled (immediate)</b>\n${m.studentName} · ${m.program}`).catch(() => {});
  } else {
    const eff = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    await updateMembership(id, { cancelEffectiveDate: eff });
    void sendTelegramMessage(`🚫 <b>Cancellation scheduled</b>\n${m.studentName} · ${m.program}\n60-day notice, effective ${eff} (can attend until then)`).catch(() => {});
  }
}

/** Edit a single month's charge: change the amount, waive (0), or cancel it. */
export async function adjustCharge(chargeId: number, changes: { amountCents?: number; status?: "scheduled" | "waived" | "canceled" | "paid"; note?: string | null }, by: string | null): Promise<void> {
  const c = await getMembershipCharge(chargeId);
  if (!c) throw new Error("Charge not found");
  const patch: { amountCents?: number; status?: string; note?: string | null; adjustedBy?: string | null } = { adjustedBy: by };
  if (changes.amountCents !== undefined) patch.amountCents = Math.max(0, changes.amountCents);
  if (changes.status !== undefined) patch.status = changes.status;
  if (changes.note !== undefined) patch.note = changes.note;
  await updateMembershipCharge(chargeId, patch);
}

/** Human-readable preview for the confirm-flow, given an op + payload. */
export function describeMembershipOp(op: string, payload: Record<string, unknown>, m?: MembershipRow | null): string {
  const who = m ? `${m.studentName} (${m.program})` : `membership #${payload.id ?? "?"}`;
  switch (op) {
    case "membership_create": return `Create membership: ${payload.studentName} · ${payload.program} · ${dollars(Number(payload.monthlyAmountCents) || 0)}/mo`;
    case "membership_change": return `Change ${who}${payload.monthlyAmountCents !== undefined ? ` to ${dollars(Number(payload.monthlyAmountCents))}/mo` : ""}${payload.prorate ? " (prorate)" : ""}`;
    case "membership_discount": return `Set discount on ${who}: -${dollars(Number(payload.discountCents) || 0)}/mo`;
    case "membership_pause": return `Pause ${who}`;
    case "membership_cancel": return `Cancel ${who} ${payload.immediate ? "(immediately)" : "(60-day notice)"}`;
    case "charge_adjust": return `Adjust a monthly charge${payload.amountCents !== undefined ? ` to ${dollars(Number(payload.amountCents))}` : ""}${payload.status ? ` (${payload.status})` : ""}`;
    default: return `Membership action: ${op}`;
  }
}
