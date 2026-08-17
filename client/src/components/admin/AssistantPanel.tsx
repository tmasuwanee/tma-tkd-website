import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Loader2, Send, Sparkles, X, Search as SearchIcon, ShieldCheck, UserSquare, Check, Ban, ExternalLink, CreditCard } from "lucide-react";
import { useMemberDock } from "@/components/admin/MemberDock";

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
  const openedRef = useRef<Set<string>>(new Set());
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/admin/assistant" }),
  });

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
    sendMessage({ text: t });
    setInput("");
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 z-30 w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-gray-200">
      {/* Header */}
      <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-100 shrink-0">
        <Sparkles className="w-4 h-4 text-[#1a2d5a]" />
        <div className="flex-1">
          <div className="text-sm font-bold text-[#1a2d5a]">TMA Assistant</div>
          <div className="text-[10px] text-gray-400">Looks things up, opens profiles, and proposes changes you approve here.</div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
      </div>

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

  const a = q.data;
  if (q.isLoading) return <div className="border border-gray-200 rounded-lg p-3 text-xs text-gray-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading proposal...</div>;
  if (!a) return <div className="border border-gray-200 rounded-lg p-3 text-xs text-gray-400">Proposal #{actionId} not found.</div>;

  const pending = a.status === "proposed";
  const busy = confirm.isPending || reject.isPending;
  const statusView = a.status === "executed" ? { label: "Approved and applied", cls: "text-green-700", Icon: Check }
    : a.status === "rejected" ? { label: "Rejected", cls: "text-gray-500", Icon: Ban }
    : a.status === "failed" ? { label: "Failed", cls: "text-red-600", Icon: Ban }
    : { label: a.status, cls: "text-gray-500", Icon: ShieldCheck };
  const StatusIcon = statusView.Icon;

  return (
    <div className="border border-[#1a2d5a]/20 bg-[#1a2d5a]/[0.04] rounded-lg p-3 text-sm">
      <div className="font-semibold text-[#1a2d5a] flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 shrink-0" /> {a.title || "Proposed change"}</div>
      {a.preview ? <div className="text-xs text-gray-600 whitespace-pre-wrap mt-1">{a.preview}</div> : null}
      {pending ? (
        <div className="flex gap-2 mt-2.5">
          <button onClick={() => confirm.mutate({ id: actionId })} disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded px-3 py-1.5 disabled:opacity-50">
            {confirm.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
          </button>
          <button onClick={() => reject.mutate({ id: actionId })} disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:border-red-200 hover:text-red-600 rounded px-3 py-1.5 disabled:opacity-50">
            <Ban className="w-3.5 h-3.5" /> Reject
          </button>
        </div>
      ) : (
        <div className={`flex items-center gap-1.5 text-xs font-medium mt-2 ${statusView.cls}`}><StatusIcon className="w-3.5 h-3.5" /> {statusView.label}</div>
      )}
    </div>
  );
}
