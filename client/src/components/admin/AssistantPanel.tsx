import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Loader2, Send, Sparkles, X, Search as SearchIcon, ShieldCheck, UserSquare, Check, Ban, ExternalLink, CreditCard, PencilLine, Undo2 } from "lucide-react";

// Fields staff may edit on a proposed action before approving. Money fields are
// shown in dollars and sent as cents; the server re-validates through the same
// catalog/bounds guardrails, so an edit can't slip past them.
type EditField = { name: string; label: string; kind: "money" | "text" };
// Contextual follow-up chips keyed by the last tool the assistant used.
const NEXT_CHIPS: Record<string, string[]> = {
  listPastDueTuition: ["Draft a reminder email to the first family", "Who's been past due the longest?"],
  openMemberProfile: ["Show their payment history", "Check their waiver", "What's their belt status?"],
  getBeltStatus: ["Propose the promotion", "Who else is ready to test?"],
  checkWaiverStatus: ["Text the waiver link to the parent", "Who's missing an after-school waiver?"],
  findMembership: ["Show their charges", "Check their waiver"],
  getMembershipCharges: ["Waive this month's charge", "Show their payment history"],
  getRevenueSummary: ["Break it down by month", "Compare to last year"],
  listMissingAfterschoolWaivers: ["Draft a reminder to the first family"],
};

