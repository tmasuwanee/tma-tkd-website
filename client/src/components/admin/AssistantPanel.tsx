import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Sparkles, X, Search as SearchIcon } from "lucide-react";

/**
 * Read-only AI assistant panel. Right-side drawer in the admin. Talks to
 * POST /api/admin/assistant (streaming, tool-calling), which is hard-gated on the
 * admin session. Uses the default transport so the full conversation is sent
 * (multi-turn context). See docs/AI_ASSISTANT_SPEC.md.
 */

const SUGGESTED = [
  "What has the Smith family paid this year?",
  "Show past-due tuition",
  "Who is missing an afterschool waiver?",
  "How do I handle a trial no-show?",
];

export default function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/admin/assistant" }),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  if (!open) return null;

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-gray-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-100 shrink-0">
          <Sparkles className="w-4 h-4 text-[#1a2d5a]" />
          <div className="flex-1">
            <div className="text-sm font-bold text-[#1a2d5a]">TMA Assistant</div>
            <div className="text-[10px] text-gray-400">Read-only. Looks things up; can't change data or send.</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 pt-8 space-y-4">
              <Sparkles className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-sm">Ask about students, leads, or payments.</p>
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
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-[#1a2d5a] text-white" : "bg-gray-100 text-gray-900"}`}>
                  {m.parts.map((part, i) => {
                    if (part.type === "text") {
                      return m.role === "user"
                        ? <span key={i}>{part.text}</span>
                        : <div key={i} className="prose prose-sm max-w-none"><Markdown mode="static">{part.text}</Markdown></div>;
                    }
                    if (part.type.startsWith("tool-")) {
                      const name = part.type.replace("tool-", "");
                      const done = (part as { state?: string }).state === "output-available";
                      return (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-500 my-1">
                          {done ? <SearchIcon className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
                          {done ? `Checked ${name}` : `Checking ${name}...`}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
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
              placeholder="Ask about a family, payment, waiver..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30" />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} className="shrink-0 bg-[#1a2d5a] hover:bg-[#142347]">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
