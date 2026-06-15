import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, FileSignature, X } from "lucide-react";

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
  const list = trpc.waiver.list.useQuery();
  const [open, setOpen] = useState<any | null>(null);
  const waivers = (list.data ?? []) as any[];

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
        waivers.map(w => {
          const kids = parseArr(w.students);
          return (
            <button key={w.id} onClick={() => setOpen(w)}
              className="w-full text-left bg-white border border-gray-200 rounded-lg p-3.5 hover:border-[#1a2d5a]/40 transition-colors flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-gray-800 text-sm truncate">
                  {kids.map((k: any) => k.name).filter(Boolean).join(", ") || w.parentName}
                </div>
                <div className="text-xs text-gray-500 truncate">{w.parentName} · {w.phone}</div>
              </div>
              <div className="text-xs text-gray-400 shrink-0">signed {w.signedDate}</div>
            </button>
          );
        })
      )}

      {open ? <WaiverModal w={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function WaiverModal({ w, onClose }: { w: any; onClose: () => void }) {
  const kids = parseArr(w.students);
  const interests = parseArr(w.interests);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-[#1a2d5a]">Signed Waiver</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <Field label="Parent / Guardian" value={w.parentName} />
          <Field label="Email" value={w.email} />
          <Field label="Phone" value={w.phone} />
          {w.address ? <Field label="Address" value={w.address} /> : null}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Students</div>
            {kids.length ? kids.map((k: any, i: number) => (
              <div key={i} className="text-gray-800">{k.name}{k.dob ? <span className="text-gray-400"> · DOB {k.dob}</span> : null}</div>
            )) : <div className="text-gray-400">—</div>}
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
