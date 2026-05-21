/**
 * Sequences Editor (Phase 5)
 *
 * Admin UI for editing TMA email templates without touching code.
 *
 * Layout: three-column workspace
 *   1. Sequences list (left rail, ~240px)
 *   2. Touches list for selected sequence (middle, ~280px)
 *   3. Editor + live preview (right, fills remaining space)
 *
 * Features:
 *   - Edit subject, body HTML, delay (hours), display name, description
 *   - Toggle isActive (deactivated touches are skipped by the dispatcher)
 *   - Live iframe preview that re-renders as you type, with sample merge data
 *   - "Send preview to my inbox" button (uses templates.sendTest backend)
 *   - Unsaved changes indicator + confirm-before-discard
 *
 * Edits go live immediately on save (next dispatcher tick picks up new content).
 *
 * NOTE: Single source of truth for sequence + touch metadata is the DB.
 * The "Sequences" presets below are only for UI labels / icons / grouping.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Loader2, Mail, Send, Save, Eye, AlertCircle, CheckCircle2,
  Calendar, Sparkles, GraduationCap, BookOpen, Trophy, Flame,
  School, Globe, Megaphone, Inbox,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Sequence presets (UI labels only — actual data lives in DB) ────────────

type SequencePreset = {
  key: string;
  label: string;
  description: string;
  group: "transactional" | "nurture" | "vertical";
  icon: typeof Mail;
  accent: string; // tailwind class for the icon background
};

const SEQUENCE_PRESETS: SequencePreset[] = [
  { key: "booked_trial_confirmation", label: "Trial Booking Confirmation", description: "Sent immediately when someone books a trial class.", group: "transactional", icon: Calendar, accent: "bg-green-100 text-green-700" },
  { key: "summer_camp_nurture", label: "Summer Camp", description: "For families interested in TMA Summer Camp.", group: "vertical", icon: Sparkles, accent: "bg-yellow-100 text-yellow-700" },
  { key: "afterschool_nurture", label: "After-School Program", description: "For families interested in TMA after-school.", group: "vertical", icon: School, accent: "bg-blue-100 text-blue-700" },
  { key: "tkd_trial_nurture", label: "Taekwondo Trial", description: "Free trial nurture for TKD-interested leads.", group: "vertical", icon: GraduationCap, accent: "bg-red-100 text-red-700" },
  { key: "kickboxing_trial_nurture", label: "Kickboxing Trial", description: "Adult kickboxing trial nurture.", group: "vertical", icon: Flame, accent: "bg-orange-100 text-orange-700" },
  { key: "bjj_trial_nurture", label: "BJJ Trial", description: "Brazilian Jiu-Jitsu trial nurture.", group: "vertical", icon: Trophy, accent: "bg-purple-100 text-purple-700" },
  { key: "fb_generic_nurture", label: "Facebook Generic", description: "Fallback for FB leads not matched to a specific campaign.", group: "nurture", icon: Megaphone, accent: "bg-indigo-100 text-indigo-700" },
  { key: "web_form_nurture", label: "Web Form Fallback", description: "Default for leads from the website with no specific tag.", group: "nurture", icon: Globe, accent: "bg-gray-100 text-gray-700" },
];

type Template = {
  id: number;
  sequenceKey: string;
  touchKey: string;
  orderIndex: number;
  delayHours: number;
  channel: string;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  isActive: number;
  displayName: string | null;
  description: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Merge field sample data for the preview iframe ──────────────────────────

const SAMPLE_MERGE = {
  firstName: "Anna",
  parentName: "Anna Sample",
  kidName: "Sample Kid",
  kidAge: "8",
  trialDate: "2026-05-25",
  trialDateLabel: "Sunday, May 25",
  trialTime: "5:00 PM",
  trialDay: "Sunday",
  programInterest: "Taekwondo",
  email: "sample@example.com",
  phone: "(770) 555-1234",
  leadId: "0",
};

function renderPreview(template: string | null): string {
  if (!template) return "<p style='padding:24px;color:#94a3b8'>(no body)</p>";
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    return (SAMPLE_MERGE as Record<string, string>)[key] ?? "";
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function delayLabel(hours: number): string {
  if (hours === 0) return "Immediate";
  if (hours < 24) return `${hours}h after enrollment`;
  const days = Math.round(hours / 24);
  return `Day ${days}`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SequencesEditor() {
  const utils = trpc.useUtils();
  const { data: allTemplates, isLoading, error, refetch } = trpc.templates.list.useQuery();

  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);
  const [selectedTouchId, setSelectedTouchId] = useState<number | null>(null);

  // Local editor state — synced with selected template on selection
  const [editor, setEditor] = useState<{
    subject: string;
    bodyHtml: string;
    delayHours: number;
    isActive: boolean;
    displayName: string;
    description: string;
  } | null>(null);

  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState<"rendered" | "html">("rendered");

  // Group templates by sequence
  const sequencesMap = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of (allTemplates as Template[] | undefined) ?? []) {
      if (!map.has(t.sequenceKey)) map.set(t.sequenceKey, []);
      map.get(t.sequenceKey)!.push(t);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.orderIndex - b.orderIndex);
    return map;
  }, [allTemplates]);

  // Auto-select first sequence on load
  useEffect(() => {
    if (!selectedSequence && sequencesMap.size > 0) {
      const firstKey = SEQUENCE_PRESETS.find(p => sequencesMap.has(p.key))?.key ?? Array.from(sequencesMap.keys())[0];
      setSelectedSequence(firstKey);
    }
  }, [sequencesMap, selectedSequence]);

  // Auto-select first touch when sequence changes
  useEffect(() => {
    if (selectedSequence) {
      const touches = sequencesMap.get(selectedSequence);
      if (touches && touches.length > 0) {
        setSelectedTouchId(touches[0].id);
      }
    }
  }, [selectedSequence, sequencesMap]);

  // Load editor state when selected touch changes
  const selectedTouch = useMemo(() => {
    if (!selectedTouchId) return null;
    for (const arr of sequencesMap.values()) {
      const found = arr.find(t => t.id === selectedTouchId);
      if (found) return found;
    }
    return null;
  }, [selectedTouchId, sequencesMap]);

  useEffect(() => {
    if (selectedTouch) {
      setEditor({
        subject: selectedTouch.subject ?? "",
        bodyHtml: selectedTouch.bodyHtml ?? "",
        delayHours: selectedTouch.delayHours,
        isActive: selectedTouch.isActive === 1,
        displayName: selectedTouch.displayName ?? "",
        description: selectedTouch.description ?? "",
      });
      setDirty(false);
    }
  }, [selectedTouch]);

  // Save mutation
  const updateTemplate = trpc.templates.update.useMutation({
    onSuccess: async () => {
      await utils.templates.list.invalidate();
      toast.success("Template saved. Next dispatcher tick will use the new content.");
      setDirty(false);
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const sendTest = trpc.templates.sendTest.useMutation({
    onSuccess: (result) => {
      if (result.ok) toast.success(`Test email sent. Check your inbox. (message id: ${result.messageId})`);
      else toast.error(`Test send failed: ${result.reason}`);
    },
    onError: (err) => toast.error(`Test send failed: ${err.message}`),
  });

  const handleSave = () => {
    if (!selectedTouch || !editor) return;
    if (!editor.subject.trim()) {
      toast.error("Subject cannot be empty");
      return;
    }
    updateTemplate.mutate({
      id: selectedTouch.id,
      editedBy: "admin_ui",
      changeNote: "Edited via /admin/sequences",
      patch: {
        subject: editor.subject,
        bodyHtml: editor.bodyHtml,
        delayHours: editor.delayHours,
        isActive: editor.isActive ? 1 : 0,
        displayName: editor.displayName || undefined,
        description: editor.description || undefined,
      },
    });
  };

  const handleSendTest = () => {
    if (!selectedTouch) return;
    if (dirty) {
      toast.warning("Save changes first, then send test (test sends the saved version)");
      return;
    }
    sendTest.mutate({ templateId: selectedTouch.id });
  };

  const handleSelectSequence = (key: string) => {
    if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
    setSelectedSequence(key);
  };
  const handleSelectTouch = (id: number) => {
    if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
    setSelectedTouchId(id);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /><span className="ml-2 text-gray-500">Loading templates...</span></div>;
  }
  if (error) {
    return <div className="text-center py-16 text-red-500">Failed to load templates: {error.message}</div>;
  }

  const currentSequencePreset = SEQUENCE_PRESETS.find(p => p.key === selectedSequence);
  const touchesInSequence = selectedSequence ? sequencesMap.get(selectedSequence) ?? [] : [];

  return (
    <div className="space-y-4">
      {/* Page intro */}
      <Card>
        <CardContent className="py-5 px-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-[#1a2d5a] rounded-lg flex items-center justify-center flex-shrink-0">
              <Inbox className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">Email Sequences</h2>
              <p className="text-sm text-gray-600 mt-1">
                Edit any email TMA sends out automatically. Changes go live within 5 minutes (next dispatcher run).
                Use "Send preview" to test in your inbox before saving anything important.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Three-column workspace */}
      <div className="grid grid-cols-[240px_280px_1fr] gap-4 min-h-[700px]">
        {/* Column 1: Sequences */}
        <Card className="overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sequences</p>
          </div>
          <div className="p-2 space-y-0.5">
            {(["transactional", "vertical", "nurture"] as const).map(group => {
              const sequences = SEQUENCE_PRESETS.filter(p => p.group === group && sequencesMap.has(p.key));
              if (sequences.length === 0) return null;
              const groupLabel = group === "transactional" ? "Transactional" : group === "vertical" ? "Programs" : "Fallbacks";
              return (
                <div key={group} className="mb-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1.5">{groupLabel}</p>
                  {sequences.map(seq => {
                    const isActive = selectedSequence === seq.key;
                    const touchCount = sequencesMap.get(seq.key)?.length ?? 0;
                    const Icon = seq.icon;
                    return (
                      <button
                        key={seq.key}
                        onClick={() => handleSelectSequence(seq.key)}
                        className={`w-full text-left px-2.5 py-2 rounded-md flex items-center gap-2.5 transition-colors ${
                          isActive ? "bg-[#1a2d5a] text-white" : "hover:bg-gray-100 text-gray-700"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${isActive ? "bg-white/15" : seq.accent}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${isActive ? "text-white" : "text-gray-900"}`}>{seq.label}</div>
                          <div className={`text-[11px] ${isActive ? "text-white/70" : "text-gray-500"}`}>{touchCount} {touchCount === 1 ? "touch" : "touches"}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Column 2: Touches in selected sequence */}
        <Card className="overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {currentSequencePreset?.label ?? "Touches"}
            </p>
            {currentSequencePreset?.description && (
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{currentSequencePreset.description}</p>
            )}
          </div>
          <div className="p-2 space-y-0.5">
            {touchesInSequence.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No touches in this sequence yet.</p>
            ) : (
              touchesInSequence.map(touch => {
                const isActive = selectedTouchId === touch.id;
                const isInactive = touch.isActive === 0;
                return (
                  <button
                    key={touch.id}
                    onClick={() => handleSelectTouch(touch.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                      isActive ? "bg-[#1a2d5a] text-white" : "hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${isActive ? "text-white" : "text-gray-900"}`}>
                          {touch.displayName || touch.touchKey}
                        </div>
                        <div className={`text-[11px] mt-0.5 ${isActive ? "text-white/70" : "text-gray-500"}`}>
                          {delayLabel(touch.delayHours)}
                        </div>
                      </div>
                      {isInactive && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isActive ? "border-white/30 text-white/70" : "border-gray-300 text-gray-500"}`}>
                          Off
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Column 3: Editor + Preview */}
        <div className="space-y-4">
          {!editor || !selectedTouch ? (
            <Card className="flex items-center justify-center h-full min-h-[600px]">
              <p className="text-gray-400">Select a touch to edit.</p>
            </Card>
          ) : (
            <>
              {/* Editor card */}
              <Card>
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Editing</p>
                    <h3 className="font-semibold text-gray-900 text-sm">
                      {currentSequencePreset?.label} <span className="text-gray-400">›</span> {selectedTouch.displayName || selectedTouch.touchKey}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-md border border-gray-200">
                      <Switch
                        checked={editor.isActive}
                        onCheckedChange={v => { setEditor({ ...editor, isActive: v }); setDirty(true); }}
                      />
                      <span className="text-sm text-gray-700">{editor.isActive ? "Active" : "Off"}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleSendTest} disabled={sendTest.isPending} className="gap-1.5">
                      {sendTest.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Send preview
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={!dirty || updateTemplate.isPending} className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 gap-1.5">
                      {updateTemplate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save
                    </Button>
                  </div>
                </div>

                <CardContent className="pt-5 space-y-4">
                  {dirty && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <p className="text-sm text-amber-800">Unsaved changes</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="subject" className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Subject Line</Label>
                      <Input
                        id="subject"
                        value={editor.subject}
                        onChange={e => { setEditor({ ...editor, subject: e.target.value }); setDirty(true); }}
                        placeholder="Your subject line..."
                      />
                      <p className="text-[11px] text-gray-500">Use <code className="bg-gray-100 px-1 rounded">{`{{firstName}}`}</code>, <code className="bg-gray-100 px-1 rounded">{`{{trialDateLabel}}`}</code>, etc.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="delay" className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Send Delay (hours after enrollment)</Label>
                      <Input
                        id="delay"
                        type="number"
                        min="0"
                        value={editor.delayHours}
                        onChange={e => { setEditor({ ...editor, delayHours: parseInt(e.target.value) || 0 }); setDirty(true); }}
                      />
                      <p className="text-[11px] text-gray-500">{delayLabel(editor.delayHours)}. 0 = sends on next dispatcher run (~5 min).</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="displayName" className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Display Name (internal)</Label>
                    <Input
                      id="displayName"
                      value={editor.displayName}
                      onChange={e => { setEditor({ ...editor, displayName: e.target.value }); setDirty(true); }}
                      placeholder="e.g. Day 0 — Camp Overview"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bodyHtml" className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Email Body (HTML)</Label>
                    <Textarea
                      id="bodyHtml"
                      value={editor.bodyHtml}
                      onChange={e => { setEditor({ ...editor, bodyHtml: e.target.value }); setDirty(true); }}
                      rows={16}
                      className="font-mono text-xs"
                      placeholder="<p>Hi {{firstName}}, ...</p>"
                    />
                    <p className="text-[11px] text-gray-500">
                      Raw HTML. For non-technical edits, use the find-and-replace approach: copy a working template's HTML and just change the words inside the <code>&lt;p&gt;</code> tags.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="description" className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Description (internal note)</Label>
                    <Input
                      id="description"
                      value={editor.description}
                      onChange={e => { setEditor({ ...editor, description: e.target.value }); setDirty(true); }}
                      placeholder="What this email is for (internal use only, never shown to customers)."
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Preview card */}
              <Card>
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-gray-500" />
                    <p className="font-semibold text-gray-900 text-sm">Live Preview</p>
                    <Badge variant="outline" className="text-[10px]">Sample data</Badge>
                  </div>
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md p-0.5">
                    <button
                      onClick={() => setPreviewMode("rendered")}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${previewMode === "rendered" ? "bg-[#1a2d5a] text-white" : "text-gray-600 hover:bg-gray-100"}`}
                    >
                      Rendered
                    </button>
                    <button
                      onClick={() => setPreviewMode("html")}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${previewMode === "html" ? "bg-[#1a2d5a] text-white" : "text-gray-600 hover:bg-gray-100"}`}
                    >
                      Raw HTML
                    </button>
                  </div>
                </div>
                <CardContent className="p-0">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <p className="text-[11px] text-gray-500">Subject preview</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{renderPreview(editor.subject)}</p>
                  </div>
                  {previewMode === "rendered" ? (
                    <iframe
                      srcDoc={renderPreview(editor.bodyHtml)}
                      sandbox=""
                      className="w-full border-0"
                      style={{ height: 600, background: "#f8f9fa" }}
                      title="Email preview"
                    />
                  ) : (
                    <pre className="text-[11px] font-mono p-4 overflow-x-auto bg-gray-900 text-gray-100 whitespace-pre-wrap break-all" style={{ maxHeight: 600 }}>
                      {renderPreview(editor.bodyHtml)}
                    </pre>
                  )}
                </CardContent>
              </Card>

              {/* Help footer */}
              <Card>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-gray-600 space-y-1.5">
                      <p><strong className="text-gray-800">Available merge fields:</strong> <code className="bg-gray-100 px-1 rounded">{`{{firstName}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{parentName}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{kidName}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{trialDate}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{trialDateLabel}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{trialTime}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{trialDay}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{programInterest}}`}</code></p>
                      <p><strong className="text-gray-800">Reverting changes:</strong> close the page without saving. To restore an older version, ping Claude to run a rollback from history.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
