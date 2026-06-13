import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Phone, User, Loader2, CalendarDays } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths,
} from "date-fns";

// Booked trials live on the leads table (trialClassDate). We read them straight
// from leads.getAll so the calendar is always in sync with the pipeline, there
// is no separate calendar store to drift.
type Lead = {
  id: number;
  parentName: string;
  kidName: string;
  kidAge: string;
  programInterest: string;
  phone: string;
  pipelineStage: string;
  trialClassDate: string | null;
  trialClassTime: string | null;
};

// trialClassDate is a "YYYY-MM-DD" string. Parse at local noon so it never
// shifts a day across time zones (same trick formatDate uses).
const parseLocal = (s: string) => new Date(s + "T12:00:00");
const keyOf = (d: Date) => format(d, "yyyy-MM-dd");

const STAGE_STYLE: Record<string, { dot: string; pill: string; label: string }> = {
  trial_scheduled: { dot: "bg-blue-500", pill: "bg-blue-100 text-blue-800 border-blue-200", label: "Scheduled" },
  trial_paid: { dot: "bg-indigo-500", pill: "bg-indigo-100 text-indigo-800 border-indigo-200", label: "Paid trial" },
  trial_attended: { dot: "bg-green-500", pill: "bg-green-100 text-green-800 border-green-200", label: "Attended" },
  enrolled: { dot: "bg-emerald-600", pill: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Enrolled" },
  no_show: { dot: "bg-amber-500", pill: "bg-amber-100 text-amber-800 border-amber-200", label: "No-show" },
  no_show_final: { dot: "bg-red-500", pill: "bg-red-100 text-red-800 border-red-200", label: "No-show (final)" },
  lost: { dot: "bg-gray-400", pill: "bg-gray-100 text-gray-600 border-gray-200", label: "Lost" },
};
const styleFor = (s: string) => STAGE_STYLE[s] ?? { dot: "bg-slate-400", pill: "bg-slate-100 text-slate-700 border-slate-200", label: s };
const firstName = (full: string) => (full || "").trim().split(/\s+/)[0] || full;

export default function CalendarView() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<{ date: Date; items: Lead[] } | null>(null);
  const { data: leads = [], isLoading } = trpc.leads.getAll.useQuery();

  const booked = useMemo(
    () => (leads as Lead[]).filter(l => !!l.trialClassDate),
    [leads]
  );

  // date string -> bookings on that day
  const byDay = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const l of booked) {
      const k = l.trialClassDate as string;
      (m.get(k) ?? m.set(k, []).get(k)!).push(l);
    }
    return m;
  }, [booked]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const monthCount = useMemo(
    () => booked.filter(l => isSameMonth(parseLocal(l.trialClassDate as string), month)).length,
    [booked, month]
  );

  const upcoming = useMemo(() => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    return [...booked]
      .filter(l => (l.trialClassDate as string) >= todayKey)
      .sort((a, b) => (a.trialClassDate! < b.trialClassDate! ? -1 : a.trialClassDate! > b.trialClassDate! ? 1 : 0))
      .slice(0, 12);
  }, [booked]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading calendar...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#1a2d5a] flex items-center gap-2">
            <CalendarDays className="w-5 h-5" /> {format(month, "MMMM yyyy")}
          </h2>
          <span className="text-sm text-gray-500">{monthCount} booked {monthCount === 1 ? "trial" : "trials"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Month grid */}
      <Card>
        <CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const items = byDay.get(keyOf(day)) ?? [];
              const inMonth = isSameMonth(day, month);
              const today = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => items.length && setSelected({ date: day, items })}
                  className={`min-h-[84px] text-left rounded-lg border p-1.5 align-top transition-colors ${
                    inMonth ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 text-gray-400"
                  } ${items.length ? "hover:border-[#1a2d5a] cursor-pointer" : "cursor-default"}`}
                >
                  <div className={`text-xs font-semibold mb-1 inline-flex items-center justify-center w-6 h-6 rounded-full ${
                    today ? "bg-[#c41e3a] text-white" : inMonth ? "text-gray-700" : "text-gray-400"
                  }`}>{format(day, "d")}</div>
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map(it => {
                      const st = styleFor(it.pipelineStage);
                      return (
                        <div key={it.id} className={`truncate text-[10px] leading-tight px-1 py-0.5 rounded border ${st.pill}`}>
                          {it.trialClassTime ? `${it.trialClassTime} ` : ""}{firstName(it.kidName)}
                        </div>
                      );
                    })}
                    {items.length > 3 && <div className="text-[10px] text-gray-500 pl-1">+{items.length - 3} more</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        {["trial_scheduled", "trial_attended", "no_show", "enrolled"].map(s => {
          const st = styleFor(s);
          return <span key={s} className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />{st.label}</span>;
        })}
      </div>

      {/* Upcoming list */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold text-[#1a2d5a] mb-3">Upcoming trials</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming booked trials.</p>
          ) : (
            <div className="divide-y">
              {upcoming.map(it => {
                const st = styleFor(it.pipelineStage);
                return (
                  <div key={it.id} className="flex items-center gap-3 py-2.5">
                    <div className="text-center w-12 shrink-0">
                      <div className="text-[10px] uppercase text-gray-400">{format(parseLocal(it.trialClassDate as string), "EEE")}</div>
                      <div className="text-lg font-bold text-[#1a2d5a] leading-none">{format(parseLocal(it.trialClassDate as string), "d")}</div>
                      <div className="text-[10px] text-gray-400">{format(parseLocal(it.trialClassDate as string), "MMM")}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {it.kidName}{it.kidAge ? ` (${it.kidAge})` : ""} {it.trialClassTime ? `· ${it.trialClassTime}` : ""}
                      </div>
                      <div className="text-xs text-gray-500 truncate capitalize">{it.programInterest} · {it.parentName}</div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${st.pill}`}>{st.label}</span>
                    {it.phone && <a href={`tel:${it.phone}`} className="text-[#c41e3a] shrink-0" title={it.phone}><Phone className="w-4 h-4" /></a>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1a2d5a]">
              {selected ? format(selected.date, "EEEE, MMMM d") : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {selected?.items.map(it => {
              const st = styleFor(it.pipelineStage);
              return (
                <div key={it.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      {it.kidName}{it.kidAge ? ` (${it.kidAge})` : ""}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${st.pill}`}>{st.label}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1 capitalize">
                    {it.programInterest}{it.trialClassTime ? ` · ${it.trialClassTime}` : ""}
                  </div>
                  <div className="text-sm text-gray-500 mt-1 flex items-center justify-between">
                    <span>{it.parentName}</span>
                    {it.phone && <a href={`tel:${it.phone}`} className="text-[#c41e3a] inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{it.phone}</a>}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
