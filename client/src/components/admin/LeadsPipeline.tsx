import { trpc } from "@/lib/trpc";
import { FollowUpControl } from "@/components/admin/FollowUpControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Phone, Mail, User, Tag, ChevronRight, ChevronLeft, Trash2, StickyNote, Globe, X, Plus, Clock, MessageSquare, PhoneCall, Send, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import TrialClassPicker from "@/components/TrialClassPicker";

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGES = [
  { value: "new_lead",        label: "New Lead",         color: "bg-gray-100 border-gray-300",       badge: "bg-gray-200 text-gray-800" },
  { value: "contacted",       label: "Contacted",        color: "bg-blue-50 border-blue-200",         badge: "bg-blue-100 text-blue-800" },
  { value: "trial_scheduled", label: "Trial Scheduled",  color: "bg-yellow-50 border-yellow-200",     badge: "bg-yellow-100 text-yellow-800" },
  { value: "trial_paid",      label: "3 Week Trial Paid ($99)", color: "bg-orange-50 border-orange-200",     badge: "bg-orange-100 text-orange-800" },
  { value: "trial_attended",  label: "Trial Attended",   color: "bg-purple-50 border-purple-200",     badge: "bg-purple-100 text-purple-800" },
  { value: "enrolled",        label: "Enrolled",         color: "bg-green-50 border-green-200",       badge: "bg-green-100 text-green-800" },
  { value: "lost",            label: "Lost",             color: "bg-red-50 border-red-200",           badge: "bg-red-100 text-red-800" },
] as const;

type StageValue = typeof STAGES[number]["value"];

const PROGRAMS = [
  { value: "all",              label: "All Programs" },
  { value: "Taekwondo",        label: "Taekwondo" },
  { value: "BJJ",              label: "Brazilian Jiu-Jitsu" },
  { value: "Kickboxing",       label: "Kickboxing" },
  { value: "Afterschool",      label: "After School" },
  { value: "Multiple Programs",label: "Multiple Programs" },
];

const PROGRAM_COLORS: Record<string, string> = {
  "Taekwondo":         "bg-[#1a2d5a] text-white",
  "BJJ":               "bg-red-700 text-white",
  "Kickboxing":        "bg-orange-600 text-white",
  "Afterschool":       "bg-purple-700 text-white",
  "Multiple Programs": "bg-teal-700 text-white",
};

