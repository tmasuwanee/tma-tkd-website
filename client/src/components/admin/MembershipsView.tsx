import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Users, Plus, X, Pause, Play, Ban, Tag, PencilLine, CreditCard, ChevronDown, ChevronRight, Maximize2, FileSignature, ExternalLink, Copy, Check, ShieldCheck, AlertTriangle, Award, ArrowUp, ArrowDown, MessageSquare, SlidersHorizontal, Camera } from "lucide-react";
import { BELT_SEQUENCE } from "@shared/beltRanks";

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
  const waiverQ = trpc.members.waivers.useQuery({ id });
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
  const [attachWaiverOpen, setAttachWaiverOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [viewWaiverId, setViewWaiverId] = useState<number | null>(null);
  const wv = waiverQ.data;
  const anyWaiverMissing = !!wv && (wv.martialArts.status === "missing" || wv.afterschool.status === "missing");
  const anyWaiverReview = !!wv && (wv.martialArts.status === "needs_review" || wv.afterschool.status === "needs_review");
  const waiverNeedsAttention = anyWaiverMissing || anyWaiverReview;

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
          <MemberPhoto membershipId={id} />
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
            <ActionBtn onClick={() => setManageOpen(true)} icon={<SlidersHorizontal className="w-3.5 h-3.5" />} label="Manage plan" />
            <ActionBtn onClick={() => setupCard.mutate({ id })} disabled={!paymentsEnabled}
              title={!paymentsEnabled ? "Payments are off. Turn on billing to collect cards." : undefined}
              icon={<CreditCard className="w-3.5 h-3.5" />} label={m.stripeCustomerId ? "Update card" : "Set up autopay"} />
          </div>
          {waiverNeedsAttention && (
            <button onClick={() => setAttachWaiverOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-amber-900 bg-amber-50 border-2 border-amber-400 rounded-lg px-3 py-2 animate-pulse hover:animate-none hover:bg-amber-100">
              <AlertTriangle className="w-4 h-4" /> {anyWaiverMissing ? "Waiver missing — add now" : "Waiver match needs review"}
            </button>
          )}
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
      {/* Waivers & agreements */}
      <PanelSection title="Waivers & agreements">
        {waiverQ.isLoading || !wv ? (
          <div className="py-3 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-2">
            <WaiverKindRow label="Martial arts (TKD / Kickboxing / BJJ)" data={wv.martialArts} onView={setViewWaiverId} onAttach={() => setAttachWaiverOpen(true)} />
            <WaiverKindRow label="After-School" data={wv.afterschool} onView={setViewWaiverId} onAttach={() => setAttachWaiverOpen(true)} />
            {wv.martialArts.status === "na" && wv.afterschool.status === "na" ? (
              <div className="text-xs text-gray-400">No waiver required for this member's programs.</div>
            ) : null}
            <button onClick={() => setAttachWaiverOpen(true)} className="text-xs font-medium text-[#1a2d5a] hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add / attach a waiver</button>
          </div>
        )}
      </PanelSection>

      {/* Belt & testing (Taekwondo / martial-arts students) */}
      <PanelSection title="Belt & testing" defaultOpen={false}>
        <BeltSection membershipId={id} />
      </PanelSection>

      {/* Payment history (imported legacy payments + real payments once charged) */}
      <PanelSection title="Payment history" defaultOpen={false}>
        <PaymentHistorySection membershipId={id} />
      </PanelSection>

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

      {manageOpen && (
        <Overlay onClose={() => setManageOpen(false)} title="Manage plan">
          <div className="space-y-3">
            <div className="text-sm text-gray-600">
              <span className="capitalize font-medium text-gray-900">{m.program}{m.planLabel ? ` · ${m.planLabel}` : ""}</span>
              {" · "}<span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium ${STATUS_STYLE[m.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>{m.status}</span>
              {m.cancelEffectiveDate ? <span className="text-xs text-red-600"> · cancels {String(m.cancelEffectiveDate).slice(0, 10)}</span> : null}
            </div>

            {m.status === "paused" ? (
              <ManageRow icon={<Play className="w-4 h-4 text-green-700" />} title="Resume membership"
                desc="Restart monthly billing and remove the pause."
                btn="Resume" tone="primary" pending={resume.isPending}
                onClick={() => resume.mutate({ id }, { onSuccess: () => setManageOpen(false) })} />
            ) : (
              <ManageRow icon={<Pause className="w-4 h-4 text-amber-600" />} title="Pause membership"
                desc="Stop billing temporarily. They keep their spot; no charges while paused."
                btn="Pause" tone="amber" pending={pause.isPending}
                onClick={() => { if (window.confirm("Pause this membership now?")) pause.mutate({ id }, { onSuccess: () => setManageOpen(false) }); }} />
            )}

            <ManageRow icon={<Ban className="w-4 h-4 text-gray-500" />} title="Cancel with 60-day notice"
              desc="Per the agreement. They can attend until the notice period ends, then it stops."
              btn="Schedule cancellation" tone="default" pending={cancel.isPending}
              onClick={() => { if (window.confirm("Schedule cancellation with a 60-day notice? They can attend until then.")) cancel.mutate({ id, immediate: false }, { onSuccess: () => setManageOpen(false) }); }} />

            <ManageRow icon={<Ban className="w-4 h-4 text-red-600" />} title="Cancel immediately"
              desc="Ends the membership right now. Use only for refunds or special cases."
              btn="Cancel now" tone="danger" pending={cancel.isPending}
              onClick={() => { if (window.confirm("Cancel this membership IMMEDIATELY? This ends it now.")) cancel.mutate({ id, immediate: true }, { onSuccess: () => setManageOpen(false) }); }} />
          </div>
        </Overlay>
      )}
      {attachWaiverOpen && wv && (
        <AttachWaiverModal membershipId={id} waiverData={wv} onClose={() => setAttachWaiverOpen(false)}
          onDone={() => { utils.members.waivers.invalidate({ id }); setAttachWaiverOpen(false); }} />
      )}
      {viewWaiverId !== null && (
        <WaiverViewModal waiverId={viewWaiverId} onClose={() => setViewWaiverId(null)} />
      )}
    </div>
  );
}

/** Downscale a picked/captured image to a max dimension and return a JPEG data URL,
 *  so the uploaded payload stays small regardless of the phone's camera resolution. */
function downscaleImage(file: File, max: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load failed")); };
    img.src = url;
  });
}

