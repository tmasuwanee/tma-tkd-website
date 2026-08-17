import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, X, Users } from "lucide-react";
import { CATALOG, SIBLING_DISCOUNT_CENTS } from "@/components/admin/MembershipsView";

/**
 * Bulk-add memberships — the ZenPlanner cutover tool. Lists active students (the
 * roster import) that have no membership record yet, and creates tuition +
 * Financials for the selected ones in one pass. Server skips anyone who already
 * has a membership, so re-running is safe.
 */

const fmt = (c: number) => `$${(c / 100).toFixed(0)}`;
const dollarsToCents = (s: string): number | null => { const n = parseFloat(s.replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : null; };

type Row = { studentId: number; name: string; email: string | null; phone: string | null; programs: string | null; beltRank: string | null; include: boolean; catalogIdx: number; monthly: string; sibling: boolean; billingDay: number };

export default function BulkAddMembers({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const candidates = trpc.members.rosterCandidates.useQuery();
  const [rows, setRows] = useState<Row[]>([]);
  const [applyIdx, setApplyIdx] = useState(0);
  const [applyDay, setApplyDay] = useState(1);

  useEffect(() => {
    if (!candidates.data) return;
    setRows(candidates.data.map((c: any) => ({
      studentId: c.studentId, name: c.name, email: c.email, phone: c.phone, programs: c.programs, beltRank: c.beltRank,
      include: true, catalogIdx: 0, monthly: (CATALOG[0].monthlyCents / 100).toFixed(0), sibling: false, billingDay: 1,
    })));
  }, [candidates.data]);

  const create = trpc.members.bulkCreate.useMutation({
    onSuccess: (r) => {
      toast.success(`Created ${r.created} membership${r.created === 1 ? "" : "s"}${r.skipped.length ? `, skipped ${r.skipped.length} (already had one)` : ""}.`);
      onDone();
    },
    onError: (e) => toast.error(e.message ?? "Bulk add failed."),
  });

  const patch = (i: number, p: Partial<Row>) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...p } : r));
  const setProgram = (i: number, idx: number) => patch(i, { catalogIdx: idx, monthly: (CATALOG[idx].monthlyCents / 100).toFixed(0) });
  const applyToAll = () => setRows(rs => rs.map(r => r.include ? { ...r, catalogIdx: applyIdx, monthly: (CATALOG[applyIdx].monthlyCents / 100).toFixed(0), billingDay: applyDay } : r));

  const selected = rows.filter(r => r.include);
  const submit = () => {
    if (selected.length === 0) { toast.error("Select at least one student."); return; }
    create.mutate({
      members: selected.map(r => ({
        studentName: r.name,
        email: r.email || undefined,
        phone: r.phone || undefined,
        program: CATALOG[r.catalogIdx].program,
        planLabel: CATALOG[r.catalogIdx].planLabel,
        monthlyAmountCents: dollarsToCents(r.monthly) ?? CATALOG[r.catalogIdx].monthlyCents,
        discountCents: r.sibling ? SIBLING_DISCOUNT_CENTS : undefined,
        billingDay: r.billingDay,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4 bg-black/40 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col max-h-[86vh]" onClick={e => e.stopPropagation()}>
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
          <div className="font-bold text-[#1a2d5a] text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Bulk add memberships</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>

        {candidates.isLoading ? (
          <div className="py-16 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 px-6">Every active student already has a membership. Nothing to add.</div>
        ) : (
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
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 font-semibold">Student</th>
                  <th className="px-3 py-2 font-semibold">Program</th>
                  <th className="px-3 py-2 font-semibold">Tuition/mo</th>
                  <th className="px-3 py-2 font-semibold">Sibling</th>
                  <th className="px-3 py-2 font-semibold">Bill day</th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.studentId} className={`border-b border-gray-100 ${r.include ? "" : "opacity-50"}`}>
                      <td className="px-3 py-2"><input type="checkbox" checked={r.include} onChange={e => patch(i, { include: e.target.checked })} /></td>
                      <td className="px-3 py-2"><div className="font-medium text-gray-900">{r.name}</div><div className="text-[11px] text-gray-400">{[r.beltRank, r.email].filter(Boolean).join(" · ") || "—"}</div></td>
                      <td className="px-3 py-2">
                        <select value={r.catalogIdx} onChange={e => setProgram(i, Number(e.target.value))} className="border border-gray-300 rounded px-1.5 py-1 text-xs">
                          {CATALOG.map((c, ci) => <option key={ci} value={ci}>{c.program} {c.planLabel}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><div className="flex items-center"><span className="text-gray-400">$</span><input value={r.monthly} onChange={e => patch(i, { monthly: e.target.value })} className="w-16 border border-gray-300 rounded px-1.5 py-1 tabular-nums" /></div></td>
                      <td className="px-3 py-2 text-center"><input type="checkbox" checked={r.sibling} onChange={e => patch(i, { sibling: e.target.checked })} title="Sibling discount -$20/mo" /></td>
                      <td className="px-3 py-2"><input type="number" min={1} max={28} value={r.billingDay} onChange={e => patch(i, { billingDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} className="w-14 border border-gray-300 rounded px-1.5 py-1" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex items-center gap-3">
              <div className="text-xs text-gray-500">Skips anyone who already has a membership. Cards are collected separately (Set up autopay per member).</div>
              <button onClick={submit} disabled={create.isPending || selected.length === 0} className="ml-auto bg-[#1a2d5a] hover:bg-[#142347] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Create ${selected.length} membership${selected.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
