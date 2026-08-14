import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Search, Loader2, User, GraduationCap, ClipboardList, FileText, CornerDownLeft } from "lucide-react";

/**
 * Admin command palette (Cmd/Ctrl-K or "/"). Finds people (leads, students,
 * afterschool roster) via a server-side LIKE search, plus jumps to any admin
 * page. Records deep-link to their view; a lead opens its detail dialog via the
 * ?focus=lead:<id> param that LeadsPipeline reads.
 */

const PAGES: { label: string; href: string; keywords: string }[] = [
  { label: "Today", href: "/admin/today", keywords: "home dashboard daily" },
  { label: "Members", href: "/admin/members", keywords: "students families memberships enrolled tuition billing" },
  { label: "Trials", href: "/admin/trials", keywords: "free intro 3-week trial 99 convert" },
  { label: "Leads", href: "/admin/leads", keywords: "pipeline prospects crm" },
  { label: "Calendar", href: "/admin/calendar", keywords: "schedule trials" },
  { label: "After-School", href: "/admin/afterschool-roster", keywords: "pickup school roster afterschool" },
  { label: "Camps", href: "/admin/camps", keywords: "summer spring break day camp registrations signup" },
  { label: "Pro Shop", href: "/admin/orders", keywords: "orders proshop payments one-off supply field trip uniform gear" },
  { label: "Invoices", href: "/admin/invoices", keywords: "invoice receipt generator" },
  { label: "Forms & Waivers", href: "/admin/waivers", keywords: "forms signed waiver" },
  { label: "Approvals", href: "/admin/approvals", keywords: "confirm pending assistant" },
  { label: "Front Desk Playbook", href: "/admin/playbook", keywords: "help guide how do i" },
  { label: "Links", href: "/admin/links", keywords: "share qr url" },
  { label: "Today's Calls", href: "/admin/calls", keywords: "call queue phone outbound" },
  { label: "Trial Check-in", href: "/admin/checkin", keywords: "showed no-show attend" },
  { label: "My Tasks", href: "/admin/tasks", keywords: "todo" },
  { label: "Flyer Studio", href: "/admin/studio", keywords: "media flyer assets studio" },
  { label: "Email Sequences", href: "/admin/sequences", keywords: "templates automation" },
  { label: "Routing Rules", href: "/admin/rules", keywords: "intake" },
  { label: "Ad Performance", href: "/admin/ads", keywords: "facebook meta" },
  { label: "Automation", href: "/admin/controls", keywords: "kill switch" },
  { label: "Call History", href: "/admin/call-log", keywords: "history recordings call log" },
  { label: "Voice Test", href: "/admin/voice-test", keywords: "retell" },
];

type Item = { kind: "page" | "record"; type?: string; label: string; sub?: string; href: string };

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(""); setDebounced(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 160);
    return () => clearTimeout(t);
  }, [q]);

  const recordsQ = trpc.search.query.useQuery({ q: debounced }, { enabled: debounced.length >= 1, staleTime: 5000 });

  const pageItems: Item[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? PAGES.filter(p => (`${p.label} ${p.keywords}`).toLowerCase().includes(needle))
      : PAGES.slice(0, 6);
    return list.map(p => ({ kind: "page" as const, label: p.label, href: p.href }));
  }, [q]);

  const recordItems: Item[] = (recordsQ.data ?? []).map(r => ({
    kind: "record" as const, type: r.type, label: r.title, sub: r.subtitle, href: r.href,
  }));
  const items = useMemo(() => [...recordItems, ...pageItems].slice(0, 40), [recordItems, pageItems]);

  useEffect(() => { setActive(0); }, [debounced, q]);

  if (!open) return null;

  const go = (it?: Item) => {
    const target = it ?? items[active];
    if (!target) return;
    navigate(target.href);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  const iconFor = (it: Item) =>
    it.kind === "page" ? <FileText className="w-4 h-4 text-gray-400" />
    : it.type === "lead" ? <User className="w-4 h-4 text-[#1a2d5a]" />
    : it.type === "student" ? <GraduationCap className="w-4 h-4 text-[#1a2d5a]" />
    : <ClipboardList className="w-4 h-4 text-[#1a2d5a]" />;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search people and pages..."
            className="flex-1 py-3.5 text-sm outline-none bg-transparent"
          />
          {recordsQ.isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-300" />}
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">{debounced ? "No matches." : "Type to search people or pages."}</div>
          ) : (
            items.map((it, i) => (
              <button
                key={`${it.kind}-${it.type ?? "page"}-${it.href}-${i}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left ${i === active ? "bg-[#1a2d5a]/8" : "hover:bg-gray-50"}`}
              >
                {iconFor(it)}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-900 truncate">{it.label}</div>
                  {it.sub && <div className="text-xs text-gray-500 truncate">{it.sub}</div>}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">{it.kind === "page" ? "Page" : it.type}</span>
                {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400 flex items-center gap-3">
          <span>↑↓ to navigate</span><span>↵ to open</span><span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
