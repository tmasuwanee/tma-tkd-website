import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Users, Plus, X, Pause, Play, Ban, Tag, PencilLine, CreditCard, ChevronDown, ChevronRight, Maximize2 } from "lucide-react";

/**
 * Memberships + Financials. A person does everything here directly (with an inline
 * confirm); the assistant can also propose the same actions via the confirm-flow.
 * The Financials section is the per-month charges ledger — edit/waive/cancel any
 * month. See docs/OPERATIONS_SOPS.md.
 */

export const CATALOG: { program: string; planLabel: string; monthlyCents: number }[] = [
  { program: "taekwondo", planLabel: "2 days/week", monthlyCents: 179_00 },
  { program: "taekwondo", planLabel: "3 days/week", monthlyCents: 199_00 },
  { program: "kickboxing", planLabel: "3 days/week", monthlyCents: 159_00 },
  { program: "bjj", planLabel: "3 days/week", monthlyCents: 159_00 },
  { program: "afterschool", planLabel: "5 days/week", monthlyCents: 500_00 },
  { program: "afterschool", planLabel: "2-3 days/week", monthlyCents: 400_00 },
];
export const SIBLING_DISCOUNT_CENTS = 20_00;
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

  // Deep-link: /admin/memberships?open=<id> (e.g. from the assistant) opens that
  // member's popup, then strips the param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    if (openId && /^\d+$/.test(openId)) setSelected(Number(openId));
    if (params.get("autopay") === "ok") toast.success("Autopay set up — card is on file.");
    if (openId || params.get("autopay")) {
      params.delete("open"); params.delete("autopay");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

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
      {selected !== null && <MembershipDetailModal id={selected} onClose={() => setSelected(null)} onChanged={() => list.refetch()} />}
    </div>
  );
}

export function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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

export function MembershipDetailModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  return <Overlay onClose={onClose} title="Member" wide><MemberPanelBody id={id} onChanged={onChanged} /></Overlay>;
}

/** The member command-center body: collapsible Overview / Cards / Financials
 *  sections. Rendered inside the docked panel (MemberDock, many open at once) and
 *  inside the legacy modal. onName reports the loaded student name to the panel
 *  header (deep-links open before the name is known). */
