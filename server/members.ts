/**
 * Members — the unified "person" view (People → Members).
 *
 * TMA's members live in two tables today: `memberships` (the canonical martial-arts
 * / afterschool membership records with tuition + Financials) and
 * `afterschoolRegistrations` (the online self-signups that paid registration but may
 * not have recurring billing configured yet). A person can appear in both, and a
 * family can have several programs. This module unions them into ONE member row per
 * person so the dashboard has a single Members screen.
 *
 * Identity is the STUDENT/CHILD name, NOT the email: siblings share a parent email,
 * so email-keying would collapse two kids into one row (and undercount). Email is
 * used only to disambiguate the rare case of the same name under two different
 * families. This is a read-side projection; it never mutates the underlying tables.
 *
 * Billing status is a cheap approximation (no per-row Stripe call): a member "needs
 * setup" when nothing on file (subscription, membership customer, or a family payer
 * that already has a Stripe customer) points at a card. The member popup does the
 * authoritative card lookup when opened.
 */
import { listMemberships, getAfterschoolRegistrations, listPayers, type MembershipRow, type AfterschoolRegistrationRow } from "./db";

export type MemberBilling = "up_to_date" | "past_due" | "setup_needed" | "none";
export type MemberWaiver = "on_file" | "missing" | "na";

export type MemberRow = {
  key: string;
  /** Membership to open in the command-center popup (null = afterschool-only, no membership yet). */
  primaryMembershipId: number | null;
  /** Set only when this person has an afterschool signup with NO recurring billing yet — drives "Set up billing". */
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
  monthlyCents: number;      // sum of net tuition across this person's billing sources
  payerId: number | null;
};

const LABEL: Record<string, string> = { taekwondo: "Taekwondo", kickboxing: "Kickboxing", bjj: "BJJ", afterschool: "After-School" };
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const normName = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const STATUS_RANK: Record<string, number> = { active: 3, pending: 2, paused: 1, canceled: 0 };
const worseBilling = (a: MemberBilling, b: MemberBilling): MemberBilling => {
  const rank: Record<MemberBilling, number> = { past_due: 3, setup_needed: 2, none: 1, up_to_date: 0 };
  return rank[b] > rank[a] ? b : a;
};

// Person key = normalized name, disambiguated by email ONLY when the same name
// appears under more than one distinct email (same name, different families).
// Siblings have different names, so they never merge even sharing a parent email.
function buildKeyer(records: { name: string; email: string | null }[]) {
  const nameToEmails = new Map<string, Set<string>>();
  for (const r of records) {
    const n = normName(r.name); if (!n) continue;
    const e = norm(r.email);
    if (!nameToEmails.has(n)) nameToEmails.set(n, new Set());
    if (e) nameToEmails.get(n)!.add(e);
  }
  return (name: string, email: string | null): string => {
    const n = normName(name) || `blank:${norm(email)}`;
    const emails = nameToEmails.get(n);
    if (emails && emails.size > 1 && norm(email)) return `${n}|${norm(email)}`;
    return n;
  };
}

function membershipBilling(m: MembershipRow, payerHasCard: Set<number>): MemberBilling {
  if (m.status === "canceled") return "none";
  if (m.stripeSubscriptionId) return "up_to_date";
  if (m.stripeCustomerId) return "up_to_date";
  if (m.payerId && payerHasCard.has(m.payerId)) return "up_to_date"; // card lives on the family payer
  return "setup_needed";
}

function afterschoolBilling(r: AfterschoolRegistrationRow): MemberBilling {
  const s = (r.subscriptionStatus ?? "").toLowerCase();
  if (s === "active" || s === "trialing") return "up_to_date";
  if (s === "past_due" || s === "unpaid") return "past_due";
  if (s === "canceled") return "none";
  return "setup_needed";
}

