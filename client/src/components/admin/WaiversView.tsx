import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Loader2, FileSignature, X, Trash2, Search, Download } from "lucide-react";

const INTEREST_LABELS: Record<string, string> = {
  better_listening: "Better listening",
  improved_behavior: "Improved behavior",
  fun: "Fun",
  fitness: "Fitness",
  self_defense: "Self-defense",
  confidence: "Confidence",
};

function parseArr(s: any): any[] {
  try { const a = JSON.parse(s ?? "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Signed waivers "on file". List → click → full record incl. the signature image.
export default function WaiversView() {
  const utils = trpc.useUtils();
  const list = trpc.waiver.list.useQuery();
  const del = trpc.waiver.delete.useMutation({ onSuccess: () => utils.waiver.list.invalidate() });
  const [open, setOpen] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const waivers = (list.data ?? []) as any[];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? waivers.filter(w => {
        const kids = parseArr(w.students).map((k: any) => k.name).join(" ");
        return `${w.parentName} ${w.email ?? ""} ${w.phone ?? ""} ${kids}`.toLowerCase().includes(q);
      })
    : waivers;

  const remove = (w: any) => {
    const who = parseArr(w.students).map((k: any) => k.name).filter(Boolean).join(", ") || w.parentName;
    if (confirm(`Delete the signed waiver for ${who}? This cannot be undone.`)) {
      del.mutate({ id: w.id });
      if (open?.id === w.id) setOpen(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {list.isLoading ? (
        <div className="text-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : waivers.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded border border-dashed">
          <FileSignature className="w-6 h-6 mx-auto mb-2 opacity-50" />
          No signed waivers yet. Share <span className="font-mono">tmatkd.com/enroll</span> or the QR code.
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, child, email, or phone" className="pl-9" />
            {search ? <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button> : null}
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No waivers match your search.</div>
          ) : filtered.map(w => {
          const kids = parseArr(w.students);
          const isTransportation = w.source === "transportation";
          return (
            <div key={w.id}
              className="bg-white border border-gray-200 rounded-lg p-3.5 hover:border-[#1a2d5a]/40 transition-colors flex items-center justify-between gap-3">
              <button onClick={() => setOpen(w)} className="flex-1 min-w-0 text-left">
                <div className="font-semibold text-gray-800 text-sm truncate flex items-center gap-2">
                  <span className="truncate">{kids.map((k: any) => k.name).filter(Boolean).join(", ") || w.parentName}</span>
                  {isTransportation ? (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider bg-[#1a2d5a]/10 text-[#1a2d5a] rounded-full px-2 py-0.5">
                      Transportation
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-500 truncate">{w.parentName} · {w.phone}</div>
              </button>
              <div className="text-xs text-gray-400 shrink-0">signed {w.signedDate}</div>
              {w.pdfUrl ? (
                <a href={w.pdfUrl} target="_blank" rel="noopener noreferrer" title="Download signed PDF"
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-[#1a2d5a] hover:text-white border border-[#1a2d5a]/30 hover:bg-[#1a2d5a] rounded px-2 py-1 transition-colors">
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">PDF</span>
                </a>
              ) : null}
              <button onClick={() => remove(w)} title="Delete waiver"
                className="text-gray-300 hover:text-[#c41e3a] shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        </>
      )}

      {open ? <WaiverModal w={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function WaiverModal({ w, onClose }: { w: any; onClose: () => void }) {
  const kids = parseArr(w.students);
  const interests = parseArr(w.interests);
  const isTransportation = w.source === "transportation";
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-[#1a2d5a]">Signed Waiver</h3>
            {isTransportation ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#1a2d5a]/10 text-[#1a2d5a] rounded-full px-2 py-0.5">
                Transportation
              </span>
            ) : null}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          {w.pdfUrl ? (
            <a href={w.pdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a2d5a] hover:bg-[#12203f] rounded px-3 py-1.5 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Download signed PDF
            </a>
          ) : null}
          <Field label="Parent / Guardian" value={w.parentName} />
          <Field label="Email" value={w.email} />
          <Field label="Phone" value={w.phone} />
          {w.address ? <Field label="Address" value={w.address} /> : null}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Students</div>
            {kids.length ? kids.map((k: any, i: number) => (
              <div key={i} className="text-gray-800">{k.name}{k.dob ? <span className="text-gray-400"> · DOB {k.dob}</span> : null}</div>
            )) : <div className="text-gray-400">-</div>}
          </div>
          {interests.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Goals</div>
              <div className="flex flex-wrap gap-1.5">
                {interests.map((k: string) => (
                  <span key={k} className="text-xs bg-gray-100 rounded-full px-2.5 py-1 text-gray-700">{INTEREST_LABELS[k] ?? k}</span>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Signature</div>
            {w.signatureData ? (
              <img src={w.signatureData} alt="signature" className="border border-gray-200 rounded-lg bg-white max-h-40" />
            ) : <div className="text-gray-400">No drawn signature</div>}
            <div className="text-xs text-gray-500 mt-1">
              {w.signedName ? <>Signed by {w.signedName} · </> : null}{w.signedDate}
            </div>
          </div>
          {w.leadId ? <div className="text-[11px] text-gray-400">Linked to lead #{w.leadId}</div> : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className="text-gray-800">{value}</div>
    </div>
  );
}
