import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Loader2, Users, UserPlus, Search, CheckCircle2, AlertTriangle, FileText,
  CalendarCheck,
} from "lucide-react";
import { CreateForm } from "@/components/admin/MembershipsView";
import { useMemberDock } from "@/components/admin/MemberDock";
import BulkAddMembers from "@/components/admin/BulkAddMembers";
import LegacyPaymentImport from "@/components/admin/LegacyPaymentImport";
import { UsersRound, Receipt } from "lucide-react";

/**
 * Members — the unified People→Members screen. One row per person, unioned from
 * memberships + afterschool registrations by server/members.ts. Click a row to open
 * the command-center popup (the membership detail). Afterschool-only members show a
 * "Set up billing" action that promotes them to a real membership first.
 */

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "taekwondo", label: "Taekwondo" },
  { key: "kickboxing", label: "Kickboxing" },
  { key: "bjj", label: "BJJ" },
  { key: "afterschool", label: "After-School" },
];

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  paused: "bg-amber-100 text-amber-800 border-amber-200",
  canceled: "bg-gray-100 text-gray-500 border-gray-200",
};

const AVATAR_BG = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700"];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() ?? "").join("") || "?";
const avatarColor = (name: string) => AVATAR_BG[name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_BG.length];

type Member = {
  key: string; primaryMembershipId: number | null; afterschoolRegId: number | null;
  name: string; parentName: string | null; email: string | null; phone: string | null;
  programs: string[]; programLabels: string[]; status: string;
  billing: "up_to_date" | "past_due" | "setup_needed" | "none";
  waiver: "on_file" | "missing" | "na"; monthlyCents: number; payerId: number | null;
};

