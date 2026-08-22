/**
 * Read-only AI assistant (server) — 2026-08-11
 *
 * A chat assistant for the admin dashboard. It answers questions from LIVE data
 * (leads, students, payments) via whitelisted READ tools — no mutation tools are
 * registered, so it literally cannot change data or send anything.
 *
 * Runs server-side only: the OpenAI key + DB/Stripe access live here, behind the
 * admin session. See docs/AI_ASSISTANT_SPEC.md.
 *
 * Registered as POST /api/admin/assistant in server/_core/index.ts.
 */
import type { Request, Response } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { streamText, generateText, tool, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { ENV } from "./_core/env";
import { adminEmailFromRequest } from "./admin-auth";
import {
  searchLeads, searchStudents, getRosterStudents, getLeadById,
  getAfterschoolRegistrations, listMemberships, listMembershipCharges, getMembership,
  listMembershipIdsWithPastDueCharge,
} from "./db";
import { listPayerCards, createCardSetupSession } from "./membership-billing";
import { memberWaivers } from "./members";
import { retrievePlaybook } from "./playbook-rag";
import { proposeAction } from "./action-flow";

// The runtime injects OPENAI_BASE_URL for platform services. The dashboard
// assistant intentionally uses the customer's own OPENAI_API_KEY instead, so
// pin the official endpoint rather than inheriting that unrelated override.
const assistantOpenAI = createOpenAI({
  apiKey: ENV.openaiApiKey,
  baseURL: "https://api.openai.com/v1",
});

// ─── Shared Stripe payments service ──────────────────────────────────────────
// Lists succeeded, non-refunded TMA charges, optionally filtered by a text query
// (name/email/metadata) and a created-date window. Card numbers never appear here
// (Stripe holds them); only amounts, dates, descriptions, and references.
function describeCharge(c: Stripe.Charge): string {
  const md = (c.metadata || {}) as Record<string, string>;
  if (md.selectedWeeks) return `Summer Camp - ${md.selectedWeeks}${md.programType ? ` (${md.programType})` : ""}`;
  if (md.product === "afterschool_registration") return `After School Registration${md.plan ? ` (${md.plan})` : ""}`;
  if (md.product === "3_week_99") return "3-Week Trial";
  if (md.product) return String(md.product).replace(/_/g, " ");
  return c.description || c.calculated_statement_descriptor || "Payment";
}

export async function listStripePayments(opts: {
  query?: string;
  startUnix?: number;
  endUnix?: number;
  maxPages?: number;
}): Promise<{ items: { date: string; description: string; amountCents: number; name: string; email: string }[]; totalCents: number }> {
  if (!ENV.tmaStripeSecretKey) return { items: [], totalCents: 0 };
  const stripe = new Stripe(ENV.tmaStripeSecretKey);
  const q = (opts.query || "").trim().toLowerCase();
  const gte = opts.startUnix ?? Math.floor(Date.now() / 1000) - 18 * 30 * 86400; // ~18mo default
  const lte = opts.endUnix;
  const fmt = (created: number) =>
    new Date(created * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const rows: { created: number; date: string; description: string; amountCents: number; name: string; email: string }[] = [];
  let startingAfter: string | undefined;
  const maxPages = opts.maxPages ?? 6;
  for (let page = 0; page < maxPages; page++) {
    const res = await stripe.charges.list({
      limit: 100,
      created: { gte, ...(lte ? { lte } : {}) },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const c of res.data) {
      if (c.status !== "succeeded" || c.refunded) continue;
      const md = (c.metadata || {}) as Record<string, string>;
      const name = c.billing_details?.name || md.camper1Name || md.studentName || md.parentName || "";
      const email = c.billing_details?.email || md.parentEmail || md.email || c.receipt_email || "";
      if (q) {
        const hay = `${name} ${email} ${JSON.stringify(md)}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      rows.push({ created: c.created, date: fmt(c.created), description: describeCharge(c), amountCents: c.amount, name, email });
    }
    if (!res.has_more || res.data.length === 0) break;
    startingAfter = res.data[res.data.length - 1].id;
  }
  rows.sort((a, b) => a.created - b.created);
  const totalCents = rows.reduce((s, r) => s + r.amountCents, 0);
  return { items: rows.map(({ created, ...r }) => r), totalCents };
}

function toUnix(dateStr?: string, endOfDay = false): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  const ms = d.getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

// Resolve a membership from a free-text name/email query, preferring an EXACT
// student-name match and flagging AMBIGUITY when more than one distinct person
// matches — so a tool (or a downstream write like a belt promotion) never silently
// acts on the wrong person. Returns { match } or { ambiguous: [...] } or {}.
type MiniMembership = { id: number; studentName: string; parentName: string | null; email: string | null; payerId?: number | null };
function resolveMembershipMatch<T extends MiniMembership>(all: T[], query: string): { match?: T; ambiguous?: { student: string; membershipId: number }[] } {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return {};
  const exact = all.filter(x => (x.studentName ?? "").trim().toLowerCase() === q);
  const pool = exact.length ? exact : all.filter(x => `${x.studentName ?? ""} ${x.parentName ?? ""} ${x.email ?? ""}`.toLowerCase().includes(q));
  if (pool.length === 0) return {};
  const distinctNames = new Set(pool.map(x => (x.studentName ?? "").trim().toLowerCase()));
  if (distinctNames.size > 1) return { ambiguous: pool.slice(0, 8).map(x => ({ student: x.studentName, membershipId: x.id })) };
  return { match: pool[0] };
}

// ─── Read tools (no mutations) ───────────────────────────────────────────────
function buildTools(opts: { origin: string }) {
  return {
    findPerson: tool({
      description: "Find leads, students, or afterschool-roster children by name, email, or phone. Use this to locate a person before answering about them.",
      inputSchema: z.object({ query: z.string().min(1).describe("A name, email, or phone fragment") }),
      execute: async ({ query }) => {
        const [leads, students, roster] = await Promise.all([
          searchLeads(query, 6), searchStudents(query), getRosterStudents(),
        ]);
        const needle = query.toLowerCase();
        return {
          leads: leads.map(l => ({ id: l.id, kid: l.kidName, parent: l.parentName, email: l.email, phone: l.phone, stage: l.pipelineStage, recordType: l.recordType })),
          students: (students as Array<{ id: number; name: string; email: string | null; phone: string | null }>).slice(0, 6).map(s => ({ id: s.id, name: s.name, email: s.email, phone: s.phone })),
          afterschoolRoster: roster.filter(r => `${r.childName} ${r.schoolName} ${r.phone ?? ""}`.toLowerCase().includes(needle)).slice(0, 6).map(r => ({ id: r.id, child: r.childName, school: r.schoolName, phone: r.phone })),
        };
      },
    }),

    getPaymentSummary: tool({
      description: "List a family's succeeded payments (and the total) for a date range. Card numbers are never returned. Dates are YYYY-MM-DD; omit them for the last ~18 months.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Family name or email to match against payments"),
        startDate: z.string().optional().describe("YYYY-MM-DD"),
        endDate: z.string().optional().describe("YYYY-MM-DD"),
      }),
      execute: async ({ query, startDate, endDate }) => {
        const { items, totalCents } = await listStripePayments({ query, startUnix: toUnix(startDate), endUnix: toUnix(endDate, true) });
        return { count: items.length, totalDollars: (totalCents / 100).toFixed(2), payments: items.map(p => ({ date: p.date, description: p.description, amount: `$${(p.amountCents / 100).toFixed(2)}` })) };
      },
    }),

    getRevenueSummary: tool({
      description: "Total collected revenue for a date range (all families). Dates are YYYY-MM-DD.",
      inputSchema: z.object({ startDate: z.string().describe("YYYY-MM-DD"), endDate: z.string().describe("YYYY-MM-DD") }),
      execute: async ({ startDate, endDate }) => {
        const { items, totalCents } = await listStripePayments({ startUnix: toUnix(startDate), endUnix: toUnix(endDate, true), maxPages: 10 });
        return { paymentCount: items.length, totalDollars: (totalCents / 100).toFixed(2), from: startDate, to: endDate };
      },
    }),

    listPastDueTuition: tool({
      description: "List families whose payment is past due — both afterschool subscriptions and membership tuition charges.",
      inputSchema: z.object({}),
      execute: async () => {
        const [regs, memberships, pastDueIds] = await Promise.all([getAfterschoolRegistrations(), listMemberships("active"), listMembershipIdsWithPastDueCharge()]);
        const subPastDue = regs.filter(r => r.subscriptionStatus === "past_due");
        const memberPastDue = memberships.filter(m => pastDueIds.has(m.id));
        return {
          count: subPastDue.length + memberPastDue.length,
          families: [
            ...subPastDue.map(r => ({ parent: r.parentName, child: r.childName, email: r.email, phone: r.phone, monthly: r.monthlyAmountCents ? `$${(r.monthlyAmountCents / 100).toFixed(0)}/mo` : null, source: "afterschool subscription" })),
            ...memberPastDue.map(m => ({ parent: m.parentName, child: m.studentName, email: m.email, phone: m.phone, monthly: `$${(Math.max(0, m.monthlyAmountCents - (m.discountCents || 0)) / 100).toFixed(0)}/mo`, source: "membership tuition" })),
          ],
        };
      },
    }),

    listMissingAfterschoolWaivers: tool({
      description: "List paid afterschool registrations that have no signed waiver linked (waiverId is null).",
      inputSchema: z.object({}),
      execute: async () => {
        const regs = await getAfterschoolRegistrations();
        const missing = regs.filter(r => r.waiverId == null);
        return { count: missing.length, families: missing.map(r => ({ parent: r.parentName, child: r.childName, email: r.email, phone: r.phone, paidAt: r.paidAt })) };
      },
    }),

    getLeadDetail: tool({
      description: "Get full detail for one lead by its id (from findPerson).",
      inputSchema: z.object({ leadId: z.number().int().positive() }),
      execute: async ({ leadId }) => {
        const l = await getLeadById(leadId);
        if (!l) return { found: false };
        return { found: true, kid: l.kidName, parent: l.parentName, email: l.email, phone: l.phone, stage: l.pipelineStage, program: l.programInterest, recordType: l.recordType, trialDate: l.trialClassDate, notes: l.internalNotes };
      },
    }),

    answerFromPlaybook: tool({
      description: "Look up TMA front-desk policy and 'how do I...' procedure guidance from the playbook + SOPs. Use for questions about how to handle a situation (a no-show, which link to send, checking a camp waiver, the daily open/close routine, escalation). Returns the most relevant snippets; answer from them and name the section.",
      inputSchema: z.object({ question: z.string().min(1).describe("The staff member's how-to / policy question") }),
      execute: async ({ question }) => {
        const hits = await retrievePlaybook(question, 4);
        if (hits.length === 0) return { snippets: [], note: "No playbook is indexed or the assistant is not configured." };
        return { snippets: hits.map(h => ({ source: h.source, section: h.title, text: h.text })) };
      },
    }),

    draftEmailForApproval: tool({
      description: "Draft an email to someone for a STAFF MEMBER to review and send. This does NOT send anything — it creates a pending draft that a human must confirm in the Approvals view. Use when asked to email/notify/follow-up-with someone. Write a clear subject and a complete, ready-to-send message; do not use placeholders.",
      inputSchema: z.object({
        to: z.string().email().describe("recipient email address"),
        subject: z.string().min(1).max(255),
        body: z.string().min(1).describe("the full email message (plain text; it will be formatted)"),
      }),
      execute: async ({ to, subject, body }) => {
        const safe = body.replace(/</g, "&lt;");
        const html = `<div style="font-family: Arial, sans-serif; white-space: pre-wrap; color:#1a2233;">${safe}</div>`;
        const { id } = await proposeAction("send_email", { to, subject, html }, "assistant");
        return { drafted: true, pendingActionId: id, note: `Draft #${id} created. Nothing was sent. A staff member must review and confirm it in Approvals before it goes out.` };
      },
    }),

    // ── Membership read helpers (to locate ids before proposing) ──
    findMembership: tool({
      description: "Find a student's membership by name or email. Returns the membership id (needed for any change) + a summary and a link to open it. Use this before proposing a membership change.",
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async ({ query }) => {
        const q = query.toLowerCase();
        const hits = (await listMemberships()).filter(m => `${m.studentName} ${m.parentName ?? ""} ${m.email ?? ""}`.toLowerCase().includes(q)).slice(0, 6);
        return { memberships: hits.map(m => ({ id: m.id, student: m.studentName, program: m.program, plan: m.planLabel, monthly: `$${((m.monthlyAmountCents - (m.discountCents || 0)) / 100).toFixed(0)}/mo`, status: m.status, openLink: `/admin/members?open=${m.id}` })) };
      },
    }),

    openMemberProfile: tool({
      description: "Open a student's member profile as a popup in the dashboard for the staff member (the command center: tuition, cards on file, and the monthly financials, all editable there). Use when the user asks to pull up / open / show / see a specific student's profile or membership. Pass the membership id (from findMembership) when you have it, otherwise a name or email query and this resolves it.",
      inputSchema: z.object({ membershipId: z.number().int().positive().optional(), query: z.string().optional().describe("name or email, if you don't have the id") }),
      execute: async ({ membershipId, query }) => {
        const all = await listMemberships();
        if (membershipId) {
          const m = all.find(x => x.id === membershipId);
          if (!m) return { found: false, note: `No membership with id ${membershipId}.` };
          return { found: true, opened: true, membershipId: m.id, student: m.studentName, program: m.program, note: `Opened ${m.studentName}'s profile in the dashboard.` };
        }
        const q = (query ?? "").trim().toLowerCase();
        if (!q) return { found: false, note: "Tell me which student to open (a name or email)." };
        const matches = all.filter(x => `${x.studentName} ${x.parentName ?? ""} ${x.email ?? ""}`.toLowerCase().includes(q));
        // Prefer an exact student-name match to avoid opening the wrong person.
        const exact = matches.filter(x => x.studentName.trim().toLowerCase() === q);
        const pick = exact.length === 1 ? exact : matches;
        if (pick.length === 1) {
          const m = pick[0];
          // opened:true is the signal the chat UI reads to pop the docked panel open.
          return { found: true, opened: true, membershipId: m.id, student: m.studentName, program: m.program, note: `Opened ${m.studentName}'s profile in the dashboard.` };
        }
        if (pick.length > 1) {
          return { found: true, opened: false, ambiguous: true, candidates: pick.slice(0, 6).map(m => ({ id: m.id, student: m.studentName, parent: m.parentName, program: m.program })), note: "More than one match. Ask which one, then open by membership id." };
        }
        // No membership. They may be an afterschool signup with billing not set up yet.
        const reg = (await getAfterschoolRegistrations()).find(r => `${r.childName} ${r.parentName} ${r.email}`.toLowerCase().includes(q));
        if (reg) return { found: false, afterschoolOnly: true, child: reg.childName, note: `${reg.childName} is an afterschool signup with no membership yet. Staff can open Members and click "Set up billing" to create one; I can't open a profile until then.` };
        return { found: false, note: `No student found matching "${query}".` };
      },
    }),
    getMembershipCharges: tool({
      description: "List a membership's monthly charges (with charge ids) so you can propose adjusting a specific month. Needs the membership id (from findMembership).",
      inputSchema: z.object({ membershipId: z.number().int().positive() }),
      execute: async ({ membershipId }) => {
        const charges = await listMembershipCharges(membershipId);
        return { charges: charges.map(c => ({ chargeId: c.id, month: c.periodMonth, amount: `$${(c.amountCents / 100).toFixed(2)}`, status: c.status })) };
      },
    }),

    // ── Waivers on file (martial-arts + afterschool) ──
    checkWaiverStatus: tool({
      description: "Check which signed waivers a student has on file: a martial-arts waiver (shared for Taekwondo/Kickboxing/BJJ) and an afterschool waiver. Returns per-kind status (on file / needs review / missing / not required) with signed dates. Use for 'does <student> have their waiver?' or verifying a specific person. For the global list of afterschool signups missing a waiver, use listMissingAfterschoolWaivers instead.",
      inputSchema: z.object({ membershipId: z.number().int().positive().optional(), query: z.string().optional().describe("name or email if you don't have the membership id") }),
      execute: async ({ membershipId, query }) => {
        let id = membershipId;
        if (!id) {
          if (!query) return { found: false, note: "Give a student name/email or membership id." };
          const r = resolveMembershipMatch(await listMemberships(), query);
          if (r.ambiguous) return { found: false, ambiguous: true, candidates: r.ambiguous, note: `More than one person matches "${query}". Ask which one, then pass their membership id.` };
          if (!r.match) return { found: false, note: `No membership found matching "${query}". They may be an afterschool-only signup without a membership yet.` };
          id = r.match.id;
        }
        const w = await memberWaivers(id);
        const summarize = (s: { status: string; waivers: Array<{ attested: boolean; signedDate: string; signedName: string | null; needsReview: boolean }> }) => ({
          status: s.status,
          onFile: s.waivers.map(x => ({ kind: x.attested ? "attested" : "signed", date: x.signedDate, by: x.signedName, needsReview: x.needsReview })),
        });
        return { found: true, student: w.person.name, programs: w.person.programs, martialArts: summarize(w.martialArts), afterschool: summarize(w.afterschool) };
      },
    }),

    // ── Belt rank + testing readiness (Taekwondo / martial arts) ──
    getBeltStatus: tool({
      description: "Get a martial-arts student's belt rank and testing readiness: current rank, next rank, classes since last promotion vs the requirement, months at rank, and whether they are marked ready to test. Pass the student id (from findPerson) or a name/email.",
      inputSchema: z.object({ studentId: z.number().int().positive().optional(), query: z.string().optional() }),
      execute: async ({ studentId, query }) => {
        const { getBeltStatus, searchStudents } = await import("./db");
        let id = studentId;
        if (!id && query) {
          const found = await searchStudents(query) as Array<{ id: number; name: string }>;
          const q = query.trim().toLowerCase();
          const exact = found.filter(s => (s.name ?? "").trim().toLowerCase() === q);
          const pool = exact.length ? exact : found;
          // Ambiguity guard: don't silently pick the first of several people — a wrong
          // pick here would feed a belt-promotion (a write) on the wrong student.
          const distinct = new Set(pool.map(s => (s.name ?? "").trim().toLowerCase()));
          if (distinct.size > 1) return { found: false, ambiguous: true, candidates: pool.slice(0, 8).map(s => ({ student: s.name, studentId: s.id })), note: `More than one student matches "${query}". Ask which one, then pass their student id.` };
          id = pool[0]?.id;
        }
        if (!id) return { found: false, note: "Give a student name/email or id." };
        const st = await getBeltStatus(id);
        if (!st) return { found: false, note: "No belt record for that student." };
        return { found: true, studentId: st.studentId, student: st.name, currentRank: st.currentRank, nextRank: st.nextRank, classesSince: st.classesSince, monthsSince: st.monthsSince, requirement: st.threshold, ready: st.ready, readiness: st.manualReadiness ?? "auto (from attendance)" };
      },
    }),
    proposePromoteBelt: tool({
      description: "Propose promoting a student ONE belt rank up (records history; applied only after Approve). Requires the student id (from getBeltStatus/findPerson). Do not skip ranks; to jump to a specific rank tell the user to use the belt dropdown in the member popup.",
      inputSchema: z.object({ studentId: z.number().int().positive(), note: z.string().max(255).optional() }),
      execute: async (input) => { const { id } = await proposeAction("belt_promote", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Approve to apply.` }; },
    }),

    // ── Cards on file (family payer). Read + secure setup link + propose changes ──
    listMemberCards: tool({
      description: "List the cards on file for a student's family (brand, last 4, expiry, and which is primary — the card charged). Card numbers are never shown. Use before proposing to make a card primary or remove one; it returns each card's paymentMethodId + a label.",
      inputSchema: z.object({ membershipId: z.number().int().positive().optional(), query: z.string().optional() }),
      execute: async ({ membershipId, query }) => {
        const all = await listMemberships();
        let m = membershipId ? all.find(x => x.id === membershipId) : undefined;
        if (!m && query) {
          const r = resolveMembershipMatch(all, query);
          if (r.ambiguous) return { found: false, ambiguous: true, candidates: r.ambiguous, note: `More than one person matches "${query}". Ask which one, then pass their membership id.` };
          m = r.match;
        }
        if (!m) return { found: false, note: "No membership found. Use findMembership first." };
        if (!m.payerId) return { found: true, membershipId: m.id, student: m.studentName, cards: [], note: "No family payer/card set up yet. Use openCardSetupLink to add the first card." };
        const cards = await listPayerCards(m.payerId);
        return { found: true, membershipId: m.id, student: m.studentName, cards: cards.map(c => ({ paymentMethodId: c.id, label: `${c.brand} ····${c.last4}`, exp: c.exp, primary: c.primary })) };
      },
    }),
    openCardSetupLink: tool({
      description: "Get a secure Stripe link to ADD or UPDATE a card on a student's family account. The card is entered on Stripe's page, never here (PCI). Returns a link the staff opens; it saves the card to the family and can cover siblings. Use for 'add a card' / 'update the card' requests.",
      inputSchema: z.object({ membershipId: z.number().int().positive() }),
      execute: async ({ membershipId }) => {
        const { url } = await createCardSetupSession(membershipId, opts.origin);
        if (!url) return { ok: false, note: "Stripe is not configured." };
        return { ok: true, setupUrl: url, note: "Open this secure Stripe page to add/update the card. It saves to the family payer." };
      },
    }),
    proposeMakePrimaryCard: tool({
      description: "Propose making a saved card the family's PRIMARY card (the one charged). Requires membershipId + paymentMethodId (from listMemberCards); pass cardLabel for a readable preview. Applies only after the Approve button is clicked.",
      inputSchema: z.object({ membershipId: z.number().int().positive(), paymentMethodId: z.string().min(1), cardLabel: z.string().max(120).optional() }),
      execute: async (input) => { const { id } = await proposeAction("card_make_primary", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Approve to apply.` }; },
    }),
    proposeRemoveCard: tool({
      description: "Propose REMOVING a saved card from the family. Requires membershipId + paymentMethodId (from listMemberCards); pass cardLabel for the preview. Cannot remove the primary card unless it is the only one. Applies only after the Approve button is clicked.",
      inputSchema: z.object({ membershipId: z.number().int().positive(), paymentMethodId: z.string().min(1), cardLabel: z.string().max(120).optional() }),
      execute: async (input) => { const { id } = await proposeAction("card_remove", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Approve to apply.` }; },
    }),

    // ── Membership propose-tools (create a pending action; a human confirms in Approvals) ──
    proposeCreateMembership: tool({
      description: "Propose creating a NEW membership. Does NOT create it — a staff member confirms in Approvals. Ask for any missing detail first (program, plan, monthly amount). Use only REAL TMA plan prices, never invent one: Taekwondo 2 days/week = $179 (17900) or 3 days/week = $199 (19900); Kickboxing = $159 (15900); BJJ = $159 (15900); After-school 2-3 day/week = $400 (40000) or 4-5 day/week = $500 (50000). monthlyAmountCents and discountCents are in cents; use discountCents for a reduced rate, not a made-up base price.",
      inputSchema: z.object({ studentName: z.string().min(1), parentName: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional(), program: z.string().min(1), planLabel: z.string().optional(), monthlyAmountCents: z.number().int().min(0), discountCents: z.number().int().min(0).optional(), discountNote: z.string().optional(), startDate: z.string().optional() }),
      execute: async (input) => { const { id } = await proposeAction("membership_create", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Nothing created yet — a staff member confirms it in Approvals.` }; },
    }),
    proposeChangeMembership: tool({
      description: "Propose changing an existing membership (program / plan / monthly tuition). Requires the membership id (from findMembership). Only use REAL TMA plan prices (never invent a number): Taekwondo 2 days/week = $179 (17900) or 3 days/week = $199 (19900); Kickboxing = $159 (15900); BJJ = $159 (15900); After-school 2-3 day/week = $400 (40000) or 4-5 day/week = $500 (50000). For a reduced rate use a discount, not a made-up price. Set prorate=true only if the user wants the change prorated to the current month; default is next billing cycle. Does NOT apply until approved.",
      inputSchema: z.object({ id: z.number().int().positive(), program: z.string().optional(), planLabel: z.string().optional(), monthlyAmountCents: z.number().int().min(0).optional(), prorate: z.boolean().optional() }),
      execute: async (input) => { const { id } = await proposeAction("membership_change", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Confirm in Approvals to apply.` }; },
    }),
    proposeSetDiscount: tool({
      description: "Propose setting a recurring monthly discount on a membership (e.g. sibling $20 = discountCents 2000; 0 clears it). Requires the membership id. Confirmed in Approvals.",
      inputSchema: z.object({ id: z.number().int().positive(), discountCents: z.number().int().min(0), note: z.string().optional() }),
      execute: async (input) => { const { id } = await proposeAction("membership_discount", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Confirm in Approvals.` }; },
    }),
    proposePauseMembership: tool({
      description: "Propose pausing a membership. Requires the membership id. Confirmed in Approvals.",
      inputSchema: z.object({ id: z.number().int().positive() }),
      execute: async (input) => { const { id } = await proposeAction("membership_pause", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Confirm in Approvals.` }; },
    }),
    proposeCancelMembership: tool({
      description: "Propose cancelling a membership. immediate=true ends it now; immediate=false uses the standard 60-day notice (they can attend until then). Requires the membership id. Confirmed in Approvals.",
      inputSchema: z.object({ id: z.number().int().positive(), immediate: z.boolean() }),
      execute: async (input) => { const { id } = await proposeAction("membership_cancel", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Confirm in Approvals.` }; },
    }),
    proposeAdjustCharge: tool({
      description: "Propose adjusting ONE month's charge on a membership: LOWER the amount (amountCents, must be <= the current charge), waive it (status='waived', amount 0), or cancel it (status='canceled'). You cannot raise a charge or mark it paid — staff do that in the dashboard. Requires the chargeId (from getMembershipCharges). Confirmed in Approvals.",
      inputSchema: z.object({ chargeId: z.number().int().positive(), amountCents: z.number().int().min(0).optional(), status: z.enum(["waived", "canceled"]).optional(), note: z.string().optional() }),
      execute: async (input) => { const { id } = await proposeAction("charge_adjust", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Confirm in Approvals.` }; },
    }),

    // ── Collect info from staff (Manus-style inline form), then update a file ──
    requestFields: tool({
      description: "When you need the staff member to fill in specific values to proceed (e.g. a student's new date of birth, belt rank, program, phone, or a note), call this to render a small FORM in the chat instead of asking in prose. When they submit, their values come back to you as a message and you continue (usually by proposing the update). Use the SAME field names you'll pass to the update tool (e.g. dob, beltRank, phone). Never request card numbers, passwords, or secrets here.",
      inputSchema: z.object({
        title: z.string().min(1).max(120).describe("what this form is for, e.g. 'Update Maya Rivera's file'"),
        fields: z.array(z.object({
          name: z.string().min(1).max(60),
          label: z.string().min(1).max(120),
          type: z.enum(["text", "number", "date", "select", "textarea"]).optional(),
          options: z.array(z.string()).max(30).optional().describe("choices for a select field"),
          placeholder: z.string().max(120).optional(),
          required: z.boolean().optional(),
        })).min(1).max(10),
        note: z.string().max(300).optional(),
      }),
      execute: async (input) => ({ formRequested: true, ...input }),
    }),
    proposeUpdateStudent: tool({
      description: "Propose updating a student's file. Requires the student id (from findPerson → students[].id). Include ONLY the fields to change. Applies only after the Approve button. Editable fields: name, email, phone, dob (YYYY-MM-DD), status, programs, emergencyContact. Belt rank is NOT here: use proposePromoteBelt (or tell staff to use the belt dropdown) so rank changes keep validation + history.",
      inputSchema: z.object({
        studentId: z.number().int().positive(),
        name: z.string().max(255).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(40).optional(),
        dob: z.string().max(20).optional(),
        status: z.string().max(50).optional(),
        programs: z.string().max(255).optional(),
        emergencyContact: z.string().max(255).optional(),
      }),
      execute: async (input) => { const { id } = await proposeAction("student_update", input, "assistant"); return { proposed: true, pendingActionId: id, note: `Proposed (#${id}). Approve to apply.` }; },
    }),
  };
}

export const SYSTEM_PROMPT = `You are the TMA (Top Martial Arts Suwanee) admin assistant. You help the front-desk staff and owner by answering questions about leads, students, and payments using the provided tools.

Voice — talk like a helpful coworker at the front desk, not a manual:
- Sound like a real person. Warm, plain, and direct. Contractions are good. A little personality is fine.
- Answer the actual question first, in a sentence or two. Don't preface with restating the question or listing what you're about to do.
- Keep it short. No bullet dumps for a simple answer, no corporate filler ("Certainly!", "I'd be happy to assist"), no walls of text.
- When you pull from the playbook or a policy, just tell them the answer in your own words like you already knew it. Do NOT read the SOP back verbatim, quote it, or cite section names/numbers unless they ask for the exact wording or source.
- Never lecture. If there's a rule or a limit, mention it in one plain clause and move on, don't recite the whole policy around it.
- It's fine to be a little casual: "Yep, Elias is paid up through March." beats "The membership record indicates payment status is current."
- Still never make up names, numbers, dates, or statuses. Human tone, real data.
- Language: you are fluent in English and Korean. By default reply in the same language the user writes in. If a response-language instruction is given below, follow it exactly regardless of the language they typed. Numbers, names, and money stay as-is.
- Never use em dashes or en dashes. Break sentences with periods, commas, colons, or parentheses instead. A minus sign for a figure (for example -15%) is fine.

Rules:
- Use tools to get live data. Never invent names, amounts, dates, or statuses. If a tool returns nothing, say so.
- For "how do I..." / policy / procedure questions (no-shows, which link to send, camp waiver checks, daily routine, escalation), use answerFromPlaybook to ground yourself, then answer in your own plain words like a coworker who knows the ropes. Don't invent policy, but don't read the snippet back verbatim or cite section names unless they ask for the exact source.
- For revenue, collected-money, or total-sales questions with a stated calendar year, immediately call getRevenueSummary using that year's Jan 1 through Dec 31 dates. Do not ask for clarification when the year is stated.
- For past-due tuition questions, immediately call listPastDueTuition. For missing afterschool-waiver questions, immediately call listMissingAfterschoolWaivers.
- To pull up / open / show a specific student's profile, call openMemberProfile (with the membership id from findMembership, or a name/email). It pops their profile open right in the dashboard for the staff member; briefly confirm you opened it.
- Things you CAN do (each as a PROPOSAL the staff member approves — you never execute directly): draft/send an email; create a membership; change a membership's program/plan/tuition; set a recurring discount; pause or cancel a membership; and adjust one month's charge (edit / waive / cancel). When the user asks for one of these, DO IT: ask any needed follow-up (which program? which month? prorate?), use findMembership / getMembershipCharges to get the id, then propose it. Each proposal shows an Approve button right here in this chat (as well as in the Approvals view); tell the user they can approve it here, and that nothing changes until they do.
- Only give step-by-step directions for things you CANNOT do yourself, OR when the user explicitly asks "how do I...". If you explain how to do something that you can also do yourself, end by asking whether they'd like you to do it for them.
- Cards on file: you can list a family's cards (listMemberCards), give a secure link to add/update a card (openCardSetupLink — the card is entered on Stripe's page, NEVER typed to you or in the app), and propose making a card primary or removing one (approved via the Approve button). Never ask for or accept a card number; if someone offers one, tell them to enter it on the secure Stripe page instead.
- Waivers: to check if a specific student has their waiver(s) on file (martial-arts and/or afterschool), use checkWaiverStatus; for the global list of afterschool signups missing a waiver, use listMissingAfterschoolWaivers. Staff attach/collect waivers from the member's popup in the dashboard.
- Belts: use getBeltStatus for a student's rank + testing readiness. You can propose a one-rank promotion with proposePromoteBelt (applied after Approve). Do NOT use proposeUpdateStudent to change a belt (it skips rank-order + history); to jump to a specific rank, tell the user to use the belt dropdown in the member popup.
- To update a student's file (DOB, belt rank, program, contact, status, emergency contact): get the student id via findPerson, then propose the change with proposeUpdateStudent (applies after Approve). If you're missing the new values, call requestFields FIRST to pop a small form for the staff to fill (use field names dob/beltRank/phone/etc.), and when their values come back, propose the update. Use requestFields for gathering any record values, never for card numbers or secrets.
- You cannot issue refunds or take actions you have no tool for; for those, say a staff member must do it in the dashboard. To pull up a member, use openMemberProfile.
- If a person, date range, or amount is ambiguous, ask a brief clarifying question instead of guessing.
- Money: only report amounts the tools returned. Never mention card numbers (you never receive them).
- Be concise and human. When money or a specific record is involved, still show the actual number/name you used so staff can double-check, but weave it into a normal sentence instead of dumping a table.
- Today's date context comes from the tools; if you need "this year", use Jan 1 to Dec 31 of the current year and say which range you used.`;

/** Run the assistant ONCE, non-streaming, and return its final text. Used by the
 *  voice agent's single `run_assistant` tool: same model, same 26 tools, same safety
 *  (a change still becomes an Approve card via the confirm-flow — voice never executes
 *  a write directly). The voice layer just speaks whatever text this returns. */
export async function runAssistantText(userText: string, origin: string): Promise<string> {
  const result = await generateText({
    model: assistantOpenAI(ENV.assistantModel),
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
    tools: buildTools({ origin }),
    stopWhen: stepCountIs(6),
    // Low reasoning effort = much faster first token; these are lookup/CRUD tasks,
    // not hard reasoning. Overridable model still applies.
    providerOptions: { openai: { reasoningEffort: "low" } },
  });
  return (result.text || "").trim() || "Done.";
}

// ─── Endpoint ────────────────────────────────────────────────────────────────
export async function handleAssistant(req: Request, res: Response): Promise<void> {
  // Hard gate: the assistant always requires an admin session (it exposes all
  // data). This is NOT kill-switched — it is a new endpoint, so requiring login
  // cannot lock anyone out of anything they had before.
  if (!adminEmailFromRequest(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!ENV.openaiApiKey) {
    res.status(503).json({ error: "assistant not configured (set OPENAI_API_KEY)" });
    return;
  }

  const body = (req.body ?? {}) as { messages?: UIMessage[]; message?: UIMessage; lang?: string };
  const messages = body.messages ?? (body.message ? [body.message] : []);
  if (!messages.length) {
    res.status(400).json({ error: "no messages" });
    return;
  }
  // Optional response-language override from the EN/KO toggle in the panel.
  const langInstruction = body.lang === "ko" ? "\n\nRESPONSE LANGUAGE: Reply ONLY in Korean, regardless of the language the user typed in."
    : body.lang === "en" ? "\n\nRESPONSE LANGUAGE: Reply ONLY in English, regardless of the language the user typed in."
    : "";

  try {
    const proto = String((req.headers["x-forwarded-proto"] as string) || "https").split(",")[0];
    const host = req.headers.host || "tmatkd.com";
    const origin = `${proto}://${host}`;
    const modelMessages = await convertToModelMessages(messages);
    const result = streamText({
      model: assistantOpenAI(ENV.assistantModel),
      system: SYSTEM_PROMPT + langInstruction,
      messages: modelMessages,
      tools: buildTools({ origin }),
      stopWhen: stepCountIs(6),
      // Low reasoning effort = much faster first token; these are lookup/CRUD tasks.
      providerOptions: { openai: { reasoningEffort: "low" } },
    });
    result.pipeUIMessageStreamToResponse(res);
  } catch (e) {
    console.error("[assistant] error:", e);
    if (!res.headersSent) res.status(500).json({ error: "assistant error" });
  }
}
