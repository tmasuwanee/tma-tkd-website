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
  listMembershipCharges, getMembershipCharge, updateMembershipCharge, listMemberships,
  type MembershipRow,
} from "./db";
import { sendTelegramMessage } from "./telegram";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** YYYY-MM for `count` months starting from `from` (default this month). Used by
 *  the re-price / discount loops to find "this month" and forward. */
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

/** Parse a stored YYYY-MM-DD (date-only) string into a local Date, avoiding
 *  `new Date(str)`'s UTC-midnight parse + local-getter month/day shift near
 *  timezone boundaries. */
function parseDateOnly(s: string): Date {
  const [y, mo, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1);
}

const dueStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The anchor Date for a membership's FIRST scheduled charge, given its start date,
 *  billing day, and paid-through date. Shared by generateCharges and the import
 *  preview so "when does billing actually start" is computed one way. */
function chargeAnchor(startDate: string | null | undefined, paidThroughDate: string | null | undefined, billingDay: number | null | undefined): Date {
  const start = startDate ? parseDateOnly(String(startDate)) : new Date();
  const day = billingDay && billingDay >= 1 && billingDay <= 28 ? billingDay : 1;
  const paidThrough = paidThroughDate ? String(paidThroughDate).slice(0, 10) : null;
  // Billing day in the start month, or next month if start is later in the month
  // than the billing day (never back-date a charge before enrollment).
  let anchor = new Date(start.getFullYear(), start.getMonth(), day);
  if (anchor < new Date(start.getFullYear(), start.getMonth(), start.getDate())) {
    anchor = new Date(start.getFullYear(), start.getMonth() + 1, day);
  }
  // Never generate charges for a month before the CURRENT month. Importing an old
  // enrollment date sets tenure/belt context, it must not manufacture a backlog of
  // past tuition that all fires at go-live. (Whatever they already paid is captured
  // by paidThroughDate; the current month is the earliest we auto-bill.)
  const now = new Date();
  const curMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (new Date(anchor.getFullYear(), anchor.getMonth(), 1) < curMonth) {
    anchor = new Date(now.getFullYear(), now.getMonth(), day);
  }
  // Skip forward past any month already covered by paidThroughDate. Hard-capped so a
  // malformed/absurd paid-through can never spin forever.
  for (let i = 0; paidThrough && dueStr(anchor) <= paidThrough && i < 600; i++) {
    anchor = new Date(anchor.getFullYear(), anchor.getMonth() + 1, day);
  }
  return anchor;
}

/** Preview: the period + due date of the first charge that WOULD be scheduled. */
export function firstChargeInfo(startDate: string | null | undefined, paidThroughDate: string | null | undefined, billingDay: number | null | undefined): { periodMonth: string; dueDate: string } {
  const a = chargeAnchor(startDate, paidThroughDate, billingDay);
  return { periodMonth: `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}`, dueDate: dueStr(a) };
}

/** Create/refresh the next `months` scheduled charges for a membership at its
 *  current net monthly amount, anchored to the REAL cycle:
 *   - first charge lands on the billing day on/after the membership start date;
 *   - any month already covered by paidThroughDate (legacy import) is skipped, so
 *     importing a mid-cycle family never bills a month they already paid.
 *  Idempotent per month (won't overwrite an existing month's edited amount). */
export async function generateCharges(membershipId: number, months = 12): Promise<void> {
  const m = await getMembership(membershipId);
  if (!m) return;
  const net = Math.max(0, m.monthlyAmountCents - (m.discountCents || 0));
  const day = m.billingDay && m.billingDay >= 1 && m.billingDay <= 28 ? m.billingDay : 1;
  const anchor = chargeAnchor(m.startDate ? String(m.startDate) : null, m.paidThroughDate ? String(m.paidThroughDate) : null, m.billingDay);
  for (let i = 0; i < months; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, day);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    await upsertMembershipCharge({ membershipId, periodMonth: period, dueDate: dueStr(d), baseAmountCents: net, amountCents: net });
  }
}

/** Today's date (YYYY-MM-DD) in America/New_York — same business date the charge
 *  sweeper uses, so runway/due comparisons agree. */
function etToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => parts.find(p => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Keep a membership's FORWARD charge schedule topped up. Charges are generated once
 *  at creation (termMonths ahead); without this, billing silently STOPS once those
 *  run out (month 13). If fewer than `minAhead` future scheduled charges remain, this
 *  appends months after the last existing one until there are `target` future charges.
 *  Never creates a past-dated (backlog) charge, skips subscription-billed and canceled
 *  memberships, and stops at a scheduled cancellation date. Idempotent (upsert per
 *  month). Returns how many charges it added. */
export async function ensureChargeRunway(membershipId: number, minAhead = 3, target = 12): Promise<number> {
  const m = await getMembership(membershipId);
  if (!m) return 0;
  if (m.status === "canceled") return 0;
  if (m.stripeSubscriptionId) return 0; // billed by Stripe subscription, not the ledger
  const net = Math.max(0, m.monthlyAmountCents - (m.discountCents || 0));
  const day = m.billingDay && m.billingDay >= 1 && m.billingDay <= 28 ? m.billingDay : 1;
  const todayStr = etToday();
  const cancelDate = m.cancelEffectiveDate ? String(m.cancelEffectiveDate).slice(0, 10) : null;
  const charges = await listMembershipCharges(membershipId);
  const futureScheduled = charges.filter(c => c.status === "scheduled" && c.dueDate && String(c.dueDate).slice(0, 10) >= todayStr);
  if (futureScheduled.length >= minAhead) return 0; // still has runway; nothing to do

  // Start appending the month AFTER the last existing charge, but never before the
  // current month (a lapsed membership must not get a backlog of past charges).
  const lastPeriod = charges.reduce((mx, c) => (c.periodMonth > mx ? c.periodMonth : mx), "");
  let anchor: Date;
  if (lastPeriod) {
    const [y, mo] = lastPeriod.split("-").map(Number);
    anchor = new Date(y, mo, day); // JS month is 0-based, so `mo` = the month after
  } else {
    anchor = chargeAnchor(m.startDate ? String(m.startDate) : null, m.paidThroughDate ? String(m.paidThroughDate) : null, m.billingDay);
  }
  const now = new Date();
  if (new Date(anchor.getFullYear(), anchor.getMonth(), 1) < new Date(now.getFullYear(), now.getMonth(), 1)) {
    anchor = new Date(now.getFullYear(), now.getMonth(), day);
  }

  let created = 0, futureCount = futureScheduled.length, guard = 0;
  while (futureCount < target && guard < 60) {
    const due = dueStr(anchor);
    if (cancelDate && due > cancelDate) break; // don't schedule past a pending cancellation
    const period = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
    await upsertMembershipCharge({ membershipId, periodMonth: period, dueDate: due, baseAmountCents: net, amountCents: net });
    created++;
    if (due >= todayStr) futureCount++;
    anchor = new Date(anchor.getFullYear(), anchor.getMonth() + 1, day);
    guard++;
  }
  return created;
}

/** Daily maintenance: top up the forward schedule for every active membership so
 *  nobody's tuition silently lapses. Runs regardless of whether charging is enabled
 *  (keeps the Financials schedule populated pre-go-live too). */
export async function topUpAllChargeRunways(): Promise<{ membershipsToppedUp: number; chargesAdded: number }> {
  let membershipsToppedUp = 0, chargesAdded = 0;
  for (const m of await listMemberships("active")) {
    const added = await ensureChargeRunway(m.id);
    if (added > 0) { membershipsToppedUp++; chargesAdded += added; }
  }
  return { membershipsToppedUp, chargesAdded };
}

// ─── Operations ──────────────────────────────────────────────────────────────

export async function createMembership(input: {
  studentName: string; parentName?: string | null; email?: string | null; phone?: string | null;
  leadId?: number | null; program: string; planLabel?: string | null; monthlyAmountCents: number;
  discountCents?: number; discountNote?: string | null; startDate?: string | null;
  paidThroughDate?: string | null;
  termMonths?: number | null; billingDay?: number | null; contractNote?: string | null;
  afterschoolRegId?: number | null; stripeSubscriptionId?: string | null;
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
    // Keep the ledger honest: cancel any still-scheduled charge whose due date
    // falls after the effective date, so nothing lingers to be charged later.
    // (The charge job also refuses these at runtime; this is defense in depth.)
    for (const c of await listMembershipCharges(id)) {
      if (c.status !== "scheduled") continue;
      const due = c.dueDate ? String(c.dueDate).slice(0, 10) : null;
      if (due && due > eff) await updateMembershipCharge(c.id, { status: "canceled", note: "canceled: past 60-day notice date" });
    }
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