/** Student profile photo in the member popup: shows the photo (or a placeholder)
 *  and an Add/Replace control. On a phone or iPad the file input opens the camera. */
function MemberPhoto({ membershipId }: { membershipId: number }) {
  const utils = trpc.useUtils();
  const q = trpc.members.photo.useQuery({ id: membershipId });
  const save = trpc.members.setPhoto.useMutation({
    onSuccess: () => { toast.success("Photo saved."); utils.members.photo.invalidate({ id: membershipId }); },
    onError: (e) => toast.error(e.message ?? "Failed to save photo."),
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try { save.mutate({ id: membershipId, dataUrl: await downscaleImage(file, 640, 0.82) }); }
    catch { toast.error("Couldn't read that image."); }
  };
  const photoUrl = q.data?.photoUrl ?? null;
  const linked = q.data?.linked ?? false;
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
        {photoUrl ? <img src={photoUrl} alt="student" className="w-full h-full object-cover" /> : <Camera className="w-5 h-5 text-gray-300" />}
      </div>
      <div className="min-w-0">
        {linked ? (
          <>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
            <button onClick={() => inputRef.current?.click()} disabled={save.isPending}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1a2d5a] border border-[#1a2d5a]/30 hover:bg-[#1a2d5a]/5 rounded-lg px-2.5 py-1.5 disabled:opacity-50">
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} {photoUrl ? "Replace photo" : "Add photo"}
            </button>
            <p className="text-[11px] text-gray-400 mt-1">On a phone or iPad this opens the camera.</p>
          </>
        ) : <p className="text-[11px] text-gray-400">Link a roster student to add a photo.</p>}
      </div>
    </div>
  );
}

function PaymentHistorySection({ membershipId }: { membershipId: number }) {
  const q = trpc.members.paymentHistory.useQuery({ id: membershipId });
  if (q.isLoading) return <div className="py-2 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <div className="text-xs text-gray-500">No recorded payments yet. Legacy payments imported from ZenPlanner and real charges will appear here.</div>;
  return (
    <div className="space-y-1">
      {rows.map(p => (
        <div key={p.id} className="flex items-center gap-2 text-xs text-gray-600 border-b border-gray-50 pb-1">
          <span className="tabular-nums text-gray-400 shrink-0">{String(p.paidAt).slice(0, 10)}</span>
          <span className="font-medium text-gray-800 tabular-nums">{fmt(p.amountCents)}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">{p.method}</span>
          {p.note ? <span className="ml-auto text-gray-400 truncate max-w-[150px]">{p.note}</span> : null}
        </div>
      ))}
    </div>
  );
}

