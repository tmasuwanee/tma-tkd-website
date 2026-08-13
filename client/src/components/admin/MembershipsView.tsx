import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Users, Plus, X, Pause, Play, Ban, Tag, PencilLine } from "lucide-react";

/**
 * Memberships + Financials. A person does everything here directly (with an inline
 * confirm); the assistant can also propose the same actions via the confirm-flow.
 * The Financials section is the per-month charges ledger — edit/waive/cancel any
 * month. See docs/OPERATIONS_SOPS.md.
 */

const CATALOG: { program: string; planLabel: string; monthlyCents: number }[] = [
  { program: "taekwondo", planLabel: "2 days/week", monthlyCents: 179_00 },
  { program: "taekwondo", planLabel: "3 days/week", monthlyCents: 199_00 },
  { program: "kickboxing", planLabel: "3 days/week", monthlyCents: 159_00 },
  { program: "bjj", planLabel: "3 days/week", monthlyCents: 159_00 },
  { program: "afterschool", planLabel: "5 days/week", monthlyCents: 500_00 },
  { program: "afterschool", planLabel: "2-3 days/week", monthlyCents: 400_00 },
];
const SIBLING_DISCOUNT_CENTS = 20_00;
const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const dollarsToCents = (s: string): number | null => { const n = parseFloat(s.replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : null; };

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  paused: "bg-amber-100 text-amber-800 border-amber-200",
  canceled: "bg-gray-100 text-gray-600 border-gray-200",
  pending: "bg-blue-100 text-blue-800 border-blue-200",
};
const CHARGE_STYLE: Record<string, string> = {
  scheduled: "text-gray-700", paid: "text-green-700", waived: "text-amber-700 line-through", canceled: "text-gray-400 line-through",
};

