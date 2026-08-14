/**
 * Members — the unified "person" view (People → Members).
 *
 * TMA's members live in two tables today: `memberships` (the canonical martial-arts
 * / afterschool membership records with tuition + Financials) and
 * `afterschoolRegistrations` (the online self-signups that paid registration but may
 * not have recurring billing configured yet). A person can appear in both, and a
 * family can have several programs. This module unions them into ONE member row per
 * person so the dashboard has a single Members screen (see the ZenPlanner-style
 * mock + docs/DASHBOARD_REORG_AND_ROADMAP.md).
 *
 * Matching is by normalized email, falling back to normalized name — the same key
 * the assistant uses. We do NOT mutate or merge the underlying tables; this is a
 * read-side projection. The "Set up billing" action (members.setupAfterschoolBilling)
 * is the one write, and it creates a real membership from an afterschool reg.
 *
 * Billing status here is a cheap approximation (no per-row Stripe call): a member
 * "needs setup" when nothing on file points at a card/subscription. The member popup
 * does the authoritative card lookup when opened.
 */
import { listMemberships, getAfterschoolRegistrations, type MembershipRow, type AfterschoolRegistrationRow } from "./db";

export type MemberBilling = "up_to_date" | "past_due" | "setup_needed" | "none";
export type MemberWaiver = "on_file" | "missing" | "na";

export type MemberRow = {
  key: string;
  /** Membership to open in the command-center popup (null = afterschool-only, needs setup). */
  primaryMembershipId: number | null;
  afterschoolRegId: number | null;
  name: string;
  parentName: string | null;
  email: string | null;
  phone: string | null;
  programs: string[];        // normalized: taekwondo | kickboxing | bjj | afterschool
  programLabels: string[];   // display: Taekwondo | Kickboxing | BJJ | After-School
  status: string;            // active | paused | canceled
  billing: MemberBilling;
  waiver: MemberWaiver;
  monthlyCents: number;      // sum of net tuition across this person's memberships
  payerId: number | null;
};

const LABEL: Record<string, string> = { taekwondo: "Taekwondo", kickboxing: "Kickboxing", bjj: "BJJ", afterschool: "After-School" };
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const keyFor = (email: string | null | undefined, name: string | null | undefined) =>
  norm(email) ? `e:${norm(email)}` : `n:${norm(name)}`;

const STATUS_RANK: Record<string, number> = { active: 3, pending: 2, paused: 1, canceled: 0 };
const worseBilling = (a: MemberBilling, b: MemberBilling): MemberBilling => {
  const rank: Record<MemberBilling, number> = { past_due: 3, setup_needed: 2, none: 1, up_to_date: 0 };
  return rank[b] > rank[a] ? b : a;
};

function membershipBilling(m: MembershipRow): MemberBilling {
  if (m.status === "canceled") return "none";
  if (m.stripeSubscriptionId) return "up_to_date";
  if (m.stripeCustomerId || m.payerId) return "up_to_date"; // card on file (approx.)
  return "setup_needed";
}

function afterschoolBilling(r: AfterschoolRegistrationRow): MemberBilling {
  const s = (r.subscriptionStatus ?? "").toLowerCase();
  if (s === "active" || s === "trialing") return "up_to_date";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "setup_needed";
}

export async function memberList(): Promise<MemberRow[]> {
  const [memberships, regs] = await Promise.all([listMemberships(), getAfterschoolRegistrations()]);
  const map = new Map<string, MemberRow>();

  const ensure = (key: string, seed: Partial<MemberRow> & { name: string }): MemberRow => {
    let m = map.get(key);
    if (!m) {
      m = {
        key, primaryMembershipId: null, afterschoolRegId: null, name: seed.name,
        parentName: seed.parentName ?? null, email: seed.email ?? null, phone: seed.phone ?? null,
        programs: [], programLabels: [], status: "canceled", billing: "up_to_date", waiver: "na",
        monthlyCents: 0, payerId: seed.payerId ?? null,
      };
      map.set(key, m);
    }
    return m;
  };
  const addProgram = (m: MemberRow, prog: string) => {
    const p = norm(prog);
    if (p && !m.programs.includes(p)) { m.programs.push(p); m.programLabels.push(LABEL[p] ?? prog); }
  };

  for (const ms of memberships) {
    const key = keyFor(ms.email, ms.studentName);
    const m = ensure(key, { name: ms.studentName, parentName: ms.parentName, email: ms.email, phone: ms.phone, payerId: ms.payerId });
    if (m.primaryMembershipId === null) m.primaryMembershipId = ms.id; // list is DESC → most recent first
    addProgram(m, ms.program);
    if (ms.status !== "canceled") m.monthlyCents += Math.max(0, ms.monthlyAmountCents - (ms.discountCents || 0));
    if ((STATUS_RANK[ms.status] ?? 0) > (STATUS_RANK[m.status] ?? 0)) m.status = ms.status === "pending" ? "active" : ms.status;
    m.billing = worseBilling(m.billing, membershipBilling(ms));
    if (m.payerId === null && ms.payerId !== null) m.payerId = ms.payerId;
    if (ms.parentName && !m.parentName) m.parentName = ms.parentName;
  }

  for (const r of regs) {
    if ((r.stripePaymentStatus ?? "").toLowerCase() === "failed") continue; // never-completed signup
    const key = keyFor(r.email, r.childName);
    const existed = map.has(key);
    const m = ensure(key, { name: r.childName, parentName: r.parentName, email: r.email, phone: r.phone });
    addProgram(m, "afterschool");
    if (!existed) m.afterschoolRegId = r.id;
    else if (m.afterschoolRegId === null) m.afterschoolRegId = r.id;
    // Afterschool registrant is an active attending member regardless of billing state.
    if ((STATUS_RANK["active"]) > (STATUS_RANK[m.status] ?? 0)) m.status = "active";
    m.billing = worseBilling(m.billing, afterschoolBilling(r));
    // Waiver only tracked for afterschool; on_file wins over missing.
    const w: MemberWaiver = r.waiverId ? "on_file" : "missing";
    if (m.waiver === "na") m.waiver = w;
    else if (w === "on_file") m.waiver = "on_file";
    if (!existed && r.monthlyAmountCents) m.monthlyCents += r.monthlyAmountCents;
    if (!m.parentName && r.parentName) m.parentName = r.parentName;
    if (!m.phone && r.phone) m.phone = r.phone;
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export type MemberOverview = { total: number; activeThisMonth: number; billingIssues: number; waiversMissing: number };

export async function memberOverview(rows?: MemberRow[]): Promise<MemberOverview> {
  const list = rows ?? (await memberList());
  const active = list.filter(m => m.status === "active");
  return {
    total: list.filter(m => m.status !== "canceled").length,
    activeThisMonth: active.length,
    billingIssues: list.filter(m => m.status !== "canceled" && (m.billing === "past_due" || m.billing === "setup_needed")).length,
    waiversMissing: list.filter(m => m.status !== "canceled" && m.waiver === "missing").length,
  };
}