export function MemberPanelBody({ id, onChanged, onName }: { id: number; onChanged: () => void; onName?: (name: string) => void }) {
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
  const setupCard = trpc.memberships.setupCardSession.useMutation({
    onSuccess: (r) => { if (r?.url) window.open(r.url, "_blank", "noopener"); else toast.error("Stripe not configured."); },
    onError: (e) => toast.error(e.message ?? "Failed."),
  });
  const billing = trpc.memberships.billing.useQuery({ id });
  const setPrimary = trpc.memberships.setPrimaryCard.useMutation({
    onSuccess: () => { utils.memberships.billing.invalidate({ id }); toast.success("Primary card updated."); },
    onError: (e) => toast.error(e.message ?? "Failed."),
  });
  const removeCard = trpc.memberships.removeCard.useMutation({
    onSuccess: () => { utils.memberships.billing.invalidate({ id }); toast.success("Card removed."); },
    onError: (e) => toast.error(e.message ?? "Failed."),
  });
  const payers = trpc.memberships.listPayers.useQuery();
  const assignPayer = trpc.memberships.assignPayer.useMutation({
    onSuccess: () => { utils.memberships.get.invalidate({ id }); utils.memberships.billing.invalidate({ id }); utils.memberships.listPayers.invalidate(); toast.success("Family payer updated."); },
    onError: (e) => toast.error(e.message ?? "Failed."),
  });
  const onPickPayer = (val: string) => {
    if (val === "__new__") { const name = window.prompt("New payer (family / head-of-household) name:"); if (name?.trim()) assignPayer.mutate({ id, newPayer: { name: name.trim() } }); return; }
    assignPayer.mutate({ id, payerId: val ? Number(val) : null });
  };

  const m = q.data?.membership;
  const charges = q.data?.charges ?? [];
  const paymentsEnabled = billing.data?.paymentsEnabled ?? false;
  const [financialsOpen, setFinancialsOpen] = useState(false);

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

  useEffect(() => { if (m?.studentName) onName?.(m.studentName); }, [m?.studentName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <div className="py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (!m) return <div className="py-8 text-center text-sm text-gray-400">This membership no longer exists. Close this panel.</div>;

  return (
    <div className="space-y-3">
      <PanelSection title="Overview">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="capitalize font-medium text-gray-900">{m.program}{m.planLabel ? ` · ${m.planLabel}` : ""}</span>
            <span className="tabular-nums">{fmt(m.monthlyAmountCents - (m.discountCents || 0))}/mo{m.discountCents ? <span className="text-green-700"> (-{fmt(m.discountCents)} {m.discountNote || "discount"})</span> : null}</span>
            <span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium ${STATUS_STYLE[m.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>{m.status}</span>
            {m.cancelEffectiveDate ? <span className="text-xs text-red-600">cancels {String(m.cancelEffectiveDate).slice(0, 10)}</span> : null}
            {m.stripeCustomerId ? <span className="text-xs text-green-700">card on file</span> : <span className="text-xs text-gray-400">no card on file</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionBtn onClick={changeAmount} icon={<PencilLine className="w-3.5 h-3.5" />} label="Change tuition" />
            <ActionBtn onClick={applyDiscount} icon={<Tag className="w-3.5 h-3.5" />} label="Discount" />
            {m.status === "paused"
              ? <ActionBtn onClick={() => resume.mutate({ id })} icon={<Play className="w-3.5 h-3.5" />} label="Resume" />
              : <ActionBtn onClick={() => { if (window.confirm("Pause this membership now?")) pause.mutate({ id }); }} icon={<Pause className="w-3.5 h-3.5" />} label="Pause" />}
            <ActionBtn onClick={() => { if (window.confirm("Schedule cancellation with a 60-day notice? They can attend until then.")) cancel.mutate({ id, immediate: false }); }} icon={<Ban className="w-3.5 h-3.5" />} label="Cancel (60-day)" />
            <ActionBtn danger onClick={() => { if (window.confirm("Cancel this membership IMMEDIATELY? This ends it now.")) cancel.mutate({ id, immediate: true }); }} icon={<Ban className="w-3.5 h-3.5" />} label="Cancel now" />
            <ActionBtn onClick={() => setupCard.mutate({ id })} disabled={!paymentsEnabled}
              title={!paymentsEnabled ? "Payments are off. Turn on billing to collect cards." : undefined}
              icon={<CreditCard className="w-3.5 h-3.5" />} label={m.stripeCustomerId ? "Update card" : "Set up autopay"} />
          </div>
        </div>
      </PanelSection>

      {/* Family cards on file (one payer, shared across their students) */}
      <PanelSection title={`Cards on file${billing.data?.payer ? ` · ${billing.data.payer.name}` : ""}`}>
        {!paymentsEnabled && (
          <div className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Payments are off, so card setup is disabled. Turn on billing (MEMBERSHIP_AUTOCHARGE_ENFORCE) when you go live to collect cards.
          </div>
        )}
        <div className="flex items-center gap-2 text-sm mb-2 flex-wrap">
          <span className="text-gray-500">Family payer:</span>
          <select value={m.payerId ?? ""} onChange={e => onPickPayer(e.target.value)} disabled={assignPayer.isPending}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
            <option value="">— not assigned —</option>
            {(payers.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name}{p.hasCard ? " (card on file)" : ""}</option>)}
            <option value="__new__">+ New payer...</option>
          </select>
          {billing.data?.siblings && billing.data.siblings.length > 0 && (
            <span className="text-xs text-gray-500">shares this payer's card with: {billing.data.siblings.map(s => s.student).join(", ")}</span>
          )}
        </div>
        {(billing.data?.cards ?? []).length === 0 ? (
          <div className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg p-3">No card yet. Click <strong>Set up autopay</strong> above to add one on Stripe's secure page. The card lives on the family payer, so it can cover this student's siblings too.</div>
        ) : (
          <>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {billing.data!.cards.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <CreditCard className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="capitalize">{c.brand}</span>
                  <span className="tabular-nums text-gray-600">···· {c.last4}</span>
                  {c.exp ? <span className="text-xs text-gray-400">exp {c.exp}</span> : null}
                  {c.primary
                    ? <span className="ml-auto text-[10px] uppercase tracking-wide text-green-700 bg-green-100 border border-green-200 rounded px-1.5 py-0.5">Primary</span>
                    : <button onClick={() => setPrimary.mutate({ id, paymentMethodId: c.id })} disabled={setPrimary.isPending} className="ml-auto text-xs text-[#1a2d5a] hover:underline">Make primary</button>}
                  <button onClick={() => { if (window.confirm(`Remove this ${c.brand} ending ${c.last4}? The card is detached from the family on Stripe.`)) removeCard.mutate({ id, paymentMethodId: c.id }); }}
                    disabled={removeCard.isPending} className={`text-xs text-gray-400 hover:text-red-600 hover:underline ${c.primary ? "ml-auto" : ""}`}>Remove</button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Charges draw from the <strong>primary</strong> card. This payer's card also covers other students in the family.</p>
          </>
        )}
      </PanelSection>

      {/* Financials */}
      {/* Financials opens a full centered popup — the ledger needs more width than
          the docked panel gives. */}
      <button onClick={() => setFinancialsOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-semibold text-[#1a2d5a]">
        <span className="truncate">Financials (monthly charges){charges.length ? ` · ${charges.length}` : ""}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500"><Maximize2 className="w-3.5 h-3.5" /> Open full view</span>
      </button>

      {financialsOpen && (
        <Overlay onClose={() => setFinancialsOpen(false)} title={`Financials · ${m.studentName}`} xwide>
          <div className="mb-3 text-sm text-gray-600">{m.program}{m.planLabel ? ` · ${m.planLabel}` : ""} · <span className="tabular-nums">{fmt(m.monthlyAmountCents - (m.discountCents || 0))}/mo</span>{m.discountCents ? <span className="text-green-700"> (-{fmt(m.discountCents)} {m.discountNote || "discount"})</span> : null}</div>
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3 font-semibold">Month</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Note</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr></thead>
              <tbody>
                {charges.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No charges scheduled.</td></tr>
                ) : charges.map(ch => (
                  <tr key={ch.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">{ch.periodMonth}</td>
                    <td className={`px-4 py-3 tabular-nums text-right font-semibold whitespace-nowrap ${CHARGE_STYLE[ch.status] ?? ""}`}>{fmt(ch.amountCents)}{ch.amountCents !== ch.baseAmountCents ? <span className="text-[11px] text-gray-400 line-through ml-2 font-normal">{fmt(ch.baseAmountCents)}</span> : null}</td>
                    <td className="px-4 py-3"><span className="text-xs text-gray-600 capitalize">{ch.status}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[240px] truncate">{ch.note || "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => editCharge(ch.id, ch.amountCents)} className="text-xs font-medium text-[#1a2d5a] hover:underline mr-3">Edit</button>
                      <button onClick={() => adjust.mutate({ chargeId: ch.id, amountCents: 0, status: "waived", note: "Waived" })} className="text-xs font-medium text-amber-700 hover:underline mr-3">Waive</button>
                      <button onClick={() => adjust.mutate({ chargeId: ch.id, status: "canceled", note: "Canceled" })} className="text-xs font-medium text-gray-500 hover:text-red-600 hover:underline">Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function PanelSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-[#1a2d5a]">
        <span className="truncate">{title}</span>{open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

function ActionBtn({ onClick, icon, label, danger, disabled, title }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${danger ? "text-red-600 border-red-200 hover:bg-red-50" : "text-gray-700 border-gray-200 hover:border-[#1a2d5a]/40"}`}>
      {icon}{label}
    </button>
  );
}

function Overlay({ children, onClose, title, wide, xwide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean; xwide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4 bg-black/40 overflow-y-auto" onClick={onClose}>
      <div className={`w-full ${xwide ? "max-w-4xl" : wide ? "max-w-2xl" : "max-w-md"} bg-white rounded-xl shadow-2xl border border-gray-200`} onClick={e => e.stopPropagation()}>
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100">
          <div className="font-bold text-[#1a2d5a] text-sm">{title}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
