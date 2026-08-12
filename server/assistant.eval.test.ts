/**
 * Assistant routing eval.
 *
 * Checks that the assistant picks the RIGHT tool for a question and reflects the
 * tool's result in its answer. Tools here are MOCKED (canned data, recorded
 * calls) so this needs no DB/Stripe — only an OpenAI key. Without OPENAI_API_KEY
 * it skips (same pattern as stripe.test.ts), so normal `vitest` runs stay green;
 * run it with a key set to guard against prompt/tool-description regressions.
 *
 *   OPENAI_API_KEY=sk-... npx vitest run server/assistant.eval.test.ts
 */
import { describe, it, expect } from "vitest";
import { streamText, tool, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./assistant";

const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_ASSISTANT_MODEL ?? "gpt-4o-mini";

// Mocked tools: same names/shapes as production, canned data, and each records
// that it was called so we can assert routing.
function makeTools(record: string[]) {
  const rec = <T>(name: string, out: T): T => { record.push(name); return out; };
  return {
    findPerson: tool({
      description: "Find leads, students, or afterschool-roster children by name, email, or phone.",
      inputSchema: z.object({ query: z.string() }),
      execute: async () => rec("findPerson", { leads: [{ id: 1, kid: "Maya Rivera", parent: "Jordan Rivera", email: "j@x.com", phone: "770", stage: "contacted", recordType: "prospect" }], students: [], afterschoolRoster: [] }),
    }),
    getPaymentSummary: tool({
      description: "List a family's succeeded payments (and total) for a date range. Dates are YYYY-MM-DD.",
      inputSchema: z.object({ query: z.string(), startDate: z.string().optional(), endDate: z.string().optional() }),
      execute: async () => rec("getPaymentSummary", { count: 2, totalDollars: "560.00", payments: [{ date: "Jan 5, 2026", description: "After School Registration", amount: "$500.00" }, { date: "Feb 1, 2026", description: "Supply fee", amount: "$60.00" }] }),
    }),
    getRevenueSummary: tool({
      description: "Total collected revenue for a date range (all families). Dates are YYYY-MM-DD.",
      inputSchema: z.object({ startDate: z.string(), endDate: z.string() }),
      execute: async () => rec("getRevenueSummary", { paymentCount: 40, totalDollars: "18250.00", from: "2026-01-01", to: "2026-12-31" }),
    }),
    listPastDueTuition: tool({
      description: "List afterschool families whose recurring tuition subscription is past due.",
      inputSchema: z.object({}),
      execute: async () => rec("listPastDueTuition", { count: 1, families: [{ parent: "Sam Lee", child: "Kai Lee", email: "s@x.com", phone: "770", monthly: "$500/mo" }] }),
    }),
    listMissingAfterschoolWaivers: tool({
      description: "List paid afterschool registrations that have no signed waiver linked.",
      inputSchema: z.object({}),
      execute: async () => rec("listMissingAfterschoolWaivers", { count: 1, families: [{ parent: "Dana Fox", child: "Ivy Fox", email: "d@x.com", phone: "770", paidAt: "2026-02-10" }] }),
    }),
    getLeadDetail: tool({
      description: "Get full detail for one lead by its id (from findPerson).",
      inputSchema: z.object({ leadId: z.number().int().positive() }),
      execute: async () => rec("getLeadDetail", { found: true, kid: "Maya Rivera", parent: "Jordan Rivera", stage: "contacted" }),
    }),
    answerFromPlaybook: tool({
      description: "Look up TMA front-desk policy and 'how do I...' procedure guidance from the playbook + SOPs.",
      inputSchema: z.object({ question: z.string() }),
      execute: async () => rec("answerFromPlaybook", { snippets: [{ source: "Front Desk SOP", section: "2. Lead to trial to enrolled", text: "No-show recovery kicks off automatically; follow up personally if no response in 48h." }] }),
    }),
  };
}

const CASES: { q: string; tool: string; contains: string[] }[] = [
  { q: "What has the Rivera family paid this year?", tool: "getPaymentSummary", contains: ["560"] },
  { q: "Who is past due on tuition?", tool: "listPastDueTuition", contains: ["Sam Lee"] },
  { q: "How do I handle a trial no-show?", tool: "answerFromPlaybook", contains: ["48"] },
  { q: "Which afterschool families never signed a waiver?", tool: "listMissingAfterschoolWaivers", contains: ["Dana Fox"] },
  { q: "How much revenue did we collect in 2026?", tool: "getRevenueSummary", contains: ["18"] },
];

describe("assistant routing eval (needs OPENAI_API_KEY)", () => {
  for (const c of CASES) {
    it(`routes "${c.q}" -> ${c.tool}`, async () => {
      if (!KEY) { console.warn("[assistant.eval] OPENAI_API_KEY not set, skipping"); return; }
      const record: string[] = [];
      const result = streamText({
        model: openai(MODEL),
        system: SYSTEM_PROMPT,
        prompt: c.q,
        tools: makeTools(record),
        stopWhen: stepCountIs(5),
      });
      const text = await result.text;
      expect(record).toContain(c.tool);
      for (const sub of c.contains) expect(text.toLowerCase()).toContain(sub.toLowerCase());
    }, 45000);
  }
});
