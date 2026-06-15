import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock, X, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// One control, used on the check-in row, the Today's Calls detail, and the lead
// dialog. Pick a date (mobile-friendly calendar) + a note. A future date snoozes
// the lead out of the call list until then; clearing it lets the lead resurface
// in the daily reminders. Saving invalidates the three lists that show leads so
// every view stays in sync.
export function FollowUpControl({ leadId, nextFollowUpAt, followUpNote }: {
  leadId: number;
  nextFollowUpAt?: string | null;
  followUpNote?: string | null;
}) {
  const [date, setDate] = useState<string | null>(nextFollowUpAt ?? null);
  const [note, setNote] = useState(followUpNote ?? "");
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const save = trpc.leads.setFollowUp.useMutation({
    onSuccess: () => {
      utils.leads.getAll.invalidate();
      utils.checkin.listForDate.invalidate();
      utils.calls.listToday.invalidate();
      utils.calls.board.invalidate();
      toast.success("Follow-up saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save follow-up"),
  });

  const selected = date ? new Date(date + "T12:00:00") : undefined;

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5 text-[#1a2d5a]" /> Follow up on
      </p>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-sm justify-start font-normal">
              {selected ? format(selected, "EEE, MMM d, yyyy") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d: Date | undefined) => { if (d) { setDate(format(d, "yyyy-MM-dd")); setOpen(false); } }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        {date && (
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600 px-2"
            onClick={() => setDate(null)} title="Clear date">
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <Textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Notes (e.g. parent said they're traveling, back after July 4)"
        className="text-sm min-h-[56px]"
      />
      <div className="flex gap-2">
        <Button size="sm" className="bg-[#1a2d5a] hover:bg-[#142347]"
          disabled={save.isPending}
          onClick={() => save.mutate({ id: leadId, nextFollowUpAt: date, note: note || null })}>
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
          Save follow-up
        </Button>
        {(nextFollowUpAt || followUpNote) && (
          <Button size="sm" variant="outline" disabled={save.isPending}
            onClick={() => { setDate(null); setNote(""); save.mutate({ id: leadId, nextFollowUpAt: null, note: null }); }}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
