import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, GraduationCap, CalendarClock, CheckCircle2, XCircle, Ban, Pencil } from "lucide-react";
import { LeadDetailDialog } from "@/components/admin/LeadsPipeline";

/**
 * Trials, the free-intro → paid 3-week → converted lifecycle in one screen.
 *
 * Two populations, one view:
 *  - Free intro classes: CRM leads who booked a free class (trialClassDate set) and
 *    haven't bought the $99 3-week trial yet. The goal is to convert them.
 *  - Paid 3-week trials ($99 / 21 days, trialEnrollments): active ones show a
 *    progress bar + days left + an editable start date (trial.updateStartDate, which
 *    re-arms the 7/3/2/1-day end-of-trial Telegram pings). Past = converted/expired/
 *    canceled.
 *
 * Clicking a person opens their CRM record (LeadDetailDialog) when a lead exists.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const parseYMD = (s: string | null | undefined): Date | null => (s && YMD.test(s) ? new Date(s + "T12:00:00") : null);
const todayNoon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
const fmtDate = (s: string | null | undefined) => { const d = parseYMD(s); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-"; };

const INTRO_STAGES = new Set(["trial_scheduled", "trial_attended", "no_show"]);

export default function TrialsView() {
  const trials = trpc.trial.list.useQuery();
  const leadsQ = trpc.leads.getAll.useQuery();
  const utils = trpc.useUtils();
  const [selectedLead, setSelectedLead] = useState<any>(null);

  const leads = leadsQ.data ?? [];
  const leadById = useMemo(() => new Map(leads.map((l: any) => [l.id, l])), [leads]);
  const openLead = (leadId: number | null | undefined) => { if (leadId && leadById.has(leadId)) setSelectedLead(leadById.get(leadId)); };

  const rows = (trials.data ?? []) as any[];
  const active = rows.filter(t => t.status === "active");
  const past = rows.filter(t => ["converted", "expired", "canceled", "pending"].includes(t.status));

  // Free intro leads: booked a free class, not yet a paid 3-week. Exclude anyone
  // who already has ANY trial on file (matched by email), including a pending one,
  // which already shows under Past as "Awaiting payment", so they don't double-show.
  const paidEmails = new Set(rows.filter(t => t.email).map(t => String(t.email).toLowerCase()));
  const introLeads = leads.filter((l: any) =>
    INTRO_STAGES.has(l.pipelineStage) && l.trialClassDate && !paidEmails.has(String(l.email ?? "").toLowerCase())
  );

  const setStatus = trpc.trial.setStatus.useMutation({
    onSuccess: () => { toast.success("Trial updated."); utils.trial.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const loading = trials.isLoading || leadsQ.isLoading;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1a2d5a]/10 flex items-center justify-center shrink-0"><GraduationCap className="w-5 h-5 text-[#1a2d5a]" /></div>
        <div>
          <h1 className="text-xl font-bold text-[#1a2d5a]">Trials</h1>
          <p className="text-sm text-gray-500 mt-0.5">Free intro classes and paid 3-week trials. Convert intros, keep the 21-day window on track.</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* Active 3-week trials */}
          <Section title={`Active 3-week trials`} count={active.length}>
            {active.length === 0 ? (
              <Empty>No active 3-week trials right now.</Empty>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {active.map(t => (
                  <ActiveTrialCard key={t.id} t={t} onOpen={() => openLead(t.leadId)}
                    onConverted={() => setStatus.mutate({ id: t.id, status: "converted" })}
                    onExpired={() => setStatus.mutate({ id: t.id, status: "expired" })}
                    onCancel={() => setStatus.mutate({ id: t.id, status: "canceled" })}
                    busy={setStatus.isPending}
                    onSaved={() => utils.trial.list.invalidate()} />
                ))}
              </div>
            )}
          </Section>

          {/* Free intro classes */}
          <Section title="Free intro classes" count={introLeads.length}>
            {introLeads.length === 0 ? (
              <Empty>No free intro classes booked. New free-class bookings land here.</Empty>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2.5 font-semibold">Student</th>
                    <th className="px-4 py-2.5 font-semibold">Program</th>
                    <th className="px-4 py-2.5 font-semibold">Intro class</th>
                    <th className="px-4 py-2.5 font-semibold">Stage</th>
                  </tr></thead>
                  <tbody>
                    {introLeads.map((l: any) => (
                      <tr key={l.id} onClick={() => setSelectedLead(l)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                        <td className="px-4 py-3"><div className="font-medium text-gray-900">{l.kidName || l.parentName}</div>{l.parentName && l.kidName ? <div className="text-xs text-gray-500">{l.parentName}</div> : null}</td>
                        <td className="px-4 py-3 text-gray-700">{l.programInterest || "-"}</td>
                        <td className="px-4 py-3 text-gray-700">{fmtDate(l.trialClassDate)}{l.trialClassTime ? ` · ${l.trialClassTime}` : ""}</td>
                        <td className="px-4 py-3"><StageBadge stage={l.pipelineStage} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Past trials */}
          <Section title="Past trials" count={past.length}>
            {past.length === 0 ? (
              <Empty>No past trials yet.</Empty>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2.5 font-semibold">Student</th>
                    <th className="px-4 py-2.5 font-semibold">Window</th>
                    <th className="px-4 py-2.5 font-semibold">Outcome</th>
                  </tr></thead>
                  <tbody>
                    {past.map(t => (
                      <tr key={t.id} onClick={() => openLead(t.leadId)} className={`border-b border-gray-100 ${t.leadId ? "hover:bg-gray-50 cursor-pointer" : ""}`}>
                        <td className="px-4 py-3"><div className="font-medium text-gray-900">{t.studentName}</div>{t.programInterest ? <div className="text-xs text-gray-500">{t.programInterest}</div> : null}</td>
                        <td className="px-4 py-3 text-gray-600">{fmtDate(t.startDate)} to {fmtDate(t.endDate)}</td>
                        <td className="px-4 py-3"><TrialStatusBadge status={t.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      <LeadDetailDialog lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)}
        onRefresh={() => { utils.leads.getAll.invalidate(); }} />
    </div>
  );
}

function ActiveTrialCard({ t, onOpen, onConverted, onExpired, onCancel, busy, onSaved }: {
  t: any; onOpen: () => void; onConverted: () => void; onExpired: () => void; onCancel: () => void; busy: boolean; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState<string>(t.startDate ?? "");
  const updateStart = trpc.trial.updateStartDate.useMutation({
    onSuccess: () => { toast.success("Start date updated. End date + reminders re-armed."); setEditing(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const s = parseYMD(t.startDate), e = parseYMD(t.endDate), now = todayNoon();
  const elapsed = s ? Math.min(21, Math.max(0, daysBetween(s, now))) : 0;
  const left = e ? daysBetween(now, e) : null;
  const pct = Math.round((elapsed / 21) * 100);
  const leftTone = left === null ? "text-gray-500" : left <= 3 ? "text-red-600" : left <= 7 ? "text-amber-600" : "text-gray-600";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="text-left min-w-0">
          <div className="font-semibold text-gray-900 truncate hover:text-[#1a2d5a]">{t.studentName}</div>
          <div className="text-xs text-gray-500 truncate">{t.programInterest || "3-week trial"}</div>
        </button>
        <span className={`text-xs font-semibold tabular-nums ${leftTone}`}>{left === null ? "" : left < 0 ? `${Math.abs(left)}d over` : `${left}d left`}</span>
      </div>

      <div className="mt-3">
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${left !== null && left <= 3 ? "bg-red-500" : left !== null && left <= 7 ? "bg-amber-500" : "bg-[#1a2d5a]"}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1 text-[11px] text-gray-500">
          <span>Day {elapsed} of 21</span>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 hover:text-[#1a2d5a]"><Pencil className="w-3 h-3" /> {fmtDate(t.startDate)} to {fmtDate(t.endDate)}</button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <input type="date" value={start} onChange={ev => setStart(ev.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1" />
          <button onClick={() => updateStart.mutate({ id: t.id, startDate: start })} disabled={updateStart.isPending || !YMD.test(start)}
            className="text-xs font-semibold text-white bg-[#1a2d5a] hover:bg-[#142347] rounded px-2 py-1 disabled:opacity-50">
            {updateStart.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
          </button>
          <button onClick={() => { setEditing(false); setStart(t.startDate ?? ""); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-1.5">
        <button onClick={onConverted} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 border border-green-200 hover:bg-green-50 rounded px-2 py-1"><CheckCircle2 className="w-3.5 h-3.5" /> Converted</button>
        <button onClick={onExpired} disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded px-2 py-1"><CalendarClock className="w-3.5 h-3.5" /> Expired</button>
        <button onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-600 border border-transparent hover:border-red-200 rounded px-2 py-1"><Ban className="w-3.5 h-3.5" /> Cancel</button>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">{title}<span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{count}</span></h2>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center text-sm text-gray-400">{children}</div>;
}

const STAGE_LABEL: Record<string, { label: string; cls: string }> = {
  trial_scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  trial_attended: { label: "Attended", cls: "bg-green-100 text-green-800 border-green-200" },
  no_show: { label: "No-show", cls: "bg-red-100 text-red-700 border-red-200" },
};
function StageBadge({ stage }: { stage: string }) {
  const s = STAGE_LABEL[stage] ?? { label: stage, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return <span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium ${s.cls}`}>{s.label}</span>;
}

const TRIAL_STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  converted: { label: "Converted", cls: "text-green-700", icon: CheckCircle2 },
  expired: { label: "Expired", cls: "text-gray-500", icon: CalendarClock },
  canceled: { label: "Canceled", cls: "text-gray-400", icon: XCircle },
  pending: { label: "Awaiting payment", cls: "text-amber-600", icon: CalendarClock },
};
function TrialStatusBadge({ status }: { status: string }) {
  const s = TRIAL_STATUS[status] ?? { label: status, cls: "text-gray-500", icon: CalendarClock };
  const Icon = s.icon;
  return <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.cls}`}><Icon className="w-3.5 h-3.5" /> {s.label}</span>;
}