export async function memberList(): Promise<MemberRow[]> {
  const [memberships, regsAll, payers] = await Promise.all([listMemberships(), getAfterschoolRegistrations(), listPayers()]);
  const regs = regsAll.filter(r => (r.stripePaymentStatus ?? "").toLowerCase() !== "failed"); // drop never-completed signups
  const payerHasCard = new Set(payers.filter(p => p.stripeCustomerId).map(p => p.id));
  const keyOf = buildKeyer([
    ...memberships.map(m => ({ name: m.studentName, email: m.email })),
    ...regs.map(r => ({ name: r.childName, email: r.email })),
  ]);

  const map = new Map<string, MemberRow>();
  const ensure = (key: string, seed: { name: string; parentName?: string | null; email?: string | null; phone?: string | null; payerId?: number | null }): MemberRow => {
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
    const key = keyOf(ms.studentName, ms.email);
    const m = ensure(key, { name: ms.studentName, parentName: ms.parentName, email: ms.email, phone: ms.phone, payerId: ms.payerId });
    if (m.primaryMembershipId === null) m.primaryMembershipId = ms.id; // list is DESC → most recent first
    addProgram(m, ms.program);
    if (ms.status !== "canceled") m.monthlyCents += Math.max(0, ms.monthlyAmountCents - (ms.discountCents || 0));
    if ((STATUS_RANK[ms.status] ?? 0) > (STATUS_RANK[m.status] ?? 0)) m.status = ms.status === "pending" ? "active" : ms.status;
    m.billing = worseBilling(m.billing, membershipBilling(ms, payerHasCard));
    if (m.payerId === null && ms.payerId !== null) m.payerId = ms.payerId;
    if (ms.parentName && !m.parentName) m.parentName = ms.parentName;
    if (!m.phone && ms.phone) m.phone = ms.phone;
  }

  for (const r of regs) {
    const key = keyOf(r.childName, r.email);
    const m = ensure(key, { name: r.childName, parentName: r.parentName, email: r.email, phone: r.phone });
    // If this person already has an afterschool MEMBERSHIP, this reg is its origin
    // (or already billed): don't add its tuition again and don't offer setup.
    const alreadyAfterschoolMember = m.programs.includes("afterschool");
    addProgram(m, "afterschool");
    if (!alreadyAfterschoolMember) {
      const subs = (r.subscriptionStatus ?? "").toLowerCase();
      const canceled = subs === "canceled" || subs === "unpaid";
      const activeSub = subs === "active" || subs === "trialing";
      m.billing = worseBilling(m.billing, afterschoolBilling(r));
      if (!canceled && (STATUS_RANK.active > (STATUS_RANK[m.status] ?? 0))) m.status = "active";
      if (r.monthlyAmountCents) m.monthlyCents += r.monthlyAmountCents;
      // "Set up billing" only when there's no recurring billing yet (no active sub).
      if (!activeSub && m.afterschoolRegId === null) m.afterschoolRegId = r.id;
    }
    const w: MemberWaiver = r.waiverId ? "on_file" : "missing";
    if (m.waiver === "na") m.waiver = w;
    else if (w === "on_file") m.waiver = "on_file";
    if (!m.parentName && r.parentName) m.parentName = r.parentName;
    if (!m.phone && r.phone) m.phone = r.phone;
  }

  // Canceled/former members drop off the default roster (keeps the count honest
  // against the overview tiles, which also exclude canceled).
  return Array.from(map.values()).filter(m => m.status !== "canceled").sort((a, b) => a.name.localeCompare(b.name));
}

export type MemberOverview = { total: number; activeThisMonth: number; billingIssues: number; waiversMissing: number };

export async function memberOverview(rows?: MemberRow[]): Promise<MemberOverview> {
  const list = rows ?? (await memberList());
  return {
    total: list.length,
    activeThisMonth: list.filter(m => m.status === "active").length,
    billingIssues: list.filter(m => m.billing === "past_due" || m.billing === "setup_needed").length,
    waiversMissing: list.filter(m => m.waiver === "missing").length,
  };
}
