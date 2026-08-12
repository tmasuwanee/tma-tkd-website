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
import { streamText, tool, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { ENV } from "./_core/env";
import { adminEmailFromRequest } from "./admin-auth";
import {
  searchLeads, searchStudents, getRosterStudents, getLeadById,
  getAfterschoolRegistrations,
} from "./db";
import { retrievePlaybook } from "./playbook-rag";
import { proposeAction } from "./action-flow";

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

// ─── Read tools (no mutations) ───────────────────────────────────────────────
function buildTools() {
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
      description: "List afterschool families whose recurring tuition subscription is past due.",
      inputSchema: z.object({}),
      execute: async () => {
        const regs = await getAfterschoolRegistrations();
        const pastDue = regs.filter(r => r.subscriptionStatus === "past_due");
        return { count: pastDue.length, families: pastDue.map(r => ({ parent: r.parentName, child: r.childName, email: r.email, phone: r.phone, monthly: r.monthlyAmountCents ? `$${(r.monthlyAmountCents / 100).toFixed(0)}/mo` : null })) };
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
  };
}

export const SYSTEM_PROMPT = `You are the TMA (Top Martial Arts Suwanee) admin assistant. You help the front-desk staff and owner by answering questions about leads, students, and payments using the provided tools.

Rules:
- Use tools to get live data. Never invent names, amounts, dates, or statuses. If a tool returns nothing, say so.
- For "how do I..." / policy / procedure questions (no-shows, which link to send, camp waiver checks, daily routine, escalation), use answerFromPlaybook and answer from the returned snippets, naming the section. Do not invent policy.
- You cannot change data, create memberships, or issue refunds; if asked, explain a staff member must do it in the dashboard.
- You CAN draft an email with draftEmailForApproval, but this only creates a pending draft for a staff member to review and send in Approvals. It does NOT send. Always make clear that nothing was sent and it needs their confirmation.
- If a person, date range, or amount is ambiguous, ask a brief clarifying question instead of guessing.
- Money: only report amounts the tools returned. Never mention card numbers (you never receive them).
- Be concise. Show the specific records/numbers you used so staff can verify.
- Today's date context comes from the tools; if you need "this year", use Jan 1 to Dec 31 of the current year and say which range you used.`;

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

  const body = (req.body ?? {}) as { messages?: UIMessage[]; message?: UIMessage };
  const messages = body.messages ?? (body.message ? [body.message] : []);
  if (!messages.length) {
    res.status(400).json({ error: "no messages" });
    return;
  }

  try {
    const modelMessages = await convertToModelMessages(messages);
    const result = streamText({
      model: openai(ENV.assistantModel),
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools: buildTools(),
      stopWhen: stepCountIs(6),
    });
    result.pipeUIMessageStreamToResponse(res);
  } catch (e) {
    console.error("[assistant] error:", e);
    if (!res.headersSent) res.status(500).json({ error: "assistant error" });
  }
}