function BeltSection({ membershipId }: { membershipId: number }) {
  const q = trpc.members.beltForMember.useQuery({ id: membershipId });
  const [editOpen, setEditOpen] = useState(false);

  if (q.isLoading) return <div className="py-3 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>;
  const data = q.data;
  if (!data) return null;
  if (!data.linked || !data.status) {
    return <div className="text-xs text-gray-500">No martial-arts roster record is linked to this member, so belt tracking is not available. Add them to the students roster to track belts.</div>;
  }
  const s = data.status;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Current belt</div>
          <div className="font-semibold text-[#1a2d5a] flex items-center gap-1.5"><Award className="w-4 h-4" /> {s.currentRank}</div>
        </div>
        <span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium ${s.ready ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>{s.ready ? "Ready to test" : "Not ready"}</span>
      </div>

      <div className="text-xs text-gray-600">
        {s.threshold ? (
          <span>Classes since last promotion: <b className="tabular-nums">{s.classesSince}</b> / {s.threshold.classes} · months at rank <b className="tabular-nums">{s.monthsSince ?? "?"}</b> / {s.threshold.months}</span>
        ) : <span>Pre-Black and Dan ranks are by invitation (no auto threshold).</span>}
      </div>

      <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1a2d5a] border border-[#1a2d5a]/30 hover:bg-[#1a2d5a]/5 rounded-lg px-2.5 py-1.5">
        <SlidersHorizontal className="w-3.5 h-3.5" /> Edit belt &amp; testing
      </button>

      {editOpen && <BeltEditModal membershipId={membershipId} status={s} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

/** Belt & testing editor popup: set rank (dropdown or up/down), set testing readiness
 *  (dropdown override vs auto), and read the promotion history. Opened from the Belt &
 *  testing section so the panel stays a summary and the controls live in one place. */
function BeltEditModal({ membershipId, status: s, onClose }: {
  membershipId: number;
  status: { studentId: number; currentRank: string; prevRank: string | null; nextRank: string | null; ready: boolean; manualReadiness: string | null; threshold: { classes: number; months: number } | null; classesSince: number; monthsSince: number | null; history: Array<{ id: number; direction: string; fromRank: string | null; toRank: string; promotedBy: string | null; createdAt: string | Date }> };
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const refresh = () => utils.members.beltForMember.invalidate({ id: membershipId });
  const opts = { onSuccess: () => refresh(), onError: (e: { message?: string }) => toast.error(e.message ?? "Failed.") };
  const promote = trpc.students.promoteBelt.useMutation({ ...opts, onSuccess: () => { toast.success("Promoted."); refresh(); } });
  const demote = trpc.students.demoteBelt.useMutation({ ...opts, onSuccess: () => { toast.success("Rank adjusted."); refresh(); } });
  const setBelt = trpc.students.setBelt.useMutation({ ...opts, onSuccess: () => { toast.success("Rank set."); refresh(); } });
  const setReadiness = trpc.students.setReadiness.useMutation({ ...opts, onSuccess: () => { toast.success("Readiness updated."); refresh(); } });
  const readinessVal = s.manualReadiness ?? "auto";
  const sel = "border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/20 focus:border-[#1a2d5a]/40";
  return (
    <Overlay onClose={onClose} title="Belt & testing" wide>
      <div className="space-y-4">
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1.5">Belt rank</div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => demote.mutate({ studentId: s.studentId })} disabled={!s.prevRank || demote.isPending} title="Down one rank" className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5 disabled:opacity-40"><ArrowDown className="w-3.5 h-3.5" /> Down</button>
            <select value={s.currentRank} onChange={e => setBelt.mutate({ studentId: s.studentId, toRank: e.target.value })} className={sel}>
              {BELT_SEQUENCE.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button onClick={() => promote.mutate({ studentId: s.studentId })} disabled={!s.nextRank || promote.isPending} title="Up one rank" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1a2d5a] border border-[#1a2d5a]/30 hover:bg-[#1a2d5a]/5 rounded-lg px-2 py-1.5 disabled:opacity-40"><ArrowUp className="w-3.5 h-3.5" /> Up</button>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1.5">Testing readiness</div>
          <select value={readinessVal} onChange={e => setReadiness.mutate({ studentId: s.studentId, value: e.target.value as "ready" | "not_ready" | "auto" })} className={sel}>
            <option value="auto">Auto (from attendance)</option>
            <option value="ready">Ready to test</option>
            <option value="not_ready">Not ready</option>
          </select>
        </div>

        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
          {s.threshold ? (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <span>Classes since last promotion: <b className="tabular-nums">{s.classesSince}</b> / {s.threshold.classes}</span>
              <span>Months at rank: <b className="tabular-nums">{s.monthsSince ?? "?"}</b> / {s.threshold.months}</span>
            </div>
          ) : <span>Pre-Black and Dan ranks are by invitation (no auto threshold).</span>}
          <div className="text-[11px] text-gray-400 mt-1">Attendance is from kiosk check-ins and may be approximate. Use the readiness override to decide.</div>
        </div>

        {s.history.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Promotion history</div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {s.history.map(h => (
                <div key={h.id} className="text-xs text-gray-600 flex items-center gap-2">
                  <span className="tabular-nums text-gray-400 shrink-0">{String(h.createdAt).slice(0, 10)}</span>
                  <span className="capitalize text-gray-400">{h.direction}</span>
                  <span>{h.fromRank ? `${h.fromRank} → ` : ""}{h.toRank}</span>
                  {h.promotedBy ? <span className="ml-auto text-[10px] text-gray-400 truncate">{h.promotedBy}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

function WaiverKindRow({ label, data, onView, onAttach }: {
  label: string;
  data: { status: "on_file" | "missing" | "needs_review" | "na"; waivers: Array<{ id: number; attested: boolean; signedName: string | null; signedDate: string; needsReview: boolean }> };
  onView: (id: number) => void; onAttach: () => void;
}) {
  if (data.status === "na") return null;
  const badge = data.status === "on_file" ? { t: "On file", c: "bg-green-100 text-green-800 border-green-200" }
    : data.status === "needs_review" ? { t: "Needs review", c: "bg-amber-100 text-amber-800 border-amber-200" }
    : { t: "Missing", c: "bg-red-100 text-red-700 border-red-200" };
  return (
    <div className="border border-gray-200 rounded-lg p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium shrink-0 ${badge.c}`}>{badge.t}</span>
      </div>
      {data.waivers.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {data.waivers.map(w => (
            <button key={w.id} onClick={() => onView(w.id)} className="w-full flex items-center gap-2 text-xs text-left text-gray-600 hover:text-[#1a2d5a] hover:bg-gray-50 rounded px-1.5 py-1">
              {w.attested ? <ShieldCheck className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <FileSignature className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
              <span className="truncate">{w.attested ? "Attested on file" : "Signed"} · {w.signedDate}{w.signedName ? ` · ${w.signedName}` : ""}</span>
              {w.needsReview ? <span className="text-amber-600 text-[10px] shrink-0">review match</span> : null}
              <span className="ml-auto text-[#1a2d5a] font-medium shrink-0">View</span>
            </button>
          ))}
        </div>
      )}
      {(data.status === "missing" || data.status === "needs_review") && (
        <button onClick={onAttach} className="mt-1.5 text-xs font-semibold text-[#1a2d5a] hover:underline">
          {data.status === "needs_review" ? "Confirm or attach a waiver →" : "Attach waiver →"}
        </button>
      )}
    </div>
  );
}

function AttachWaiverModal({ membershipId, waiverData, onClose, onDone }: {
  membershipId: number;
  waiverData: { martialArts: { status: string }; afterschool: { status: string } };
  onClose: () => void; onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState<string | null>(null);
  const attest = trpc.members.attestWaiver.useMutation({
    onSuccess: () => { toast.success("Recorded on file."); onDone(); },
    onError: (e) => toast.error(e.message ?? "Failed."),
  });
  const getLink = async (kind: "martial_arts" | "afterschool") => utils.members.generateWaiverLink.fetch({ id: membershipId, kind });
  const copyLink = async (kind: "martial_arts" | "afterschool") => {
    setBusy(`${kind}-copy`);
    try { const r = await getLink(kind); await navigator.clipboard.writeText(r.url); toast.success("Signing link copied."); }
    catch { toast.error("Could not get link."); } finally { setBusy(null); }
  };
  const openLink = async (kind: "martial_arts" | "afterschool") => {
    try { const r = await getLink(kind); window.open(r.url, "_blank", "noopener"); }
    catch { toast.error("Could not open link."); }
  };
  const textParent = async (kind: "martial_arts" | "afterschool") => {
    try {
      const r = await getLink(kind);
      if (!r.phone) { toast.error("No phone number on file for this family."); return; }
      const label = kind === "afterschool" ? "after-school" : "martial arts";
      const body = `Hi! Please sign your Top Martial Arts ${label} form here: ${r.url}`;
      // sms: opens the messaging app with the number + message prefilled (mobile / iPad).
      window.location.href = `sms:${r.phone.replace(/[^0-9+]/g, "")}?&body=${encodeURIComponent(body)}`;
    } catch { toast.error("Could not build the text."); }
  };
  const doAttest = (kind: "martial_arts" | "afterschool") => {
    const note = window.prompt("Optional note (e.g. 'paper waiver in file cabinet'):") ?? undefined;
    attest.mutate({ id: membershipId, kind, note: note || undefined });
  };
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyDate, setLegacyDate] = useState("");
  const [legacyUrl, setLegacyUrl] = useState("");
  const [legacySigner, setLegacySigner] = useState("");
  const importLegacy = trpc.members.importLegacyWaiver.useMutation({
    onSuccess: () => { toast.success("Legacy waiver recorded."); onDone(); },
    onError: (e) => toast.error(e.message ?? "Failed."),
  });
  // Both forms are always selectable from the dropdown, even one the system marks
  // "na" for this member (e.g. a martial-arts waiver on an after-school-only kid who
  // also trains) — staff decide what a family needs, not the auto-match.
  const ALL_KINDS = [
    { key: "martial_arts" as const, label: "Martial Arts agreement (TKD / Kickboxing / BJJ)", status: waiverData.martialArts.status },
    { key: "afterschool" as const, label: "After-School waiver", status: waiverData.afterschool.status },
  ];
  const firstNeeded = ALL_KINDS.find(k => k.status !== "na") ?? ALL_KINDS[0];
  const [selectedKind, setSelectedKind] = useState<"martial_arts" | "afterschool">(firstNeeded.key);
  const active = ALL_KINDS.find(k => k.key === selectedKind)!;
  const statusLabel = (s: string) => s === "na" ? "not usually required" : s.replace("_", " ");
  return (
    <Overlay onClose={onClose} title="Add / attach a waiver" wide>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Pick which form to append, then send the signing link to the parent, open it on the front-desk iPad to sign now, or attest that a signed paper waiver is already on file. A student may need more than one, so attach one, then reopen this to add another.</p>

        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Which form?</span>
          <select value={selectedKind} onChange={e => setSelectedKind(e.target.value as "martial_arts" | "afterschool")}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/20 focus:border-[#1a2d5a]/40">
            {ALL_KINDS.map(k => (
              <option key={k.key} value={k.key}>{k.label} — {statusLabel(k.status)}</option>
            ))}
          </select>
        </label>

        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-sm font-semibold text-gray-800 mb-2">{active.label} <span className="text-xs font-normal text-gray-400">({statusLabel(active.status)})</span></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => textParent(active.key)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a2d5a] hover:bg-[#142347] rounded px-2.5 py-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Text to parent
            </button>
            <button onClick={() => copyLink(active.key)} disabled={busy === `${active.key}-copy`} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a2d5a] border border-[#1a2d5a]/30 hover:bg-[#1a2d5a]/5 rounded px-2.5 py-1.5 disabled:opacity-50">
              {busy === `${active.key}-copy` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />} Copy signing link
            </button>
            <button onClick={() => openLink(active.key)} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 hover:border-[#1a2d5a]/40 rounded px-2.5 py-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Open on this device
            </button>
            <button onClick={() => doAttest(active.key)} disabled={attest.isPending} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:border-gray-300 rounded px-2.5 py-1.5 disabled:opacity-50">
              <ShieldCheck className="w-3.5 h-3.5" /> Attest on file (paper)
            </button>
          </div>

          {/* Import an EXISTING signed waiver with its original date (migration). */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button onClick={() => setLegacyOpen(o => !o)} className="text-xs font-semibold text-[#1a2d5a] hover:underline">
              {legacyOpen ? "− Hide" : "+ Import an existing signed waiver (with its original date)"}
            </button>
            {legacyOpen && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2 items-center text-xs">
                  <label className="flex items-center gap-1 text-gray-600">Signed on
                    <input type="date" value={legacyDate} onChange={e => setLegacyDate(e.target.value)} className="border border-gray-300 rounded px-2 py-1" /></label>
                  <input value={legacySigner} onChange={e => setLegacySigner(e.target.value)} placeholder="Signer (optional)" className="border border-gray-300 rounded px-2 py-1 flex-1 min-w-[120px]" />
                </div>
                <input value={legacyUrl} onChange={e => setLegacyUrl(e.target.value)} placeholder="Document link (optional, e.g. scanned PDF URL)" className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                <button
                  onClick={() => { if (!legacyDate) { toast.error("Enter the original signed date."); return; } importLegacy.mutate({ id: membershipId, kind: active.key, originalSignedDate: legacyDate, documentUrl: legacyUrl.trim() || undefined, signedName: legacySigner.trim() || undefined }); }}
                  disabled={importLegacy.isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a2d5a] hover:bg-[#142347] rounded px-2.5 py-1.5 disabled:opacity-50">
                  {importLegacy.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSignature className="w-3.5 h-3.5" />} Record {active.label.split(" ")[0]} waiver
                </button>
                <p className="text-[11px] text-gray-400">Records the {active.label} waiver as signed on the date you enter (not today), tagged as a legacy import.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function WaiverViewModal({ waiverId, onClose }: { waiverId: number; onClose: () => void }) {
  const q = trpc.members.waiverDetail.useQuery({ waiverId });
  const w = q.data;
  const attested = !!w && (w.source || "").startsWith("attested");
  return (
    <Overlay onClose={onClose} title={attested ? "Attested waiver" : "Signed waiver"} xwide>
      {q.isLoading ? (
        <div className="py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : !w ? (
        <div className="py-8 text-center text-sm text-gray-400">Waiver not found.</div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="text-xs text-gray-500">{attested ? "Attested" : "Signed"} on {w.signedDate}{w.signedName ? ` · ${w.signedName}` : ""}</div>
          {w.pdfUrl ? <a href={w.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a2d5a] hover:underline"><ExternalLink className="w-4 h-4" /> Open signed PDF</a> : null}
          {w.signatureData && !attested ? (
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">Signature</div>
              <img src={w.signatureData} alt="signature" className="max-h-40 border border-gray-200 rounded bg-white" />
            </div>
          ) : null}
          {w.disclaimerText ? (
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">Agreed wording</div>
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-xs text-gray-700">{w.disclaimerText}</div>
            </div>
          ) : null}
        </div>
      )}
    </Overlay>
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

/** One action row inside the "Manage plan" popup: an icon + title + description on
 *  the left and a single action button on the right. Keeps pause / cancel / cancel-now
 *  behind one entry point instead of three loose buttons on the Overview. */
function ManageRow({ icon, title, desc, btn, tone, pending, onClick }: {
  icon: React.ReactNode; title: string; desc: string; btn: string;
  tone: "primary" | "amber" | "danger" | "default"; pending?: boolean; onClick: () => void;
}) {
  const toneCls = tone === "primary" ? "text-white bg-[#1a2d5a] hover:bg-[#142347] border-[#1a2d5a]"
    : tone === "amber" ? "text-amber-800 border-amber-300 hover:bg-amber-50"
    : tone === "danger" ? "text-red-600 border-red-200 hover:bg-red-50"
    : "text-gray-700 border-gray-200 hover:border-[#1a2d5a]/40";
  return (
    <div className="flex items-start gap-3 border border-gray-200 rounded-lg p-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="text-xs text-gray-500">{desc}</div>
      </div>
      <button onClick={onClick} disabled={pending}
        className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-2.5 py-1.5 disabled:opacity-50 ${toneCls}`}>
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{btn}
      </button>
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
