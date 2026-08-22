import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2, XCircle, PhoneCall, CalendarDays, Kanban, ArrowRight, Ban } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { LeadDetailDialog } from "@/components/admin/LeadsPipeline";

/**
 * "Today", the front-desk daily driver. One screen for the core loop:
 * who's coming for a trial today, who to call, and marking who showed.
 * Composes existing queries (calls.board + checkin.listForDate); the full
 * views (Today's Calls, Trial Check-in, Leads) remain for detail.
 */

const STAGE_STYLE: Record<string, string> = {
  trial_scheduled: "bg-blue-100 text-blue-800",
  trial_attended: "bg-green-100 text-green-800",
  no_show: "bg-red-100 text-red-700",
  enrolled: "bg-emerald-100 text-emerald-800",
};
const STAGE_LABEL: Record<string, string> = {
  trial_scheduled: "Scheduled", trial_attended: "Showed", no_show: "No-show", enrolled: "Enrolled",
};

function Tile({ label, value, tone = "navy" }: { label: string; value: number; tone?: "navy" | "green" | "amber" }) {
  const tones = { navy: "text-[#1a2d5a]", green: "text-green-700", amber: "text-amber-700" };
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

export default function TodayView() {
  const [, navigate] = useLocation();
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const utils = trpc.useUtils();
  const board = trpc.calls.board.useQuery();
  const checkin = trpc.checkin.listForDate.useQuery({});
  const mark = trpc.checkin.mark.useMutation({
    onSuccess: () => { utils.checkin.listForDate.invalidate(); utils.calls.board.invalidate(); },
  });
  // "Not interested / stop chasing" -> mark Lost. The call board and the active
  // Leads pipeline both exclude 'lost', so this removes them from calls AND the
  // pipeline in one action. Reversible from the Leads view (lost can re-engage).
  const dismiss = trpc.leads.updateStage.useMutation({
    onSuccess: () => { utils.calls.board.invalidate(); utils.checkin.listForDate.invalidate(); },
  });
  const markNotInterested = (lead: any) => {
    const name = lead.kidName || lead.parentName || "this lead";
    if (!window.confirm(`Remove ${name} from the call list and pipeline?\n\nThis marks them "Lost" (for not interested or ignoring outreach). It is reversible from the Leads page.`)) return;
    dismiss.mutate({ id: lead.id, stage: "lost" });
  };

  const today = board.data?.today ?? [];
  const trials = (checkin.data?.leads ?? []) as any[];
  const awaiting = trials.filter(t => t.pipelineStage === "trial_scheduled").length;
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const loading = board.isLoading || checkin.isLoading;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#1a2d5a]">Today</h1>
        <p className="text-sm text-gray-500">{dateStr}</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-3">
            <Tile label="To call today" value={today.length} tone="amber" />
            <Tile label="Trials today" value={trials.length} tone="navy" />
            <Tile label="Awaiting check-in" value={awaiting} tone="green" />
          </div>

          {/* Trials today, mark who showed */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-[#1a2d5a] flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Trials today</h2>
              <button onClick={() => navigate("/admin/checkin")} className="text-xs text-[#1a2d5a] hover:text-[#c41e3a] flex items-center gap-1">Check-in <ArrowRight className="w-3 h-3" /></button>
            </div>
            {trials.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No trials scheduled for today.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {trials.map(t => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 text-sm truncate">{t.kidName || t.parentName}
                        {t.trialClassTime ? <span className="text-gray-400 font-normal"> · {t.trialClassTime}</span> : null}</div>
                      <div className="text-xs text-gray-500 truncate">{t.parentName} · {t.phone}</div>
                    </div>
                    {t.pipelineStage === "trial_scheduled" ? (
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => mark.mutate({ leadId: t.id, showed: true })} disabled={mark.isPending}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 border border-green-300 hover:bg-green-50 rounded px-2 py-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Showed
                        </button>
                        <button onClick={() => mark.mutate({ leadId: t.id, showed: false })} disabled={mark.isPending}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded px-2 py-1">
                          <XCircle className="w-3.5 h-3.5" /> No-show
                        </button>
                      </div>
                    ) : (
                      <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${STAGE_STYLE[t.pipelineStage] ?? "bg-gray-100 text-gray-600"}`}>
                        {STAGE_LABEL[t.pipelineStage] ?? t.pipelineStage}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Who to call today */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-[#1a2d5a] flex items-center gap-2"><PhoneCall className="w-4 h-4" /> Who to call today</h2>
              <button onClick={() => navigate("/admin/calls")} className="text-xs text-[#1a2d5a] hover:text-[#c41e3a] flex items-center gap-1">All calls <ArrowRight className="w-3 h-3" /></button>
            </div>
            {today.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Nobody flagged to call today. Nice.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {today.slice(0, 12).map(({ lead, reason }: any) => (
                  <li key={lead.id} onClick={() => setSelectedLead(lead)}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 text-sm truncate">{lead.kidName || lead.parentName}</div>
                      <div className="text-xs text-gray-500 truncate">{reason}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); markNotInterested(lead); }} disabled={dismiss.isPending}
                      title="Not interested / ignoring outreach, remove from calls + pipeline"
                      className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-600 border border-transparent hover:border-red-200 rounded px-2 py-1 transition-colors">
                      <Ban className="w-3.5 h-3.5" /> Not interested
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {today.length > 12 ? (
              <button onClick={() => navigate("/admin/calls")} className="w-full text-center text-xs text-gray-500 hover:text-[#1a2d5a] py-2 border-t border-gray-100">
                + {today.length - 12} more, open Today's Calls
              </button>
            ) : null}
          </section>

          <div className="flex gap-2">
            <button onClick={() => navigate("/admin/leads")} className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-[#1a2d5a] border border-gray-200 bg-white hover:border-[#1a2d5a]/40 rounded-lg py-2.5">
              <Kanban className="w-4 h-4" /> Open Leads pipeline
            </button>
          </div>
        </>
      )}

      <LeadDetailDialog lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)}
        onRefresh={() => { utils.calls.board.invalidate(); utils.checkin.listForDate.invalidate(); }} />
    </div>
  );
}