// Tag color mapping
function getTagColor(tag: string): string {
  if (tag === "facebook_lead") return "bg-blue-100 text-blue-800 border-blue-200";
  if (tag.startsWith("summer_camp")) return "bg-green-100 text-green-800 border-green-200";
  // Pro shop / sale orders stand out so staff can spot purchases at a glance.
  if (tag === "proshop_order") return "bg-amber-100 text-amber-900 border-amber-300 font-bold";
  if (tag === "christmas_july_2026") return "bg-red-100 text-red-800 border-red-300";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

// Human-friendly tag labels for the pipeline (raw slug otherwise).
const TAG_LABELS: Record<string, string> = {
  proshop_order: "🛍️ Pro Shop Order",
  christmas_july_2026: "Christmas in July",
  facebook_lead: "Facebook Lead",
  tour_request: "Tour Request",
};

function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Lead = {
  id: number;
  parentName: string;
  kidName: string;
  kidAge: string;
  programInterest: string;
  motivation: string | null;
  email: string;
  phone: string;
  additionalNotes: string | null;
  pipelineStage: StageValue;
  trialPaidAmount: number | null;
  internalNotes: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  trialClassDate: string | null;
  trialClassTime: string | null;
  trialClassDay: string | null;
  nextFollowUpAt: string | null;
  followUpNote: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

// ─── Tag Chips ────────────────────────────────────────────────────────────────

function TagChips({ tags, onRemove }: { tags: string[] | string | null | undefined; onRemove?: (tag: string) => void }) {
  const list = Array.isArray(tags) ? tags : [];
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map(tag => (
        <span
          key={tag}
          className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${getTagColor(tag)}`}
        >
          {tagLabel(tag)}
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(tag); }}
              className="ml-0.5 hover:opacity-70"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, stageIndex, totalStages, onOpen, onMove }: {
  lead: Lead;
  stageIndex: number;
  totalStages: number;
  onOpen: (lead: Lead) => void;
  onMove: (lead: Lead, direction: "forward" | "back") => void;
}) {
  const programColor = PROGRAM_COLORS[lead.programInterest] ?? "bg-gray-600 text-white";
  const daysAgo = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000);

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onOpen(lead)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{lead.kidName}</p>
          <p className="text-xs text-gray-500 truncate">{lead.parentName}</p>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${programColor}`}>
          {lead.programInterest}
        </span>
      </div>

      <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
        <Phone className="w-3 h-3" />
        <span>{lead.phone}</span>
      </div>

      {(lead.utmSource || lead.utmCampaign) && (
        <div className="flex items-center gap-1 text-xs text-blue-600 mb-2">
          <Globe className="w-3 h-3" />
          <span className="truncate">{lead.utmCampaign ?? lead.utmSource}</span>
        </div>
      )}

      {/* Tags */}
      {lead.tags && lead.tags.length > 0 && (
        <div className="mb-2">
          <TagChips tags={lead.tags} />
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">{daysAgo === 0 ? "Today" : `${daysAgo}d ago`}</span>
        <div className="flex gap-1">
          {stageIndex > 0 && (
            <button
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              onClick={e => { e.stopPropagation(); onMove(lead, "back"); }}
              title="Move back"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {stageIndex < totalStages - 1 && (
            <button
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              onClick={e => { e.stopPropagation(); onMove(lead, "forward"); }}
              title="Move forward"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Lead Detail Dialog ───────────────────────────────────────────────────────

type EmailTemplate = {
  touchKey: string | null;
  subject: string | null;
  bodyHtml: string | null;
};

type EmailPreview = {
  subject: string;
  html: string;
};

const formatTrialDateLabel = (trialClassDate?: string | null) => {
  if (!trialClassDate) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trialClassDate)) {
    return new Date(`${trialClassDate}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  return trialClassDate;
};

const renderEmailHtml = (html: string, lead?: Lead | null) => {
  const value = (field: keyof Lead) => String(lead?.[field] ?? "");
  const firstName = String(lead?.parentName ?? "").trim().split(/\s+/)[0] ?? "";
  const fields: Record<string, string> = {
    firstName,
    parentName: value("parentName"),
    kidName: value("kidName"),
    kidAge: value("kidAge"),
    trialDate: value("trialClassDate"),
    trialDateLabel: formatTrialDateLabel(lead?.trialClassDate),
    trialTime: value("trialClassTime"),
    trialDay: value("trialClassDay"),
    programInterest: value("programInterest"),
    email: value("email"),
    phone: value("phone"),
    leadId: lead?.id == null ? "" : String(lead.id),
  };

  return html.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, field: string) => fields[field] ?? "");
};

function ActivityTimeline({ leadId, lead }: { leadId: number; lead?: Lead | null }) {
  const [noteText, setNoteText] = useState("");
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const utils = trpc.useUtils();

  const { data: activities = [], isLoading } = trpc.leads.getActivity.useQuery(
    { leadId },
    { enabled: !!leadId }
  );
  const { data: templates = [] } = trpc.templates.list.useQuery();

  const logActivity = trpc.leads.logActivity.useMutation({
    onSuccess: () => {
      utils.leads.getActivity.invalidate({ leadId });
      setNoteText("");
      toast.success("Note added");
    },
    onError: () => toast.error("Failed to add note"),
  });

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    logActivity.mutate({
      leadId,
      type: "note",
      body: noteText.trim(),
      sentBy: "staff",
      status: "sent",
    });
  };

  const typeIcon = (type: string) => {
    if (type === "email") return <Send className="w-3.5 h-3.5 text-blue-500" />;
    if (type === "sms") return <MessageSquare className="w-3.5 h-3.5 text-green-500" />;
    if (type === "call") return <PhoneCall className="w-3.5 h-3.5 text-purple-500" />;
    return <StickyNote className="w-3.5 h-3.5 text-amber-500" />;
  };

  const typeLabel = (type: string) => {
    if (type === "email") return "Email sent";
    if (type === "sms") return "SMS sent";
    if (type === "call") return "Call logged";
    return "Note";
  };

  return (
    <div className="space-y-4">
      {/* Add Note */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Add Note</p>
        <Textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Add a note about this lead..."
          rows={3}
          className="text-sm"
        />
        <Button
          size="sm"
          className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90"
          onClick={handleAddNote}
          disabled={!noteText.trim() || logActivity.isPending}
        >
          {logActivity.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Save Note
        </Button>
      </div>

      {/* Timeline */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Activity Log
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : activities.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {activities.map((act: any) => {
              const matchingTemplate = act.type === "email"
                ? (templates as EmailTemplate[]).find(template => template.touchKey === act.subject)
                : undefined;

              return (
              <div key={act.id} className="flex gap-2.5 bg-gray-50 rounded-lg p-2.5">
                <div className="mt-0.5 shrink-0">{typeIcon(act.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-700">{typeLabel(act.type)}</p>
                    <p className="text-xs text-gray-400 shrink-0">
                      {new Date(act.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  {act.subject && <p className="text-xs text-gray-600 font-medium mt-0.5">{act.subject}</p>}
                  {act.body && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{act.body}</p>}
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    {act.sentBy && <p className="text-xs text-gray-400">by {act.sentBy}</p>}
                    {matchingTemplate?.bodyHtml && (
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-600 hover:underline"
                        onClick={() => setEmailPreview({
                          subject: matchingTemplate.subject ?? act.subject ?? "Email preview",
                          html: renderEmailHtml(matchingTemplate.bodyHtml ?? "", lead),
                        })}
                      >
                        View email
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {emailPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <p className="truncate text-sm font-semibold text-gray-900">{emailPreview.subject}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setEmailPreview(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <iframe
              title="Email preview"
              srcDoc={emailPreview.html}
              className="h-[70vh] w-full rounded-b-lg bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function LeadDetailDialog({ lead, open, onClose, onRefresh }: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [notes, setNotes] = useState(lead?.internalNotes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [newTag, setNewTag] = useState("");
  const utils = trpc.useUtils();

  const updateStage = trpc.leads.updateStage.useMutation({
    onSuccess: () => { utils.leads.getAll.invalidate(); onRefresh(); },
    onError: () => toast.error("Failed to update stage"),
  });

  const updateProgram = trpc.leads.updateProgram.useMutation({
    onSuccess: () => { utils.leads.getAll.invalidate(); onRefresh(); },
    onError: () => toast.error("Failed to update program"),
  });

  const updateNotes = trpc.leads.updateNotes.useMutation({
    onSuccess: () => {
      utils.leads.getAll.invalidate();
      setEditingNotes(false);
      toast.success("Notes saved");
    },
    onError: () => toast.error("Failed to save notes"),
  });

  const updateTags = trpc.leads.updateTags.useMutation({
    onSuccess: () => { utils.leads.getAll.invalidate(); onRefresh(); },
    onError: () => toast.error("Failed to update tags"),
  });

  const deleteLead = trpc.leads.delete.useMutation({
    onSuccess: () => {
      utils.leads.getAll.invalidate();
      onClose();
      toast.success("Lead deleted");
    },
    onError: () => toast.error("Failed to delete lead"),
  });

  const [rescheduling, setRescheduling] = useState(false);
  const bookManual = trpc.leads.bookManual.useMutation({
    onSuccess: () => {
      utils.leads.getAll.invalidate();
      onRefresh();
      setRescheduling(false);
      toast.success("Trial rescheduled");
    },
    onError: () => toast.error("Failed to reschedule. Check the contact info and try again."),
  });

  if (!lead) return null;

  const currentTags = lead.tags ?? [];

  // Reschedule: offer a fresh trial when the lead missed or never enrolled.
  // no_show / no_show_final appear as both pipeline stage values (set by check-in)
  // and as tags -- check both so the panel shows regardless of how staff marked them.
  const stageStr = String(lead.pipelineStage);
  const hasNoShowTag = currentTags.some(t => t === "no_show" || t === "no_show_final");
  const isNoShow = hasNoShowTag || stageStr === "no_show" || stageStr === "no_show_final";
  const canReschedule =
    isNoShow ||
    stageStr === "contacted" ||
    stageStr === "trial_attended" ||
    stageStr === "lost";
  // Map the lead's programInterest (any casing) to a classSchedule program key.
  const progKey = ({
    taekwondo: "taekwondo", "little tigers": "little_tigers", little_tigers: "little_tigers",
    bjj: "bjj", "brazilian jiu-jitsu": "bjj", kickboxing: "kickboxing",
    afterschool: "afterschool", "after school": "afterschool",
  } as Record<string, string>)[String(lead.programInterest || "").toLowerCase()]
    ?? String(lead.programInterest || "").toLowerCase();
  const kidAgeNum = parseInt(String(lead.kidAge || "").replace(/[^0-9]/g, ""), 10) || 8;

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase().replace(/\s+/g, "_");
    if (!tag || currentTags.includes(tag)) return;
    updateTags.mutate({ id: lead.id, tags: [...currentTags, tag] });
    setNewTag("");
  };

  const handleRemoveTag = (tag: string) => {
    updateTags.mutate({ id: lead.id, tags: currentTags.filter(t => t !== tag) });
  };

  const daysAgo = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000);

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#1a2d5a]" />
            {lead.kidName}
            <span className="text-sm font-normal text-gray-500">- age {lead.kidAge}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="activity">
            <ActivityTimeline leadId={lead.id} lead={lead} />
          </TabsContent>

          <TabsContent value="details">
        <div className="space-y-4">
          {/* Contact Info */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
            <p className="text-sm font-medium text-gray-700 mb-1">Contact</p>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="w-3.5 h-3.5 text-gray-400" />
              <span>{lead.parentName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="w-3.5 h-3.5 text-gray-400" />
              <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-3.5 h-3.5 text-gray-400" />
              <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">{lead.phone}</a>
            </div>
            {lead.trialClassDate && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500 w-10 shrink-0">Trial</span>
                <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                  {lead.trialClassDay} {lead.trialClassDate} @ {lead.trialClassTime}
                </span>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Submitted {daysAgo === 0 ? "today" : `${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`} - {new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* Pipeline Stage */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">Pipeline Stage</p>
            <Select
              value={lead.pipelineStage}
              onValueChange={val => updateStage.mutate({ id: lead.id, stage: val as StageValue })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reschedule trial (shown for no-show / not-enrolled leads) */}
          {canReschedule && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Reschedule trial
              </p>
              <p className="text-xs text-amber-800 mb-2">
                {isNoShow ? "Marked as a no-show." : "Has not enrolled yet."}{" "}
                Book them a new trial class.
              </p>
              {!rescheduling ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 border-amber-300 text-amber-900 hover:bg-amber-100"
                  onClick={() => setRescheduling(true)}
                >
                  <Clock className="w-3.5 h-3.5" /> Reschedule for a trial
                </Button>
              ) : (
                <div className="space-y-2">
                  <TrialClassPicker
                    program={progKey}
                    age={kidAgeNum}
                    onSelect={(slot, date) =>
                      bookManual.mutate({
                        leadId: lead.id,
                        parentName: lead.parentName,
                        kidName: lead.kidName,
                        kidAge: lead.kidAge ?? null,
                        phone: lead.phone,
                        email: lead.email || null,
                        programInterest: lead.programInterest || "Taekwondo",
                        trialClassDate: date,
                        trialClassTime: slot.startTime,
                        trialClassDay: slot.day,
                        notes: "Rescheduled from the admin dashboard",
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-gray-500"
                    onClick={() => setRescheduling(false)}
                    disabled={bookManual.isPending}
                  >
                    {bookManual.isPending ? "Saving..." : "Cancel"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Program Interest */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">Program Interest</p>
            <Select
              value={lead.programInterest}
              onValueChange={val => updateProgram.mutate({ id: lead.id, programInterest: val })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROGRAMS.filter(p => p.value !== "all").map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Tags
            </p>
            {currentTags.length > 0 ? (
              <div className="mb-2">
                <TagChips tags={currentTags} onRemove={handleRemoveTag} />
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic mb-2">No tags yet</p>
            )}
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                placeholder="Add tag (e.g. summer_camp_2026)"
                className="text-sm h-8"
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddTag}
                disabled={!newTag.trim() || updateTags.isPending}
                className="h-8 gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
          </div>

          {/* Follow-up scheduling */}
          <FollowUpControl leadId={lead.id} nextFollowUpAt={lead.nextFollowUpAt} followUpNote={lead.followUpNote} />

          {/* Motivation / Notes from lead */}
          {(lead.motivation || lead.additionalNotes) && (
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-800 mb-1">From the Lead</p>
              {lead.motivation && <p className="text-sm text-blue-700">Motivation: {lead.motivation}</p>}
              {lead.additionalNotes && <p className="text-sm text-blue-700 mt-1">{lead.additionalNotes}</p>}
            </div>
          )}

          {/* UTM Source */}
          {(lead.utmSource || lead.utmCampaign || lead.utmMedium) && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Ad Source
              </p>
              <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                {lead.utmSource   && <span><span className="font-medium">Source:</span> {lead.utmSource}</span>}
                {lead.utmMedium   && <span><span className="font-medium">Medium:</span> {lead.utmMedium}</span>}
                {lead.utmCampaign && <span className="col-span-2"><span className="font-medium">Campaign:</span> {lead.utmCampaign}</span>}
                {lead.utmContent  && <span className="col-span-2"><span className="font-medium">Content:</span> {lead.utmContent}</span>}
              </div>
            </div>
          )}

          {/* Internal Notes */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5" /> Staff Notes
              </p>
              {!editingNotes && (
                <button
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => { setNotes(lead.internalNotes ?? ""); setEditingNotes(true); }}
                >
                  {lead.internalNotes ? "Edit" : "Add note"}
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add internal notes visible only to staff..."
                  rows={3}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90"
                    onClick={() => updateNotes.mutate({ id: lead.id, internalNotes: notes })}
                    disabled={updateNotes.isPending}
                  >
                    {updateNotes.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingNotes(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 bg-gray-50 rounded p-2 min-h-[40px]">
                {lead.internalNotes || <span className="text-gray-400 italic">No notes yet</span>}
              </p>
            )}
          </div>

          {/* Delete */}
          <div className="pt-2 border-t border-gray-100">
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-1.5"
              onClick={() => {
                if (confirm(`Delete lead for ${lead.kidName}? This cannot be undone.`)) {
                  deleteLead.mutate({ id: lead.id });
                }
              }}
              disabled={deleteLead.isPending}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Lead
            </Button>
          </div>
        </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadsPipeline() {
  const [programFilter, setProgramFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const { data: leads = [], isLoading, refetch } = trpc.leads.getAll.useQuery();
  const updateStage = trpc.leads.updateStage.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to move lead"),
  });

  // Collect all unique tags across all leads
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    leads.forEach(l => (l.tags ?? []).forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    let result = leads as Lead[];
    if (programFilter !== "all") result = result.filter(l => l.programInterest === programFilter);
    if (tagFilter !== "all") result = result.filter(l => (l.tags ?? []).includes(tagFilter));
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(l =>
        [l.parentName, l.kidName, l.email, l.phone]
          .some(f => (f ?? "").toLowerCase().includes(q))
      );
    }
    return result;
  }, [leads, programFilter, tagFilter, search]);

  const handleMove = (lead: Lead, direction: "forward" | "back") => {
    const idx = STAGES.findIndex(s => s.value === lead.pipelineStage);
    const newIdx = direction === "forward" ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= STAGES.length) return;
    updateStage.mutate({ id: lead.id, stage: STAGES[newIdx].value });
  };

  // Stats
  const totalLeads = leads.length;
  const enrolled = leads.filter(l => l.pipelineStage === "enrolled").length;
  const newToday = leads.filter(l => {
    const d = new Date(l.createdAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading pipeline...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-gray-500">Total Leads</p>
            <p className="text-3xl font-bold text-gray-900">{totalLeads}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-gray-500">Enrolled</p>
            <p className="text-3xl font-bold text-green-700">{enrolled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-gray-500">New Today</p>
            <p className="text-3xl font-bold text-blue-700">{newToday}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email"
          className="pl-9"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-3">
          <Tag className="w-4 h-4 text-gray-400 shrink-0" />
          <p className="text-sm text-gray-600 font-medium shrink-0">Filter by tag:</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTagFilter("all")}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                tagFilter === "all"
                  ? "bg-[#1a2d5a] text-white border-[#1a2d5a]"
                  : "bg-white text-gray-600 border-gray-300 hover:border-[#1a2d5a] hover:text-[#1a2d5a]"
              }`}
            >
              All Tags
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag === tagFilter ? "all" : tag)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  tagFilter === tag
                    ? "bg-[#1a2d5a] text-white border-[#1a2d5a]"
                    : `${getTagColor(tag)} hover:border-[#1a2d5a]`
                }`}
              >
                {tag}
                <span className="ml-1 opacity-70">
                  ({leads.filter(l => (l.tags ?? []).includes(tag)).length})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Program Filter */}
      <div className="flex items-center gap-3">
        <Tag className="w-4 h-4 text-gray-400 shrink-0" />
        <p className="text-sm text-gray-600 font-medium shrink-0">Filter by program:</p>
        <div className="flex gap-2 flex-wrap">
          {PROGRAMS.map(p => (
            <button
              key={p.value}
              onClick={() => setProgramFilter(p.value)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                programFilter === p.value
                  ? "bg-[#1a2d5a] text-white border-[#1a2d5a]"
                  : "bg-white text-gray-600 border-gray-300 hover:border-[#1a2d5a] hover:text-[#1a2d5a]"
              }`}
            >
              {p.label}
              {p.value !== "all" && (
                <span className="ml-1 opacity-70">
                  ({leads.filter(l => l.programInterest === p.value).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {STAGES.map((stage, stageIdx) => {
            const stageLeads = filteredLeads.filter(l => l.pipelineStage === stage.value);
            return (
              <div key={stage.value} className={`w-56 rounded-xl border-2 ${stage.color} flex flex-col`}>
                <div className="px-3 py-2.5 border-b border-inherit">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{stage.label}</p>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${stage.badge}`}>{stageLeads.length}</span>
                  </div>
                </div>
                <div className="flex-1 p-2 space-y-2 min-h-[120px]">
                  {stageLeads.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center pt-4 italic">Empty</p>
                  ) : (
                    stageLeads.map(lead => (
                      <LeadCard
                        key={lead.id}
                        lead={lead as Lead}
                        stageIndex={stageIdx}
                        totalStages={STAGES.length}
                        onOpen={setSelectedLead}
                        onMove={handleMove}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        lead={selectedLead}
        open={selectedLead !== null}
        onClose={() => setSelectedLead(null)}
        onRefresh={refetch}
      />
    </div>
  );
}
