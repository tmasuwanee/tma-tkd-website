import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, X, Users, AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { CATALOG, SIBLING_DISCOUNT_CENTS } from "@/components/admin/MembershipsView";

/**
 * Bulk-add memberships — the ZenPlanner cutover tool. Lists active students that
 * have no membership yet, then imports tuition + Financials in TWO steps:
 *   1) Preview (dry-run): the server classifies every row (create / needs review /
 *      blocked), computes each first charge date, and totals the monthly amount.
 *   2) Confirm: only "create" rows are written, and an import batch is recorded.
 * Safety: start / paid-through dates anchor billing to the real cycle (never bills
 * an already-paid month), a $25 tuition floor blocks junk rows, and same-name
 * collisions surface as "needs review" instead of being silently dropped.
 */

const fmt = (c: number) => `$${(c / 100).toFixed(0)}`;
const dollarsToCents = (s: string): number => { const n = parseFloat(s.replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const isoOrBlank = (s: string | null): string => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");

type Row = {
  studentId: number; name: string; email: string | null; phone: string | null;
  programs: string | null; beltRank: string | null; enrollmentDate: string | null;
  disposition: "none" | "review"; include: boolean; catalogIdx: number; monthly: string;
  sibling: boolean; billingDay: number; startDate: string; paidThrough: string;
  reviewAction: "create" | "skip" | "";
};

type PreviewRow = { studentName: string; disposition: string; action: string; netMonthlyCents: number; firstCharge: { periodMonth: string; dueDate: string }; errors: string[] };
type Preview = { summary: { submitted: number; create: number; duplicates: number; needsReview: number; blocked: number; netMonthlyCents: number }; rows: PreviewRow[] };

export default function BulkAddMembers({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const candidates = trpc.members.rosterCandidates.useQuery();
  const [rows, setRows] = useState<Row[]>([]);
  const [applyIdx, setApplyIdx] = useState(0);
  const [applyDay, setApplyDay] = useState(1);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!candidates.data) return;
    setRows(candidates.data.map((c: any) => ({
      studentId: c.studentId, name: c.name, email: c.email, phone: c.phone, programs: c.programs, beltRank: c.beltRank,
      enrollmentDate: c.enrollmentDate ?? null, disposition: c.disposition === "review" ? "review" : "none",
      include: c.disposition !== "review", catalogIdx: 0, monthly: (CATALOG[0].monthlyCents / 100).toFixed(0),
      sibling: false, billingDay: 1, startDate: isoOrBlank(c.enrollmentDate ?? null), paidThrough: "", reviewAction: "",
    })));
  }, [candidates.data]);

  const previewMut = trpc.members.bulkCreate.useMutation({
    onSuccess: (r: any) => { if (r.dryRun) setPreview({ summary: r.summary, rows: r.rows }); },
    onError: (e) => toast.error(e.message ?? "Preview failed."),
  });
  const confirmMut = trpc.members.bulkCreate.useMutation({
    onSuccess: (r: any) => {
      if (r.dryRun) return;
      toast.success(`Imported ${r.created} membership${r.created === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped}` : ""}.`);
      onDone();
    },
    onError: (e) => toast.error(e.message ?? "Import failed."),
  });

  const patch = (i: number, p: Partial<Row>) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...p } : r));
  const setProgram = (i: number, idx: number) => patch(i, { catalogIdx: idx, monthly: (CATALOG[idx].monthlyCents / 100).toFixed(0) });
  const applyToAll = () => setRows(rs => rs.map(r => r.include ? { ...r, catalogIdx: applyIdx, monthly: (CATALOG[applyIdx].monthlyCents / 100).toFixed(0), billingDay: applyDay } : r));

  const selected = rows.filter(r => r.include);

  // Build the payload from currently-included rows. Review rows carry reviewAction.
  const payload = () => ({
    members: selected.map(r => ({
      studentId: r.studentId,
      studentName: r.name,
      email: r.email || undefined,
      phone: r.phone || undefined,
      program: CATALOG[r.catalogIdx].program,
      planLabel: CATALOG[r.catalogIdx].planLabel,
      monthlyAmountCents: dollarsToCents(r.monthly),
      discountCents: r.sibling ? SIBLING_DISCOUNT_CENTS : undefined,
      billingDay: r.billingDay,
      startDate: r.startDate || undefined,
      paidThroughDate: r.paidThrough || undefined,
      reviewAction: r.disposition === "review" ? (r.reviewAction || "create") : undefined,
    })),
  });

  const runPreview = () => {
    if (selected.length === 0) { toast.error("Select at least one student."); return; }
    previewMut.mutate({ ...payload(), dryRun: true } as any);
  };
  const runConfirm = () => confirmMut.mutate({ ...payload(), dryRun: false } as any);

  const badge = (action: string) => action === "create" ? { t: "Create", c: "bg-green-100 text-green-800 border-green-200" }
    : action === "needs_review" ? { t: "Needs review", c: "bg-amber-100 text-amber-800 border-amber-200" }
    : action === "blocked" ? { t: "Blocked", c: "bg-red-100 text-red-700 border-red-200" }
    : { t: "Skip", c: "bg-gray-100 text-gray-500 border-gray-200" };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4 bg-black/40 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col max-h-[86vh]" onClick={e => e.stopPropagation()}>
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
          <div className="font-bold text-[#1a2d5a] text-sm flex items-center gap-2">
            {preview && <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-[#1a2d5a]"><ArrowLeft className="w-4 h-4" /></button>}
            <Users className="w-4 h-4" /> {preview ? "Review import" : "Bulk add memberships"}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>

        {candidates.isLoading ? (
          <div className="py-16 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 px-6">Every active student already has a membership. Nothing to add.</div>
        ) : preview ? (
          /* ── Preview / confirm ── */
          <>
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Stat label="Will create" value={preview.summary.create} tone="green" />
              <Stat label="Needs review" value={preview.summary.needsReview} tone={preview.summary.needsReview ? "amber" : "gray"} />
              <Stat label="Blocked" value={preview.summary.blocked} tone={preview.summary.blocked ? "red" : "gray"} />
              <Stat label="New MRR" value={fmt(preview.summary.netMonthlyCents)} tone="navy" />
            </div>
            {(preview.summary.needsReview > 0 || preview.summary.blocked > 0) && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {preview.summary.blocked > 0 && <span>Fix blocked rows (tuition or contact). </span>}
                {preview.summary.needsReview > 0 && <span>Resolve "needs review" rows (go back, set create/skip), then re-preview.</span>}
              </div>
            )}
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="px-3 py-2 font-semibold">Student</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Tuition/mo</th>
                  <th className="px-3 py-2 font-semibold">First charge</th>
                </tr></thead>
                <tbody>
                  {preview.rows.map((r, i) => { const b = badge(r.action); return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{r.studentName}</td>
                      <td className="px-3 py-2"><span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium ${b.c}`}>{b.t}</span>{r.errors.length > 0 && <div className="text-[11px] text-red-600 mt-0.5">{r.errors.join("; ")}</div>}</td>
                      <td className="px-3 py-2 tabular-nums">{r.action === "create" ? fmt(r.netMonthlyCents) : "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{r.action === "create" ? r.firstCharge.dueDate : "—"}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex items-center gap-3">
              <div className="text-xs text-gray-500">Only "Create" rows are written. Cards are collected separately.</div>
              <button onClick={runConfirm} disabled={confirmMut.isPending || preview.summary.needsReview > 0 || preview.summary.create === 0}
                className="ml-auto bg-[#1a2d5a] hover:bg-[#142347] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">
                {confirmMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Import {preview.summary.create} membership{preview.summary.create === 1 ? "" : "s"}
              </button>
            </div>
          </>
        ) : (
          /* ── Edit grid ── */
          <>
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2 text-xs shrink-0">
              <span className="text-gray-500">Apply to all selected:</span>
              <select value={applyIdx} onChange={e => setApplyIdx(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1">
                {CATALOG.map((c, i) => <option key={i} value={i}>{c.program} · {c.planLabel} · {fmt(c.monthlyCents)}</option>)}
              </select>
              <label className="flex items-center gap-1 text-gray-500">Bill day <input type="number" min={1} max={28} value={applyDay} onChange={e => setApplyDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))} className="w-14 border border-gray-300 rounded px-2 py-1" /></label>
              <button onClick={applyToAll} className="text-[#1a2d5a] font-semibold border border-[#1a2d5a]/30 rounded px-2 py-1 hover:bg-[#1a2d5a]/5">Apply</button>
              <span className="ml-auto text-gray-400">{selected.length} of {rows.length} selected</span>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="px-2 py-2 w-8"></th>
                  <th className="px-2 py-2 font-semibold">Student</th>
                  <th className="px-2 py-2 font-semibold">Program</th>
                  <th className="px-2 py-2 font-semibold">$/mo</th>
                  <th className="px-2 py-2 font-semibold" title="Sibling discount">Sib</th>
                  <th className="px-2 py-2 font-semibold" title="Billing day">Day</th>
                  <th className="px-2 py-2 font-semibold">Start</th>
                  <th className="px-2 py-2 font-semibold" title="Paid through (from ZenPlanner)">Paid thru</th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.studentId} className={`border-b border-gray-100 ${r.include ? "" : "opacity-50"}`}>
                      <td className="px-2 py-2"><input type="checkbox" checked={r.include} onChange={e => patch(i, { include: e.target.checked })} /></td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-gray-900 flex items-center gap-1.5">{r.name}
                          {r.disposition === "review" && <span className="text-[10px] rounded-full border border-amber-300 bg-amber-50 text-amber-800 px-1.5" title="Same name as an existing member, different contact. Confirm this is a new person.">review</span>}
                        </div>
                        <div className="text-[11px] text-gray-400">{[r.beltRank, r.email].filter(Boolean).join(" · ") || "—"}</div>
                      </td>
                      <td className="px-2 py-2">
                        <select value={r.catalogIdx} onChange={e => setProgram(i, Number(e.target.value))} className="border border-gray-300 rounded px-1.5 py-1 text-xs">
                          {CATALOG.map((c, ci) => <option key={ci} value={ci}>{c.program} {c.planLabel}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2"><div className="flex items-center"><span className="text-gray-400">$</span><input value={r.monthly} onChange={e => patch(i, { monthly: e.target.value })} className="w-14 border border-gray-300 rounded px-1.5 py-1 tabular-nums" /></div></td>
                      <td className="px-2 py-2 text-center"><input type="checkbox" checked={r.sibling} onChange={e => patch(i, { sibling: e.target.checked })} title="Sibling discount" /></td>
                      <td className="px-2 py-2"><input type="number" min={1} max={28} value={r.billingDay} onChange={e => patch(i, { billingDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} className="w-12 border border-gray-300 rounded px-1 py-1" /></td>
                      <td className="px-2 py-2"><input type="date" value={r.startDate} onChange={e => patch(i, { startDate: e.target.value })} className="border border-gray-300 rounded px-1 py-1 text-xs" /></td>
                      <td className="px-2 py-2"><input type="date" value={r.paidThrough} onChange={e => patch(i, { paidThrough: e.target.value })} className="border border-gray-300 rounded px-1 py-1 text-xs" title="They will not be billed for any month on or before this date" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex items-center gap-3">
              <div className="text-xs text-gray-500">Set each student's start / paid-through date so billing anchors to their real cycle. Preview before importing.</div>
              <button onClick={runPreview} disabled={previewMut.isPending || selected.length === 0} className="ml-auto bg-[#1a2d5a] hover:bg-[#142347] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">
                {previewMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Preview {selected.length} import{selected.length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: "green" | "amber" | "red" | "navy" | "gray" }) {
  const c = { green: "text-emerald-700", amber: "text-amber-700", red: "text-red-600", navy: "text-[#1a2d5a]", gray: "text-gray-400" }[tone];
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}
