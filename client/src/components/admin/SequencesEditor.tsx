/**
 * Sequences Editor (Phase 5 + 5.5)
 *
 * Admin UI for editing TMA email templates without touching code.
 *
 * Layout: three-column workspace
 *   1. Sequences list (left rail, ~240px)
 *   2. Touches list for selected sequence (middle, ~280px)
 *   3. Editor + live preview (right, fills remaining space)
 *
 * Editor modes:
 *   - SIMPLE, structured form (header, greeting, paragraphs, callout, CTA, footer note).
 *              On save, regenerates branded HTML from those fields. Non-technical friendly.
 *   - ADVANCED, raw HTML textarea + subject input. Power-user mode.
 *
 * Each touch can be edited in either mode. Switching to Simple Mode for the first
 * time presents empty fields with a warning that saving will replace the existing HTML.
 *
 * Other features:
 *   - Live iframe preview re-renders as you type, with sample merge data.
 *   - Active toggle (deactivated touches are skipped by the dispatcher).
 *   - "Send preview to my inbox" button.
 *   - Unsaved changes indicator + confirm-before-discard.
 *
 * Edits go live immediately on save (next dispatcher tick picks up new content).
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
  Calendar, Sparkles, GraduationCap, Trophy, Flame,
  School, Globe, Megaphone, Inbox, Sliders, Code, History, RotateCcw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Sequence presets (UI labels only, actual data lives in DB) ────────────

type SequencePreset = {
  key: string;
  label: string;
  description: string;
  group: "transactional" | "nurture" | "vertical";
  icon: typeof Mail;
  accent: string;
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

type MergeField = {
  tag: string;
  description: string;
  group: "Parent & Camper" | "Trial details" | "Contact";
};

const MERGE_FIELDS: MergeField[] = [
  { tag: "{{firstName}}", description: "Parent's first name (e.g. Anna)", group: "Parent & Camper" },
  { tag: "{{parentName}}", description: "Parent's full name", group: "Parent & Camper" },
  { tag: "{{kidName}}", description: "Camper / child's name", group: "Parent & Camper" },
  { tag: "{{kidAge}}", description: "Camper's age", group: "Parent & Camper" },
  { tag: "{{trialDateLabel}}", description: "Trial date, friendly (e.g. Sunday, May 25)", group: "Trial details" },
  { tag: "{{trialDate}}", description: "Trial date, raw (e.g. 2026-05-25)", group: "Trial details" },
  { tag: "{{trialTime}}", description: "Trial class time (e.g. 5:00 PM)", group: "Trial details" },
  { tag: "{{trialDay}}", description: "Trial day of week", group: "Trial details" },
  { tag: "{{programInterest}}", description: "Program of interest (e.g. Taekwondo)", group: "Trial details" },
  { tag: "{{email}}", description: "Lead's email address", group: "Contact" },
  { tag: "{{phone}}", description: "Lead's phone number", group: "Contact" },
  { tag: "{{leadId}}", description: "Internal lead ID", group: "Contact" },
];

const MERGE_FIELD_GROUPS: MergeField["group"][] = ["Parent & Camper", "Trial details", "Contact"];

function MergeFieldPicker({ onSelect }: { onSelect: (tag: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hoveredField, setHoveredField] = useState<MergeField | null>(MERGE_FIELDS[0]);

  const handleSelect = (tag: string) => {
    onSelect(tag);
    setOpen(false);
  };

  return (
    <div className="relative inline-flex">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(v => !v)}
        className="h-7 px-2 text-[11px] gap-1.5"
      >
        <Code className="w-3 h-3" /> Insert field
      </Button>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-xs font-semibold text-gray-800">Merge fields</p>
            <p className="text-[11px] text-gray-500">Hover for details, click to insert.</p>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {MERGE_FIELD_GROUPS.map(group => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{group}</p>
                <div className="space-y-0.5">
                  {MERGE_FIELDS.filter(field => field.group === group).map(field => (
                    <button
                      key={field.tag}
                      type="button"
                      onMouseEnter={() => setHoveredField(field)}
                      onClick={() => handleSelect(field.tag)}
                      className="w-full rounded-md px-2 py-1.5 text-left font-mono text-xs text-[#1a2d5a] hover:bg-[#1a2d5a]/10"
                    >
                      {field.tag}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-[11px] leading-snug text-gray-600">
            {hoveredField?.description}
          </div>
        </div>
      )}
    </div>
  );
}

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

// ─── Structured form schema ─────────────────────────────────────────────────

type SimpleFields = {
  headerTitle: string;        // top red header text (e.g. "TMA Summer Camp")
  greeting: string;           // first line (e.g. "Hi {{firstName}},")
  paragraphs: string;         // body paragraphs (blank-line separated)
  calloutLabel: string;       // small uppercase label in yellow callout (optional)
  calloutBody: string;        // main text in yellow callout (optional)
  ctaLabel: string;           // red button text (optional)
  ctaUrl: string;             // red button URL (optional)
  footerNote: string;         // small gray paragraph above navy footer (optional)
};

const EMPTY_SIMPLE: SimpleFields = {
  headerTitle: "", greeting: "", paragraphs: "",
  calloutLabel: "", calloutBody: "",
  ctaLabel: "", ctaUrl: "", footerNote: "",
};

// ─── HTML builder (mirrors server-side template populate script) ────────────

function buildBrandedHtml(f: SimpleFields): string {
  const SHELL_OPEN = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"><table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8f9fa"><tr><td align="center" style="padding:32px 16px"><table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06)">`;
  const SHELL_CLOSE = `</table></td></tr></table></body></html>`;
  const HEADER = (title: string) => `<tr><td style="background:#c41e3a;padding:24px 32px"><div style="color:#fff;font-size:12px;letter-spacing:1.5px;font-weight:600;text-transform:uppercase;opacity:0.9">Top Martial Arts Suwanee</div><div style="color:#fff;font-size:24px;font-weight:700;margin-top:6px">${title}</div></td></tr>`;
  const FOOTER = `<tr><td style="background:#1a2d5a;padding:20px 32px;color:#cbd5e1;font-size:13px;line-height:1.6"><div style="color:#fff;font-weight:600;margin-bottom:4px">Master Arfa &amp; Master Jo</div>Top Martial Arts Suwanee<br><a href="tel:+17702773009" style="color:#cbd5e1;text-decoration:none">(770) 277-3009</a> &nbsp;&middot;&nbsp; <a href="https://tmatkd.com" style="color:#cbd5e1;text-decoration:none">tmatkd.com</a></td></tr>`;

  const greetingHtml = f.greeting ? `<p style="margin:0 0 16px">${escapeHtml(f.greeting)}</p>` : "";
  const paragraphsHtml = f.paragraphs
    .split(/\n\s*\n/)
    .filter(p => p.trim())
    .map(p => `<p style="margin:0 0 16px">${escapeHtml(p.trim())}</p>`)
    .join("");

  const bodyBlock = (greetingHtml || paragraphsHtml)
    ? `<tr><td style="padding:32px 32px 8px;color:#1f2937;font-size:16px;line-height:1.6">${greetingHtml}${paragraphsHtml}</td></tr>`
    : "";

  const calloutBlock = (f.calloutLabel || f.calloutBody)
    ? `<tr><td style="padding:0 32px 24px"><table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px"><tr><td style="padding:20px 24px">${f.calloutLabel ? `<div style="font-size:11px;color:#92400e;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(f.calloutLabel)}</div>` : ""}${f.calloutBody ? `<div style="font-size:18px;color:#1f2937;font-weight:600;margin-top:6px;line-height:1.4">${escapeHtml(f.calloutBody)}</div>` : ""}</td></tr></table></td></tr>`
    : "";

  const ctaBlock = (f.ctaLabel && f.ctaUrl)
    ? `<tr><td style="padding:0 32px 32px" align="center"><a href="${escapeAttr(f.ctaUrl)}" style="display:inline-block;background:#c41e3a;color:#fff;font-weight:600;font-size:15px;padding:12px 24px;text-decoration:none;border-radius:8px">${escapeHtml(f.ctaLabel)}</a></td></tr>`
    : "";

  const footerNoteBlock = f.footerNote
    ? `<tr><td style="padding:0 32px 32px;color:#64748b;font-size:14px;line-height:1.5"><p style="margin:0">${escapeHtml(f.footerNote)}</p></td></tr>`
    : "";

  return SHELL_OPEN + HEADER(f.headerTitle || "Top Martial Arts Suwanee") + bodyBlock + calloutBlock + ctaBlock + footerNoteBlock + FOOTER + SHELL_CLOSE;
}

function escapeHtml(s: string): string {
  // Allow {{merge}} placeholders to pass through, escape everything else
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
}
function escapeAttr(s: string): string {
  return s.replace(/["<>]/g, c => ({ '"': "&quot;", "<": "&lt;", ">": "&gt;" } as Record<string, string>)[c]);
}

// ─── HTML → SimpleFields parser (best-effort, for opening existing templates) ─

function parseHtmlToSimple(html: string): SimpleFields | null {
  if (!html || !html.includes("background:#c41e3a")) return null;
  const f: SimpleFields = { ...EMPTY_SIMPLE };

  // headerTitle: <div style="...font-size:24px..."> TEXT </div> inside the red header
  const headerMatch = html.match(/<div style="color:#fff;font-size:24px;font-weight:700;margin-top:6px">([\s\S]*?)<\/div>/);
  if (headerMatch) f.headerTitle = decodeHtml(headerMatch[1].trim());

  // greeting + paragraphs: extract all <p style="margin:0 0 16px">...</p> blocks inside the body section
  const bodyMatch = html.match(/<td style="padding:32px 32px 8px;color:#1f2937;font-size:16px;line-height:1\.6">([\s\S]*?)<\/td>/);
  if (bodyMatch) {
    const inner = bodyMatch[1];
    const paragraphs = Array.from(inner.matchAll(/<p style="margin:0 0 16px">([\s\S]*?)<\/p>/g)).map(m => decodeHtml(m[1].trim()));
    if (paragraphs.length > 0) {
      f.greeting = paragraphs[0];
      f.paragraphs = paragraphs.slice(1).join("\n\n");
    }
  }

  // callout
  const calloutLabelMatch = html.match(/<div style="font-size:11px;color:#92400e;font-weight:700;letter-spacing:1px;text-transform:uppercase">([\s\S]*?)<\/div>/);
  if (calloutLabelMatch) f.calloutLabel = decodeHtml(calloutLabelMatch[1].trim());
  const calloutBodyMatch = html.match(/<div style="font-size:18px;color:#1f2937;font-weight:600;margin-top:6px;line-height:1\.4">([\s\S]*?)<\/div>/);
  if (calloutBodyMatch) f.calloutBody = decodeHtml(calloutBodyMatch[1].replace(/<br\s*\/?>/g, ", ").trim());

  // CTA, look for the red button anchor
  const ctaMatch = html.match(/<a href="([^"]+)"[^>]*background:#c41e3a[^>]*>([\s\S]*?)<\/a>/);
  if (ctaMatch) {
    f.ctaUrl = decodeAttr(ctaMatch[1]);
    f.ctaLabel = decodeHtml(ctaMatch[2].trim());
  }

  // footer note, the gray paragraph after the CTA but before the navy footer
  const footerNoteMatch = html.match(/<p style="margin:0;color:#64748b">([\s\S]*?)<\/p>/);
  if (footerNoteMatch) f.footerNote = decodeHtml(footerNoteMatch[1].replace(/<[^>]+>/g, "").trim());

  return f;
}

function decodeHtml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ");
}
function decodeAttr(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}

// ─── Merge field sample data ────────────────────────────────────────────────

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

function delayLabel(hours: number): string {
  if (hours === 0) return "Immediate";
  if (hours < 24) return `${hours}h after enrollment`;
  const days = Math.round(hours / 24);
  return `Day ${days}`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SequencesEditor() {
  const utils = trpc.useUtils();
  const { data: allTemplates, isLoading, error } = trpc.templates.list.useQuery();
  const subjectRef = useRef<HTMLInputElement>(null);
  const greetingRef = useRef<HTMLInputElement>(null);
  const paragraphsRef = useRef<HTMLTextAreaElement>(null);
  const calloutLabelRef = useRef<HTMLInputElement>(null);
  const calloutBodyRef = useRef<HTMLInputElement>(null);
  const footerNoteRef = useRef<HTMLInputElement>(null);
  const bodyHtmlRef = useRef<HTMLTextAreaElement>(null);

  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);
  const [selectedTouchId, setSelectedTouchId] = useState<number | null>(null);

  // Editor mode + state
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [editor, setEditor] = useState<{
    subject: string;
    bodyHtml: string;          // canonical HTML (the saved version)
    simple: SimpleFields;       // structured fields (for Simple Mode)
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
    for (const arr of Array.from(map.values())) arr.sort((a, b) => a.orderIndex - b.orderIndex);
    return map;
  }, [allTemplates]);

  // Auto-select first sequence
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

  // Selected touch
  const selectedTouch = useMemo(() => {
    if (!selectedTouchId) return null;
    for (const arr of Array.from(sequencesMap.values())) {
      const found = arr.find(t => t.id === selectedTouchId);
      if (found) return found;
    }
    return null;
  }, [selectedTouchId, sequencesMap]);

  // Load editor state when touch changes
  useEffect(() => {
    if (selectedTouch) {
      const parsed = parseHtmlToSimple(selectedTouch.bodyHtml ?? "") ?? { ...EMPTY_SIMPLE };
      setEditor({
        subject: selectedTouch.subject ?? "",
        bodyHtml: selectedTouch.bodyHtml ?? "",
        simple: parsed,
        delayHours: selectedTouch.delayHours,
        isActive: selectedTouch.isActive === 1,
        displayName: selectedTouch.displayName ?? "",
        description: selectedTouch.description ?? "",
      });
      setDirty(false);
    }
  }, [selectedTouch]);

  const updateTemplate = trpc.templates.update.useMutation({
    onSuccess: async () => {
      await utils.templates.list.invalidate();
      toast.success("Saved. Next dispatcher tick will use the new content.");
      setDirty(false);
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const sendTest = trpc.templates.sendTest.useMutation({
    onSuccess: (result) => {
      if (result.ok) toast.success(`Test email sent. Check your inbox.`);
      else toast.error(`Test send failed: ${result.reason}`);
    },
    onError: (err) => toast.error(`Test send failed: ${err.message}`),
  });

  // History / rollback
  const [showHistory, setShowHistory] = useState(false);
  const historyQuery = trpc.templates.history.useQuery(
    { templateId: selectedTouch?.id ?? 0 },
    { enabled: showHistory && !!selectedTouch },
  );
  const restoreVersion = (h: { prevSubject: string | null; prevBodyHtml: string | null; prevDelayHours: number | null; prevIsActive: number | null }) => {
    if (!selectedTouch) return;
    if (!confirm("Restore this version? Current content will be overwritten (and saved to history, so you can undo).")) return;
    updateTemplate.mutate({
      id: selectedTouch.id,
      editedBy: "admin_ui",
      changeNote: "Restored a previous version via history",
      patch: {
        subject: h.prevSubject ?? undefined,
        bodyHtml: h.prevBodyHtml ?? undefined,
        delayHours: h.prevDelayHours ?? undefined,
        isActive: h.prevIsActive ?? undefined,
      },
    });
    setShowHistory(false);
  };

  // Compute the HTML that would be saved (regenerated in Simple Mode, raw in Advanced Mode)
  const computedHtml = useMemo(() => {
    if (!editor) return "";
    return mode === "simple" ? buildBrandedHtml(editor.simple) : editor.bodyHtml;
  }, [editor, mode]);

  const handleSave = () => {
    if (!selectedTouch || !editor) return;
    if (!editor.subject.trim()) { toast.error("Subject cannot be empty"); return; }
    const finalHtml = mode === "simple" ? buildBrandedHtml(editor.simple) : editor.bodyHtml;
    updateTemplate.mutate({
      id: selectedTouch.id,
      editedBy: "admin_ui",
      changeNote: `Edited via /admin/sequences (${mode} mode)`,
      patch: {
        subject: editor.subject,
        bodyHtml: finalHtml,
        delayHours: editor.delayHours,
        isActive: editor.isActive ? 1 : 0,
        displayName: editor.displayName || undefined,
        description: editor.description || undefined,
      },
    });
  };

  const handleSendTest = () => {
    if (!selectedTouch) return;
    if (dirty) { toast.warning("Save first. Test sends the saved version."); return; }
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

  const updateSimple = (patch: Partial<SimpleFields>) => {
    if (!editor) return;
    setEditor({ ...editor, simple: { ...editor.simple, ...patch } });
    setDirty(true);
  };

  const insertMergeField = (
    ref: { current: HTMLInputElement | HTMLTextAreaElement | null },
    value: string,
    tag: string,
    onValueChange: (nextValue: string) => void,
  ) => {
    const field = ref.current;
    const start = field?.selectionStart ?? value.length;
    const end = field?.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}${tag}${value.slice(end)}`;
    const nextCaret = start + tag.length;

    onValueChange(nextValue);
    setDirty(true);

    window.requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /><span className="ml-2 text-gray-500">Loading templates...</span></div>;
  if (error) return <div className="text-center py-16 text-red-500">Failed to load templates: {error.message}</div>;

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
                Use "Send preview" to verify in your inbox before relying on the change.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                        className={`w-full text-left px-2.5 py-2 rounded-md flex items-center gap-2.5 transition-colors ${isActive ? "bg-[#1a2d5a] text-white" : "hover:bg-gray-100 text-gray-700"}`}
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

        {/* Column 2: Touches */}
        <Card className="overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{currentSequencePreset?.label ?? "Touches"}</p>
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
                    className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${isActive ? "bg-[#1a2d5a] text-white" : "hover:bg-gray-100 text-gray-700"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${isActive ? "text-white" : "text-gray-900"}`}>{touch.displayName || touch.touchKey}</div>
                        <div className={`text-[11px] mt-0.5 ${isActive ? "text-white/70" : "text-gray-500"}`}>{delayLabel(touch.delayHours)}</div>
                      </div>
                      {isInactive && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isActive ? "border-white/30 text-white/70" : "border-gray-300 text-gray-500"}`}>Off</Badge>
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
            <Card className="flex items-center justify-center h-full min-h-[600px]"><p className="text-gray-400">Select a touch to edit.</p></Card>
          ) : (
            <>
              {/* Editor card */}
              <Card>
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs text-gray-500">Editing</p>
                    <h3 className="font-semibold text-gray-900 text-sm">
                      {currentSequencePreset?.label} <span className="text-gray-400">›</span> {selectedTouch.displayName || selectedTouch.touchKey}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Mode toggle */}
                    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md p-0.5">
                      <button
                        onClick={() => setMode("simple")}
                        className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 ${mode === "simple" ? "bg-[#1a2d5a] text-white" : "text-gray-600 hover:bg-gray-100"}`}
                      >
                        <Sliders className="w-3 h-3" /> Simple
                      </button>
                      <button
                        onClick={() => setMode("advanced")}
                        className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 ${mode === "advanced" ? "bg-[#1a2d5a] text-white" : "text-gray-600 hover:bg-gray-100"}`}
                      >
                        <Code className="w-3 h-3" /> Advanced
                      </button>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-md border border-gray-200">
                      <Switch checked={editor.isActive} onCheckedChange={v => { setEditor({ ...editor, isActive: v }); setDirty(true); }} />
                      <span className="text-sm text-gray-700">{editor.isActive ? "Active" : "Off"}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowHistory(true)} className="gap-1.5">
                      <History className="w-3.5 h-3.5" /> History
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSendTest} disabled={sendTest.isPending} className="gap-1.5">
                      {sendTest.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send preview
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={!dirty || updateTemplate.isPending} className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 gap-1.5">
                      {updateTemplate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                    </Button>
                  </div>
                </div>

                {/* History panel (rollback) */}
                {showHistory && (
                  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowHistory(false)}>
                    <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                      <div className="bg-[#1a2d5a] text-white px-5 py-3 flex items-center justify-between flex-shrink-0">
                        <p className="font-semibold flex items-center gap-2"><History className="w-4 h-4" /> Version History, {selectedTouch.displayName || selectedTouch.touchKey}</p>
                        <button onClick={() => setShowHistory(false)} className="text-white/70 hover:text-white">✕</button>
                      </div>
                      <div className="overflow-y-auto p-4 space-y-2">
                        {historyQuery.isLoading ? (
                          <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                        ) : !historyQuery.data || historyQuery.data.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-8">No previous versions yet. History is recorded each time you save an edit.</p>
                        ) : (
                          historyQuery.data.map((h: any) => (
                            <div key={h.id} className="border border-gray-200 rounded-lg p-3 hover:border-gray-300">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{h.prevSubject || "(no subject)"}</p>
                                  <p className="text-[11px] text-gray-500 mt-0.5">
                                    {h.editedBy} · {new Date(h.editedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                    {h.changeNote ? ` · ${h.changeNote}` : ""}
                                  </p>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => restoreVersion(h)} className="gap-1.5 flex-shrink-0">
                                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  </div>
                )}

                <CardContent className="pt-5 space-y-4">
                  {dirty && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <p className="text-sm text-amber-800">Unsaved changes</p>
                    </div>
                  )}

                  {/* Subject + delay always visible */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="subject" className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Subject Line</Label>
                        <MergeFieldPicker
                          onSelect={tag => insertMergeField(subjectRef, editor.subject, tag, nextValue => {
                            setEditor({ ...editor, subject: nextValue });
                          })}
                        />
                      </div>
                      <Input ref={subjectRef} id="subject" value={editor.subject} onChange={e => { setEditor({ ...editor, subject: e.target.value }); setDirty(true); }} placeholder="Your subject line..." />
                      <p className="text-[11px] text-gray-500">Use <code className="bg-gray-100 px-1 rounded">{`{{firstName}}`}</code>, <code className="bg-gray-100 px-1 rounded">{`{{trialDateLabel}}`}</code>, etc.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="delay" className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Send Delay (hours)</Label>
                      <Input id="delay" type="number" min="0" value={editor.delayHours} onChange={e => { setEditor({ ...editor, delayHours: parseInt(e.target.value) || 0 }); setDirty(true); }} />
                      <p className="text-[11px] text-gray-500">{delayLabel(editor.delayHours)}</p>
                    </div>
                  </div>

                  {/* SIMPLE MODE, structured form */}
                  {mode === "simple" && (
                    <>
                      <div className="border-t border-gray-100 pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Sliders className="w-4 h-4 text-[#1a2d5a]" />
                          <p className="text-sm font-semibold text-gray-800">Email Content</p>
                          <Badge variant="outline" className="text-[10px]">No HTML needed</Badge>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Header Title</Label>
                            <Input value={editor.simple.headerTitle} onChange={e => updateSimple({ headerTitle: e.target.value })} placeholder="e.g. TMA Summer Camp" />
                            <p className="text-[11px] text-gray-500">Shows in the red header bar at the top.</p>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Greeting</Label>
                              <MergeFieldPicker
                                onSelect={tag => insertMergeField(greetingRef, editor.simple.greeting, tag, nextValue => {
                                  updateSimple({ greeting: nextValue });
                                })}
                              />
                            </div>
                            <Input ref={greetingRef} value={editor.simple.greeting} onChange={e => updateSimple({ greeting: e.target.value })} placeholder="Hi {{firstName}}," />
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Main Paragraphs</Label>
                              <MergeFieldPicker
                                onSelect={tag => insertMergeField(paragraphsRef, editor.simple.paragraphs, tag, nextValue => {
                                  updateSimple({ paragraphs: nextValue });
                                })}
                              />
                            </div>
                            <Textarea ref={paragraphsRef} value={editor.simple.paragraphs} onChange={e => updateSimple({ paragraphs: e.target.value })} rows={8} placeholder={"Thanks for your interest in TMA Summer Camp!\n\nHere is what your kid will be doing this summer...\n\nThe fastest way to lock in your week is to register online."} />
                            <p className="text-[11px] text-gray-500">Separate paragraphs with a blank line.</p>
                          </div>

                          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50 space-y-3">
                            <p className="text-xs font-semibold text-gray-700">Yellow Callout Box <span className="font-normal text-gray-500">(optional)</span></p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <Label className="text-[11px] text-gray-600">Callout Label (small uppercase)</Label>
                                  <MergeFieldPicker
                                    onSelect={tag => insertMergeField(calloutLabelRef, editor.simple.calloutLabel, tag, nextValue => {
                                      updateSimple({ calloutLabel: nextValue });
                                    })}
                                  />
                                </div>
                                <Input ref={calloutLabelRef} value={editor.simple.calloutLabel} onChange={e => updateSimple({ calloutLabel: e.target.value })} placeholder="Camp opens" />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <Label className="text-[11px] text-gray-600">Callout Body (the headline)</Label>
                                  <MergeFieldPicker
                                    onSelect={tag => insertMergeField(calloutBodyRef, editor.simple.calloutBody, tag, nextValue => {
                                      updateSimple({ calloutBody: nextValue });
                                    })}
                                  />
                                </div>
                                <Input ref={calloutBodyRef} value={editor.simple.calloutBody} onChange={e => updateSimple({ calloutBody: e.target.value })} placeholder="May 26, 2026" />
                              </div>
                            </div>
                          </div>

                          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50 space-y-3">
                            <p className="text-xs font-semibold text-gray-700">Red Action Button <span className="font-normal text-gray-500">(optional)</span></p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-600">Button Label</Label>
                                <Input value={editor.simple.ctaLabel} onChange={e => updateSimple({ ctaLabel: e.target.value })} placeholder="Register for camp" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-600">Button URL</Label>
                                <Input value={editor.simple.ctaUrl} onChange={e => updateSimple({ ctaUrl: e.target.value })} placeholder="https://tmatkd.com/camp" />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Footer Note <span className="font-normal normal-case text-gray-500">(optional, small gray text)</span></Label>
                              <MergeFieldPicker
                                onSelect={tag => insertMergeField(footerNoteRef, editor.simple.footerNote, tag, nextValue => {
                                  updateSimple({ footerNote: nextValue });
                                })}
                              />
                            </div>
                            <Input ref={footerNoteRef} value={editor.simple.footerNote} onChange={e => updateSimple({ footerNote: e.target.value })} placeholder="Questions? Call (770) 277-3009." />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ADVANCED MODE, raw HTML */}
                  {mode === "advanced" && (
                    <div className="border-t border-gray-100 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Code className="w-4 h-4 text-[#1a2d5a]" />
                        <p className="text-sm font-semibold text-gray-800">Raw HTML</p>
                        <Badge variant="outline" className="text-[10px]">Power user</Badge>
                        <div className="ml-auto">
                          <MergeFieldPicker
                            onSelect={tag => insertMergeField(bodyHtmlRef, editor.bodyHtml, tag, nextValue => {
                              setEditor({ ...editor, bodyHtml: nextValue });
                            })}
                          />
                        </div>
                      </div>
                      <Textarea
                        ref={bodyHtmlRef}
                        value={editor.bodyHtml}
                        onChange={e => { setEditor({ ...editor, bodyHtml: e.target.value }); setDirty(true); }}
                        rows={20}
                        className="font-mono text-xs"
                        placeholder="<p>Hi {{firstName}}, ...</p>"
                      />
                      <p className="text-[11px] text-gray-500 mt-1.5">
                        Direct HTML editing. Switch back to Simple mode anytime, but switching after editing here may lose structure (the Simple parser is best-effort).
                      </p>
                    </div>
                  )}

                  {/* Display name + description (low-priority, footer-ish) */}
                  <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Display Name (internal)</Label>
                      <Input value={editor.displayName} onChange={e => { setEditor({ ...editor, displayName: e.target.value }); setDirty(true); }} placeholder="e.g. Day 0 - Camp Overview" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Description (internal note)</Label>
                      <Input value={editor.description} onChange={e => { setEditor({ ...editor, description: e.target.value }); setDirty(true); }} placeholder="What this email is for." />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card>
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-gray-500" />
                    <p className="font-semibold text-gray-900 text-sm">Live Preview</p>
                    <Badge variant="outline" className="text-[10px]">Sample data</Badge>
                  </div>
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md p-0.5">
                    <button onClick={() => setPreviewMode("rendered")} className={`px-2.5 py-1 text-xs font-medium rounded ${previewMode === "rendered" ? "bg-[#1a2d5a] text-white" : "text-gray-600 hover:bg-gray-100"}`}>Rendered</button>
                    <button onClick={() => setPreviewMode("html")} className={`px-2.5 py-1 text-xs font-medium rounded ${previewMode === "html" ? "bg-[#1a2d5a] text-white" : "text-gray-600 hover:bg-gray-100"}`}>Raw HTML</button>
                  </div>
                </div>
                <CardContent className="p-0">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <p className="text-[11px] text-gray-500">Subject preview</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{renderPreview(editor.subject)}</p>
                  </div>
                  {previewMode === "rendered" ? (
                    <iframe srcDoc={renderPreview(computedHtml)} sandbox="" className="w-full border-0" style={{ height: 600, background: "#f8f9fa" }} title="Email preview" />
                  ) : (
                    <pre className="text-[11px] font-mono p-4 overflow-x-auto bg-gray-900 text-gray-100 whitespace-pre-wrap break-all" style={{ maxHeight: 600 }}>
                      {renderPreview(computedHtml)}
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
                      <p><strong className="text-gray-800">Merge fields you can use anywhere:</strong> <code className="bg-gray-100 px-1 rounded">{`{{firstName}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{parentName}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{kidName}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{trialDateLabel}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{trialTime}}`}</code> <code className="bg-gray-100 px-1 rounded">{`{{programInterest}}`}</code></p>
                      <p><strong className="text-gray-800">Simple vs Advanced:</strong> Simple Mode rebuilds the email from the named fields each time you save. Advanced Mode preserves whatever raw HTML you write. Switch freely, but heavy custom HTML may not parse perfectly back into Simple Mode fields.</p>
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