export default function MembersView() {
  const overview = trpc.members.overview.useQuery();
  const list = trpc.members.list.useQuery();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [importingPayments, setImportingPayments] = useState(false);
  const dock = useMemberDock();

  // Deep-link ?open=<membershipId> (assistant / other views) opens the docked panel.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    if (openId && /^\d+$/.test(openId)) dock.open(Number(openId));
    if (params.get("autopay") === "ok") toast.success("Autopay set up — card is on file.");
    if (openId || params.get("autopay")) {
      params.delete("open"); params.delete("autopay");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const setupBilling = trpc.members.setupAfterschoolBilling.useMutation({
    onSuccess: (r) => { if (!r.existed) refresh(); dock.open(r.membershipId); },
    onError: (e) => toast.error(e.message),
  });

  const refresh = () => { utils.members.list.invalidate(); utils.members.overview.invalidate(); };

  const rows = (list.data ?? []) as Member[];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(m => {
      if (tab !== "all" && !m.programs.includes(tab)) return false;
      if (!needle) return true;
      return [m.name, m.parentName, m.phone, m.email].some(v => (v ?? "").toLowerCase().includes(needle));
    });
  }, [rows, tab, q]);

  const ov = overview.data;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Tabs + add */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm font-medium rounded-lg px-3 py-1.5 border transition-colors ${tab === t.key ? "bg-[#1a2d5a] text-white border-[#1a2d5a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setBulkAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1a2d5a] border border-[#1a2d5a]/30 hover:bg-[#1a2d5a]/5 rounded-lg px-3 py-2">
            <UsersRound className="w-4 h-4" /> Bulk add
          </button>
          <button onClick={() => setImportingPayments(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1a2d5a] border border-[#1a2d5a]/30 hover:bg-[#1a2d5a]/5 rounded-lg px-3 py-2">
            <Receipt className="w-4 h-4" /> Import payments
          </button>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#1a2d5a] hover:bg-[#142347] rounded-lg px-3 py-2">
            <UserPlus className="w-4 h-4" /> Add member
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={<Users className="w-5 h-5" />} tone="navy" label="Total members" value={ov?.total} sub="Active across all programs" />
        <StatTile icon={<CalendarCheck className="w-5 h-5" />} tone="green" label="Active this month" value={ov?.activeThisMonth} sub={ov ? `${ov.total ? Math.round((ov.activeThisMonth / ov.total) * 100) : 0}% of members` : ""} />
        <StatTile icon={<AlertTriangle className="w-5 h-5" />} tone="amber" label="Billing issues" value={ov?.billingIssues} sub="Need attention" onClick={ov?.billingIssues ? () => setTab("all") : undefined} />
        <StatTile icon={<FileText className="w-5 h-5" />} tone="violet" label="Waivers missing" value={ov?.waiversMissing} sub="Afterschool, unsigned" />
      </div>

      {/* Search + table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search members by name, parent, or phone..."
              className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/20 focus:border-[#1a2d5a]/40" />
          </div>
        </div>

        {list.isLoading ? (
          <div className="text-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">{rows.length === 0 ? "No members yet. Click \"Add member\" to create one." : "No members match this filter."}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="bg-gray-50 border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5 font-semibold">Member</th>
                <th className="px-4 py-2.5 font-semibold">Programs</th>
                <th className="px-4 py-2.5 font-semibold">Parent</th>
                <th className="px-4 py-2.5 font-semibold">Billing</th>
                <th className="px-4 py-2.5 font-semibold">Waiver</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody>
                {filtered.map(m => (
                  <MemberRow key={m.key} m={m}
                    onOpen={() => {
                      if (m.primaryMembershipId) dock.open(m.primaryMembershipId, m.name);
                      else if (m.afterschoolRegId) setupBilling.mutate({ afterschoolRegId: m.afterschoolRegId });
                    }}
                    setupPending={setupBilling.isPending} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 ? (
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">Showing {filtered.length} of {rows.length} members</div>
        ) : null}
      </div>

      {creating && <CreateForm onClose={() => setCreating(false)} onCreated={refresh} />}
      {importingPayments && <LegacyPaymentImport onClose={() => setImportingPayments(false)} onDone={() => { refresh(); setImportingPayments(false); }} />}
      {bulkAdding && <BulkAddMembers onClose={() => setBulkAdding(false)} onDone={() => { refresh(); utils.members.rosterCandidates.invalidate(); setBulkAdding(false); }} />}
    </div>
  );
}

function StatTile({ icon, tone, label, value, sub, onClick }: { icon: React.ReactNode; tone: "navy" | "green" | "amber" | "violet"; label: string; value: number | undefined; sub?: string; onClick?: () => void }) {
  const toneMap = {
    navy: "bg-[#1a2d5a]/10 text-[#1a2d5a]", green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700", violet: "bg-violet-100 text-violet-700",
  } as const;
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`text-left bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3 ${onClick ? "hover:border-gray-300 cursor-pointer" : "cursor-default"}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${toneMap[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 truncate">{label}</div>
        <div className="text-2xl font-bold text-gray-900 leading-tight tabular-nums">{value ?? "—"}</div>
        {sub ? <div className="text-[11px] text-gray-400 truncate">{sub}</div> : null}
      </div>
    </button>
  );
}

function BillingCell({ m }: { m: Member }) {
  if (m.billing === "up_to_date") return <span className="inline-flex items-center gap-1.5 text-green-700"><CheckCircle2 className="w-4 h-4" /> Up to date</span>;
  if (m.billing === "past_due") return <span className="inline-flex items-center gap-1.5 text-red-600 font-medium"><AlertTriangle className="w-4 h-4" /> Past due</span>;
  if (m.billing === "setup_needed") return <span className="inline-flex items-center gap-1.5 text-amber-600 font-medium"><AlertTriangle className="w-4 h-4" /> Setup needed</span>;
  return <span className="text-gray-400">—</span>;
}

function MemberRow({ m, onOpen, setupPending }: { m: Member; onOpen: () => void; setupPending: boolean }) {
  // Afterschool-only members have no membership row yet; opening them promotes the
  // registration to a membership shell (idempotent, no charge while payments are off)
  // so their profile, waivers, and belt are reachable like any other member.
  const afterschoolOnly = !m.primaryMembershipId && !!m.afterschoolRegId;
  const clickable = !!m.primaryMembershipId || afterschoolOnly;
  return (
    <tr onClick={clickable ? onOpen : undefined} className={`border-b border-gray-100 ${clickable ? "hover:bg-gray-50 cursor-pointer" : ""}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColor(m.name)}`}>{initials(m.name)}</div>
          <div className="min-w-0">
            <div className="font-medium text-gray-900 truncate">{m.name}</div>
            {m.monthlyCents > 0 ? <div className="text-xs text-gray-400 tabular-nums">${(m.monthlyCents / 100).toFixed(0)}/mo</div> : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {m.programLabels.map(p => <span key={p} className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">{p}</span>)}
        </div>
      </td>
      <td className="px-4 py-3">
        {m.parentName ? <div className="text-gray-800 truncate max-w-[160px]">{m.parentName}</div> : <span className="text-gray-400">—</span>}
        {m.phone ? <div className="text-xs text-gray-400">{m.phone}</div> : null}
      </td>
      <td className="px-4 py-3"><BillingCell m={m} /></td>
      <td className="px-4 py-3">
        {m.waiver === "on_file" ? <span className="text-green-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> On file</span>
          : m.waiver === "missing" ? <span className="text-amber-600 font-medium">Missing</span>
          : <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-3"><span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium capitalize ${STATUS_STYLE[m.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>{m.status}</span></td>
      <td className="px-4 py-3 text-right">
        {afterschoolOnly ? (
          <button onClick={(e) => { e.stopPropagation(); onOpen(); }} disabled={setupPending}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#1a2d5a] border border-[#1a2d5a]/30 hover:bg-[#1a2d5a] hover:text-white rounded px-2 py-1 transition-colors disabled:opacity-50">
            {setupPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Open profile
          </button>
        ) : null}
      </td>
    </tr>
  );
}