export default function MembershipsView() {
  const list = trpc.memberships.list.useQuery();
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const rows = list.data ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1a2d5a]/10 flex items-center justify-center shrink-0"><Users className="w-5 h-5 text-[#1a2d5a]" /></div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a2d5a]">Memberships</h1>
          <p className="text-sm text-gray-500 mt-0.5">Programs, tuition, and per-month financials. Click a member to manage.</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#1a2d5a] hover:bg-[#142347] rounded-lg px-3 py-2"><Plus className="w-4 h-4" /> New membership</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {list.isLoading ? (
          <div className="text-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No memberships yet. Click "New membership" to add one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200 text-left">
              <th className="px-4 py-3 font-semibold text-gray-600">Student</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Program</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Tuition</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
            </tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id} onClick={() => setSelected(m.id)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3"><div className="font-medium text-gray-900">{m.studentName}</div>{m.parentName ? <div className="text-xs text-gray-500">{m.parentName}</div> : null}</td>
                  <td className="px-4 py-3 text-gray-700 capitalize">{m.program}{m.planLabel ? ` · ${m.planLabel}` : ""}</td>
                  <td className="px-4 py-3 tabular-nums">{fmt(m.monthlyAmountCents - (m.discountCents || 0))}/mo{m.discountCents ? <span className="text-xs text-green-700"> (-{fmt(m.discountCents)})</span> : null}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium ${STATUS_STYLE[m.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>{m.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && <CreateForm onClose={() => setCreating(false)} onCreated={() => { list.refetch(); }} />}
      {selected !== null && <DetailModal id={selected} onClose={() => setSelected(null)} onChanged={() => list.refetch()} />}
    </div>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [catalogIdx, setCatalogIdx] = useState(0);
  const [studentName, setStudentName] = useState("");
  const [parentName, setParentName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [startDate, setStartDate] = useState("");
  const [sibling, setSibling] = useState(false);
  const c = CATALOG[catalogIdx];
  const create = trpc.memberships.create.useMutation({
    onSuccess: () => { toast.success("Membership created."); onCreated(); onClose(); },
    onError: (e) => toast.error(e.message ?? "Could not create."),
  });
  const submit = () => {
    if (!studentName.trim()) { toast.error("Student name required."); return; }
    create.mutate({
      studentName: studentName.trim(), parentName: parentName.trim() || undefined,
      email: email.trim() || undefined, phone: phone.trim() || undefined,
      program: c.program, planLabel: c.planLabel, monthlyAmountCents: c.monthlyCents,
      discountCents: sibling ? SIBLING_DISCOUNT_CENTS : undefined, discountNote: sibling ? "Sibling discount" : undefined,
      startDate: startDate || undefined,
    });
  };
  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30";
  return (
    <Overlay onClose={onClose} title="New membership">
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">Plan
          <select className={inp} value={catalogIdx} onChange={e => setCatalogIdx(Number(e.target.value))}>
            {CATALOG.map((x, i) => <option key={i} value={i}>{x.program} · {x.planLabel} · {fmt(x.monthlyCents)}/mo</option>)}
          </select>
        </label>
        <input className={inp} placeholder="Student full name *" value={studentName} onChange={e => setStudentName(e.target.value)} />
        <input className={inp} placeholder="Parent name" value={parentName} onChange={e => setParentName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} placeholder="Parent email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className={inp} placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <label className="block text-xs font-semibold text-gray-600">Start date<input type="date" className={inp} value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={sibling} onChange={e => setSibling(e.target.checked)} /> Sibling discount (-{fmt(SIBLING_DISCOUNT_CENTS)}/mo)</label>
        <div className="text-sm text-gray-500">Net tuition: <strong className="text-gray-900">{fmt(c.monthlyCents - (sibling ? SIBLING_DISCOUNT_CENTS : 0))}/mo</strong></div>
        <button onClick={submit} disabled={create.isPending} className="w-full bg-[#1a2d5a] hover:bg-[#142347] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">{create.isPending ? "Creating..." : "Create membership"}</button>
      </div>
    </Overlay>
  );
}

function DetailModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const q = trpc.memberships.get.useQuery({ id });
  const done = () => { utils.memberships.get.invalidate({ id }); onChanged(); };
  const opts = { onSuccess: () => { toast.success("Done."); done(); }, onError: (e: { message?: string }) => toast.error(e.message ?? "Failed.") };
  const change = trpc.memberships.change.useMutation(opts);
  const setDiscount = trpc.memberships.setDiscount.useMutation(opts);
  const pause = trpc.memberships.pause.useMutation(opts);
  const resume = trpc.memberships.resume.useMutation(opts);
  const cancel = trpc.memberships.cancel.useMutation(opts);
  const adjust = trpc.memberships.adjustCharge.useMutation(opts);

  const m = q.data?.membership;
  const charges = q.data?.charges ?? [];

  const changeAmount = () => {
    const s = window.prompt("New monthly tuition (dollars):", m ? String((m.monthlyAmountCents / 100).toFixed(2)) : "");
    if (s === null) return;
    const cents = dollarsToCents(s); if (cents === null) { toast.error("Invalid amount."); return; }
    const prorate = window.confirm("Prorate this change to the current month?\n\nOK = prorate. Cancel = change takes effect next billing cycle (recommended default).");
    change.mutate({ id, monthlyAmountCents: cents, prorate });
  };
  const applyDiscount = () => {
    const s = window.prompt("Monthly discount amount (dollars, 0 to clear):", m ? String(((m.discountCents || 0) / 100).toFixed(2)) : "0");
    if (s === null) return;
    const cents = dollarsToCents(s); if (cents === null) { toast.error("Invalid amount."); return; }
    const note = cents ? (window.prompt("Discount note (e.g. Sibling, Staff):", m?.discountNote ?? "") ?? undefined) : undefined;
    setDiscount.mutate({ id, discountCents: cents, note });
  };
  const editCharge = (chargeId: number, current: number) => {
    const s = window.prompt("Amount for this month (dollars):", String((current / 100).toFixed(2)));
    if (s === null) return;
    const cents = dollarsToCents(s); if (cents === null) { toast.error("Invalid amount."); return; }
    adjust.mutate({ chargeId, amountCents: cents, note: "Edited amount" });
  };

  return (
    <Overlay onClose={onClose} title={m ? `${m.studentName}` : "Membership"} wide>
      {q.isLoading || !m ? (
        <div className="py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="capitalize font-medium text-gray-900">{m.program}{m.planLabel ? ` · ${m.planLabel}` : ""}</span>
            <span className="tabular-nums">{fmt(m.monthlyAmountCents - (m.discountCents || 0))}/mo{m.discountCents ? <span className="text-green-700"> (-{fmt(m.discountCents)} {m.discountNote || "discount"})</span> : null}</span>
            <span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium ${STATUS_STYLE[m.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>{m.status}</span>
            {m.cancelEffectiveDate ? <span className="text-xs text-red-600">cancels {String(m.cancelEffectiveDate).slice(0, 10)}</span> : null}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <ActionBtn onClick={changeAmount} icon={<PencilLine className="w-3.5 h-3.5" />} label="Change tuition" />
            <ActionBtn onClick={applyDiscount} icon={<Tag className="w-3.5 h-3.5" />} label="Discount" />
            {m.status === "paused"
              ? <ActionBtn onClick={() => resume.mutate({ id })} icon={<Play className="w-3.5 h-3.5" />} label="Resume" />
              : <ActionBtn onClick={() => { if (window.confirm("Pause this membership now?")) pause.mutate({ id }); }} icon={<Pause className="w-3.5 h-3.5" />} label="Pause" />}
            <ActionBtn onClick={() => { if (window.confirm("Schedule cancellation with a 60-day notice? They can attend until then.")) cancel.mutate({ id, immediate: false }); }} icon={<Ban className="w-3.5 h-3.5" />} label="Cancel (60-day)" />
            <ActionBtn danger onClick={() => { if (window.confirm("Cancel this membership IMMEDIATELY? This ends it now.")) cancel.mutate({ id, immediate: true }); }} icon={<Ban className="w-3.5 h-3.5" />} label="Cancel now" />
          </div>

          {/* Financials */}
          <div>
            <h3 className="text-sm font-bold text-[#1a2d5a] mb-2">Financials (monthly charges)</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left text-xs text-gray-500"><th className="px-3 py-2">Month</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Edit</th></tr></thead>
                <tbody>
                  {charges.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No charges scheduled.</td></tr>
                  ) : charges.map(ch => (
                    <tr key={ch.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 tabular-nums">{ch.periodMonth}</td>
                      <td className={`px-3 py-2 tabular-nums ${CHARGE_STYLE[ch.status] ?? ""}`}>{fmt(ch.amountCents)}{ch.amountCents !== ch.baseAmountCents ? <span className="text-[10px] text-gray-400 line-through ml-1">{fmt(ch.baseAmountCents)}</span> : null}</td>
                      <td className="px-3 py-2"><span className="text-xs text-gray-500">{ch.status}</span>{ch.note ? <span className="text-[10px] text-gray-400"> · {ch.note}</span> : null}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => editCharge(ch.id, ch.amountCents)} className="text-xs text-[#1a2d5a] hover:underline mr-2">Edit</button>
                        <button onClick={() => adjust.mutate({ chargeId: ch.id, amountCents: 0, status: "waived", note: "Waived" })} className="text-xs text-amber-700 hover:underline mr-2">Waive</button>
                        <button onClick={() => adjust.mutate({ chargeId: ch.id, status: "canceled", note: "Canceled" })} className="text-xs text-gray-500 hover:text-red-600 hover:underline">Cancel</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Overlay>
  );
}

function ActionBtn({ onClick, icon, label, danger }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border px-2.5 py-1.5 ${danger ? "text-red-600 border-red-200 hover:bg-red-50" : "text-gray-700 border-gray-200 hover:border-[#1a2d5a]/40"}`}>
      {icon}{label}
    </button>
  );
}

function Overlay({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4 bg-black/40 overflow-y-auto" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} bg-white rounded-xl shadow-2xl border border-gray-200`} onClick={e => e.stopPropagation()}>
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100">
          <div className="font-bold text-[#1a2d5a] text-sm">{title}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