// Render an array-shaped tool output as a compact table instead of leaving the model
// to retype it (which is where miscounts creep in). Returns null for non-table tools.
function ToolTable({ name, output }: { name: string; output: Record<string, unknown> | undefined }) {
  if (!output) return null;
  const cols = (headers: string[], rows: (string | number | null)[][]) => rows.length === 0 ? null : (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-xs">
        <thead><tr className="bg-gray-50 text-left text-gray-500">{headers.map(h => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-gray-100">{r.map((c, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{c ?? "—"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  if (name === "listPastDueTuition" && Array.isArray(output.families)) {
    return cols(["Parent", "Child", "Monthly", "Source"], (output.families as Record<string, unknown>[]).map(f => [String(f.parent ?? ""), String(f.child ?? ""), String(f.monthly ?? "—"), String(f.source ?? "")]));
  }
  if (name === "getMembershipCharges" && Array.isArray(output.charges)) {
    return cols(["Month", "Amount", "Status"], (output.charges as Record<string, unknown>[]).map(c => [String(c.month ?? ""), String(c.amount ?? ""), String(c.status ?? "")]));
  }
  if (name === "listMemberCards" && Array.isArray(output.cards)) {
    return cols(["Card", "Exp", "Primary"], (output.cards as Record<string, unknown>[]).map(c => [String(c.label ?? ""), String(c.exp ?? ""), c.primary ? "✓" : ""]));
  }
  return null;
}

const EDITABLE_FIELDS: Record<string, EditField[]> = {
  membership_change: [{ name: "monthlyAmountCents", label: "Monthly tuition", kind: "money" }, { name: "planLabel", label: "Plan label", kind: "text" }],
  membership_create: [{ name: "monthlyAmountCents", label: "Monthly tuition", kind: "money" }, { name: "planLabel", label: "Plan label", kind: "text" }],
  membership_discount: [{ name: "discountCents", label: "Discount", kind: "money" }, { name: "note", label: "Note", kind: "text" }],
  charge_adjust: [{ name: "amountCents", label: "Amount", kind: "money" }, { name: "note", label: "Note", kind: "text" }],
  send_email: [{ name: "subject", label: "Subject", kind: "text" }],
};
import { useMemberDock } from "@/components/admin/MemberDock";
import { VoiceBar } from "@/components/admin/VoiceAssistant";

/**
 * AI assistant panel. Right-side drawer in the admin. Talks to
 * POST /api/admin/assistant (streaming, tool-calling), hard-gated on the admin
 * session. It can look things up, open a student's profile as a docked panel
 * (openMemberProfile → auto-pops the dock), and PROPOSE money/email actions that
 * the staff member approves inline here (Approve/Reject) or in the Approvals view.
 * Non-blocking drawer (no full-screen backdrop) so docked member panels stay usable
 * alongside it. See docs/AI_ASSISTANT_SPEC.md.
 */

const SUGGESTED = [
  "Open Aiden Rampey's profile",
  "Give the Rampey siblings a $20/mo discount",
  "Show past-due tuition",
  "How do I handle a trial no-show?",
];

// Tool outputs the chat renders as interactive cards rather than a "Checked X" chip.
type FieldSpec = { name: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea"; options?: string[]; placeholder?: string; required?: boolean };
type ToolOutput = { pendingActionId?: number; opened?: boolean; membershipId?: number; student?: string; setupUrl?: string; formRequested?: boolean; title?: string; fields?: FieldSpec[]; note?: string } | undefined;

export default function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const dock = useMemberDock();
  const utils = trpc.useUtils();
  const openedRef = useRef<Set<string>>(new Set());
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/admin/assistant" }),
  });

  const [lang, setLang] = useState<"en" | "ko">("en");
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Auto-pop the docked member panel when the assistant calls openMemberProfile
  // (once per tool call). The button below also lets staff re-open it.
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const part of m.parts as Array<{ type: string; state?: string; output?: ToolOutput; toolCallId?: string }>) {
        if (part.type === "tool-openMemberProfile" && part.state === "output-available" && part.output?.opened && part.output?.membershipId) {
          const key = part.toolCallId ?? `${m.id}:${part.output.membershipId}`;
          if (!openedRef.current.has(key)) { openedRef.current.add(key); dock.open(part.output.membershipId, part.output.student); }
        }
      }
    }
  }, [messages, dock]);

  if (!open) return null;

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t }, { body: { lang } });
    setInput("");
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 z-30 w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl border-l border-gray-200">
      {/* Header */}
      <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-100 shrink-0">
        <Sparkles className="w-4 h-4 text-[#1a2d5a]" />
        <div className="flex-1">
          <div className="text-sm font-bold text-[#1a2d5a]">TMA Assistant</div>
          <div className="text-[10px] text-gray-400">Looks things up, opens profiles, and proposes changes you approve here.</div>
        </div>
        {/* Reply-language toggle (also applies to voice via its own mirroring). */}
        <div className="flex items-center rounded-full border border-gray-200 overflow-hidden text-[11px] font-semibold shrink-0">
          {(["en", "ko"] as const).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-2 py-1 ${lang === l ? "bg-[#1a2d5a] text-white" : "text-gray-500 hover:bg-gray-50"}`}>
              {l === "en" ? "EN" : "한국어"}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
      </div>

      {/* Voice (English + Korean). Proposals still land as Approve cards below. */}
      <VoiceBar onToolRun={() => utils.actions.listPending.invalidate()} />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 pt-8 space-y-4">
            <Sparkles className="w-8 h-8 mx-auto opacity-30" />
            <p className="text-sm">Ask about students, leads, or payments. I can open a profile or propose a change for you to approve.</p>
            <div className="flex flex-col gap-2 max-w-xs mx-auto">
              {SUGGESTED.map(s => (
                <button key={s} onClick={() => submit(s)}
                  className="text-xs text-left text-[#1a2d5a] border border-gray-200 rounded-lg px-3 py-2 hover:border-[#1a2d5a]/40">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(m => (
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-[#1a2d5a] text-white">
                  {m.parts.map((part, i) => part.type === "text" ? <span key={i}>{part.text}</span> : null)}
                </div>
              </div>
            ) : (
              <div key={m.id} className="space-y-2">
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return <div key={i} className="bg-gray-100 text-gray-900 rounded-lg px-3 py-2 text-sm prose prose-sm max-w-none"><Markdown mode="static">{part.text}</Markdown></div>;
                  }
                  if (part.type.startsWith("tool-")) {
                    const name = part.type.replace("tool-", "");
                    const done = (part as { state?: string }).state === "output-available";
                    const output = (part as { output?: ToolOutput }).output;
                    if (done && name === "openMemberProfile" && output?.membershipId) {
                      return <OpenProfileButton key={i} membershipId={output.membershipId} student={output.student ?? "member"} />;
                    }
                    if (done && name === "openCardSetupLink" && output?.setupUrl) {
                      return (
                        <a key={i} href={output.setupUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a2d5a] bg-[#1a2d5a]/5 border border-[#1a2d5a]/25 rounded-lg px-3 py-2 hover:bg-[#1a2d5a]/10">
                          <CreditCard className="w-4 h-4" /> Open secure card page <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                        </a>
                      );
                    }
                    if (done && name === "requestFields" && output?.formRequested && output.fields) {
                      return <FormRequestCard key={i} title={output.title ?? "Details"} fields={output.fields} note={output.note} disabled={busy} onSubmit={(text) => submit(text)} />;
                    }
                    if (done && output?.pendingActionId) {
                      return <ApprovalCard key={i} actionId={output.pendingActionId} />;
                    }
                    if (done) {
                      const rendered = ToolTable({ name, output: output as unknown as Record<string, unknown> });
                      if (rendered) return <div key={i}>{rendered}</div>;
                    }
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-gray-500">
                        {done ? <SearchIcon className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
                        {done ? `Checked ${name}` : `Checking ${name}...`}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )
          ))
        )}
        {!busy && (() => {
          // Contextual follow-up chips based on the last tool the assistant used.
          const lastAssistant = [...messages].reverse().find(mm => mm.role === "assistant");
          if (!lastAssistant) return null;
          const lastTool = [...(lastAssistant.parts as Array<{ type?: string }>)].reverse().find(p => p.type?.startsWith("tool-"))?.type?.replace("tool-", "");
          const chips = lastTool ? (NEXT_CHIPS[lastTool] ?? []) : [];
          if (chips.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-1.5">
              {chips.map(c => (
                <button key={c} onClick={() => submit(c)} className="text-[11px] text-[#1a2d5a] border border-[#1a2d5a]/25 bg-[#1a2d5a]/[0.03] rounded-full px-2.5 py-1 hover:bg-[#1a2d5a]/10">{c}</button>
              ))}
            </div>
          );
        })()}
        {busy && messages[messages.length - 1]?.role === "user" && (
          <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...</div>
        )}
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">Error: {error.message}. (Is OPENAI_API_KEY set and are you logged in?)</div>}
      </div>

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); submit(input); }} className="border-t border-gray-100 p-3 shrink-0">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} disabled={busy}
            placeholder="Ask, open a profile, or request a change..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30" />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} className="shrink-0 bg-[#1a2d5a] hover:bg-[#142347]">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Manus-style inline form: the assistant asks for fields, staff fill them, and on
 *  submit the values go back as a message so the model continues (e.g. proposes the
 *  update). Non-secret fields only — card numbers never come through here. */
function FormRequestCard({ title, fields, note, disabled, onSubmit }: { title: string; fields: FieldSpec[]; note?: string; disabled: boolean; onSubmit: (text: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const set = (n: string, v: string) => setVals(s => ({ ...s, [n]: v }));
  const doSubmit = () => {
    const missing = fields.filter(f => f.required && !(vals[f.name] ?? "").trim());
    if (missing.length) { toast.error(`Fill in: ${missing.map(f => f.label).join(", ")}`); return; }
    const lines = fields.filter(f => (vals[f.name] ?? "").trim()).map(f => `- ${f.label}: ${vals[f.name].trim()}`);
    if (!lines.length) { toast.error("Enter at least one value."); return; }
    onSubmit(`Here are the values for "${title}":\n${lines.join("\n")}`);
    setSubmitted(true);
  };
  const inp = "mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30";
  if (submitted) return <div className="border border-gray-200 rounded-lg p-3 text-xs text-gray-500 flex items-center gap-2"><Check className="w-3.5 h-3.5 text-green-600" /> Submitted "{title}".</div>;
  return (
    <div className="border border-[#1a2d5a]/20 bg-white rounded-lg p-3 text-sm">
      <div className="font-semibold text-[#1a2d5a] mb-2">{title}</div>
      {note ? <div className="text-xs text-gray-500 mb-2">{note}</div> : null}
      <div className="space-y-2">
        {fields.map(f => (
          <label key={f.name} className="block text-xs font-medium text-gray-600">
            {f.label}{f.required ? " *" : ""}
            {f.type === "textarea" ? (
              <textarea rows={2} value={vals[f.name] ?? ""} onChange={e => set(f.name, e.target.value)} placeholder={f.placeholder} className={inp} />
            ) : f.type === "select" ? (
              <select value={vals[f.name] ?? ""} onChange={e => set(f.name, e.target.value)} className={inp}>
                <option value="">— choose —</option>
                {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={vals[f.name] ?? ""} onChange={e => set(f.name, e.target.value)} placeholder={f.placeholder} className={inp} />
            )}
          </label>
        ))}
      </div>
      <button onClick={doSubmit} disabled={disabled} className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a2d5a] hover:bg-[#142347] rounded px-3 py-1.5 disabled:opacity-50">Submit</button>
    </div>
  );
}

function OpenProfileButton({ membershipId, student }: { membershipId: number; student: string }) {
  const dock = useMemberDock();
  return (
    <button onClick={() => dock.open(membershipId, student)}
      className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a2d5a] bg-[#1a2d5a]/5 border border-[#1a2d5a]/25 rounded-lg px-3 py-2 hover:bg-[#1a2d5a]/10">
      <UserSquare className="w-4 h-4" /> Open {student}'s profile <ExternalLink className="w-3.5 h-3.5 opacity-60" />
    </button>
  );
}

/** Inline Approve/Reject for a proposed action, right in the chat. Reads the exact
 *  effect from actions.get and reflects status after the staff member acts. */
function ApprovalCard({ actionId }: { actionId: number }) {
  const utils = trpc.useUtils();
  const q = trpc.actions.get.useQuery({ id: actionId });
  const refreshAll = () => {
    utils.actions.get.invalidate({ id: actionId });
    utils.actions.listPending.invalidate();
    utils.members.list.invalidate();
    utils.members.overview.invalidate();
    utils.memberships.invalidate();
  };
  const confirm = trpc.actions.confirm.useMutation({
    onSuccess: (r) => { if (r?.status === "executed") toast.success("Approved and applied."); else toast.error(`Action ${r?.status ?? "failed"}.`); refreshAll(); },
    onError: (e) => toast.error(e.message ?? "Could not apply."),
  });
  const reject = trpc.actions.reject.useMutation({
    onSuccess: () => { toast.success("Rejected."); refreshAll(); },
    onError: (e) => toast.error(e.message ?? "Could not reject."),
  });
  const undo = trpc.actions.undo.useMutation({
    onSuccess: () => { toast.success("Undone."); refreshAll(); },
    onError: (e) => toast.error(e.message ?? "Could not undo."),
  });
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const a = q.data;
  if (q.isLoading) return <div className="border border-gray-200 rounded-lg p-3 text-xs text-gray-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading proposal...</div>;
  if (!a) return <div className="border border-gray-200 rounded-lg p-3 text-xs text-gray-400">Proposal #{actionId} not found.</div>;

  const pending = a.status === "proposed";
  const busy = confirm.isPending || reject.isPending;
  const statusView = a.status === "executed" ? { label: "Approved and applied", cls: "text-green-700", Icon: Check }
    : a.status === "reversed" ? { label: "Undone", cls: "text-gray-500", Icon: Ban }
    : a.status === "rejected" ? { label: "Rejected", cls: "text-gray-500", Icon: Ban }
    : a.status === "failed" ? { label: "Failed", cls: "text-red-600", Icon: Ban }
    : { label: a.status, cls: "text-gray-500", Icon: ShieldCheck };
  const StatusIcon = statusView.Icon;

  const editable = EDITABLE_FIELDS[a.actionType] ?? [];
  const payload = (a.payload ?? {}) as Record<string, unknown>;
  const fieldValue = (f: EditField): string => {
    if (f.name in edits) return edits[f.name];
    const raw = payload[f.name];
    if (raw === undefined || raw === null) return "";
    return f.kind === "money" ? (Number(raw) / 100).toFixed(0) : String(raw);
  };
  const approveEdited = () => {
    const override: Record<string, unknown> = {};
    for (const f of editable) {
      const v = fieldValue(f).trim();
      if (v === "") continue;
      override[f.name] = f.kind === "money" ? Math.round(parseFloat(v.replace(/[^0-9.]/g, "")) * 100) : v;
    }
    confirm.mutate({ id: actionId, overridePayload: override });
  };

  return (
    <div className="border border-[#1a2d5a]/20 bg-[#1a2d5a]/[0.04] rounded-lg p-3 text-sm">
      <div className="font-semibold text-[#1a2d5a] flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 shrink-0" /> {a.title || "Proposed change"}</div>
      {a.preview ? <div className="text-xs text-gray-600 whitespace-pre-wrap mt-1">{a.preview}</div> : null}
      {pending && editing && editable.length > 0 && (
        <div className="mt-2 space-y-2 border border-gray-200 rounded-lg p-2 bg-white">
          {editable.map(f => (
            <label key={f.name} className="flex items-center gap-2 text-xs text-gray-600">
              <span className="w-28 shrink-0">{f.label}</span>
              <div className="flex items-center gap-1 flex-1">
                {f.kind === "money" && <span className="text-gray-400">$</span>}
                <input value={fieldValue(f)} onChange={e => setEdits(s => ({ ...s, [f.name]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs" />
              </div>
            </label>
          ))}
          <div className="text-[10px] text-gray-400">Edited values are re-checked against the catalog rules before applying.</div>
        </div>
      )}
      {pending ? (
        <div className="flex flex-wrap gap-2 mt-2.5">
          <button onClick={() => (editing ? approveEdited() : confirm.mutate({ id: actionId }))} disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded px-3 py-1.5 disabled:opacity-50">
            {confirm.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {editing ? "Approve edited" : "Approve"}
          </button>
          {editable.length > 0 && (
            <button onClick={() => setEditing(v => !v)} disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a2d5a] border border-[#1a2d5a]/30 hover:bg-[#1a2d5a]/5 rounded px-3 py-1.5 disabled:opacity-50">
              <PencilLine className="w-3.5 h-3.5" /> {editing ? "Cancel edit" : "Edit"}
            </button>
          )}
          <button onClick={() => reject.mutate({ id: actionId })} disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:border-red-200 hover:text-red-600 rounded px-3 py-1.5 disabled:opacity-50">
            <Ban className="w-3.5 h-3.5" /> Reject
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-2">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${statusView.cls}`}><StatusIcon className="w-3.5 h-3.5" /> {statusView.label}</div>
          {a.status === "executed" && a.undoable && (
            <button onClick={() => undo.mutate({ id: actionId })} disabled={undo.isPending}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-[#1a2d5a] underline disabled:opacity-50">
              {undo.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />} Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
