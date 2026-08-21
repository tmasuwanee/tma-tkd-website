import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, X, Receipt, AlertTriangle } from "lucide-react";

/**
 * Legacy payment-history import — backfills past ZenPlanner payments into the
 * immutable membershipPayments ledger and advances each family's paidThroughDate
 * (so the charge job never re-bills a month they already paid). CSV paste, then a
 * dry-run preview (matched / unmatched / ambiguous) before writing. Idempotent on
 * sourcePaymentId, so re-pasting the same export is a no-op.
 */

type Row = { sourcePaymentId: string; studentName?: string; email?: string; phone?: string; amountCents: number; paidAt: string; paidThroughDate: string; note?: string };

const dollarsToCents = (s: string): number => { const n = parseFloat((s || "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const isoDate = (s: string): string => { const t = (s || "").trim(); const m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : t.slice(0, 10); };

function parseCsv(text: string): { rows: Row[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const rows: Row[] = [];
  const dataLines = lines[0]?.toLowerCase().includes("sourcepaymentid") ? lines.slice(1) : lines;
  dataLines.forEach((line, i) => {
    const c = line.split(",").map(x => x.trim());
    // sourcePaymentId, studentName, email, phone, amount, paidAt, paidThroughDate, note
    const [sourcePaymentId, studentName, email, phone, amount, paidAt, paidThroughDate, note] = c;
    if (!sourcePaymentId) { errors.push(`Line ${i + 1}: missing payment id`); return; }
    const cents = dollarsToCents(amount);
    if (cents < 1) { errors.push(`Line ${i + 1}: bad amount "${amount}"`); return; }
    if (!isoDate(paidThroughDate).match(/^\d{4}-\d{2}-\d{2}$/)) { errors.push(`Line ${i + 1}: bad paid-through date`); return; }
    rows.push({ sourcePaymentId, studentName: studentName || undefined, email: email || undefined, phone: phone || undefined, amountCents: cents, paidAt: isoDate(paidAt), paidThroughDate: isoDate(paidThroughDate), note: note || undefined });
  });
  return { rows, errors };
}

export default function LegacyPaymentImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ totals: any; unmatched: any[]; ambiguous: any[] } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const previewMut = trpc.members.importLegacyPayments.useMutation({
    onSuccess: (r: any) => { if (r.dryRun) setPreview({ totals: r.totals, unmatched: r.unmatched, ambiguous: r.ambiguous }); },
    onError: (e) => toast.error(e.message ?? "Preview failed."),
  });
  const confirmMut = trpc.members.importLegacyPayments.useMutation({
    onSuccess: (r: any) => { if (!r.dryRun) { toast.success(`Imported ${r.inserted} payment${r.inserted === 1 ? "" : "s"}${r.duplicate ? `, ${r.duplicate} already on file` : ""}.`); onDone(); } },
    onError: (e) => toast.error(e.message ?? "Import failed."),
  });

  const doParse = () => {
    const { rows: parsed, errors } = parseCsv(text);
    if (errors.length) { toast.error(`${errors.length} bad row(s): ${errors.slice(0, 2).join("; ")}`); return; }
    if (parsed.length === 0) { toast.error("No rows found."); return; }
    setRows(parsed);
    previewMut.mutate({ dryRun: true, rows: parsed } as any);
  };
  const doConfirm = () => confirmMut.mutate({ dryRun: false, rows } as any);

  const blocked = preview && (preview.unmatched.length > 0 || preview.ambiguous.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4 bg-black/40 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col max-h-[86vh]" onClick={e => e.stopPropagation()}>
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
          <div className="font-bold text-[#1a2d5a] text-sm flex items-center gap-2"><Receipt className="w-4 h-4" /> Import legacy payment history</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-gray-500">Paste ZenPlanner payment rows as CSV, one per line:<br />
            <code className="text-[11px] bg-gray-50 border border-gray-200 rounded px-1">sourcePaymentId, studentName, email, phone, amount, paidAt, paidThroughDate, note</code><br />
            The <b>paidThrough</b> date is what protects each family from being re-billed for months they already paid.</p>
          <textarea value={text} onChange={e => { setText(e.target.value); setPreview(null); }} rows={8}
            placeholder={"ZP-1001, Elias Gray, parent@email.com, 4045551212, 450, 2026-08-01, 2026-08-31, August tuition"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/20" />

          {preview && (
            <div className="border border-gray-200 rounded-lg p-3 text-xs space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>Ready: <b className="text-emerald-700 tabular-nums">{preview.totals.ready}</b></span>
                <span>Unmatched: <b className={`tabular-nums ${preview.unmatched.length ? "text-red-600" : "text-gray-400"}`}>{preview.totals.unmatched}</b></span>
                <span>Ambiguous: <b className={`tabular-nums ${preview.ambiguous.length ? "text-amber-700" : "text-gray-400"}`}>{preview.totals.ambiguous}</b></span>
                <span>Total: <b className="tabular-nums">${(preview.totals.amountCents / 100).toFixed(2)}</b></span>
              </div>
              {blocked && (
                <div className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Fix the unmatched/ambiguous rows (add a matching email/phone, or a membershipId) before importing. None will be written until every row resolves.
                    {[...preview.unmatched, ...preview.ambiguous].slice(0, 4).map((u: any) => <div key={u.sourcePaymentId} className="text-[11px] text-amber-800">· {u.sourcePaymentId} {u.studentName ? `(${u.studentName})` : ""}</div>)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex items-center gap-2">
          <button onClick={doParse} disabled={previewMut.isPending || !text.trim()} className="text-sm font-medium text-[#1a2d5a] border border-[#1a2d5a]/30 rounded-lg px-3 py-2 hover:bg-[#1a2d5a]/5 disabled:opacity-50">
            {previewMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Preview"}
          </button>
          <button onClick={doConfirm} disabled={!preview || !!blocked || confirmMut.isPending || preview.totals.ready === 0} className="ml-auto bg-[#1a2d5a] hover:bg-[#142347] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {confirmMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Import ${preview?.totals.ready ?? 0} payment${preview?.totals.ready === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
