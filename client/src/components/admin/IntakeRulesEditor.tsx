/**
 * Intake Rules Editor (Phase 5.6)
 *
 * Admin UI for the routing rules that decide which sequence a new lead enters.
 * Sibling to SequencesEditor: that one edits email CONTENT, this one edits the
 * ROUTING LOGIC (which lead → which sequence).
 *
 * Rules are evaluated highest-priority-first; first match wins. If no rule
 * matches, the lead goes to "unsegmented" (staff alert, no auto-send).
 *
 * Features:
 *   - Table of all rules sorted by priority (desc)
 *   - Add / edit / delete rules
 *   - Toggle active without deleting
 *   - "Test a lead" panel: enter sample lead attributes, see which sequence wins
 *
 * Backed by trpc.rules.{list,create,update,delete,route}.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, GitBranch, Plus, Trash2, Save, X, Play, ArrowRight, Route,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Rule = {
  id: number;
  priority: number;
  ruleName: string;
  matchField: string;
  matchOperator: string;
  matchValue: string | null;
  sequenceKey: string;
  isActive: number;
  description: string | null;
};

const MATCH_FIELDS = [
  { value: "tag", label: "Tag (note: not passed by webhook sync)" },
  { value: "utmSource", label: "Traffic source (utmSource)" },
  { value: "utmCampaign", label: "Campaign name (utmCampaign)" },
  { value: "programInterest", label: "Program interest" },
  { value: "hasTrialDate", label: "Has a booked trial date" },
];
const MATCH_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "is_true", label: "is true (boolean)" },
];
const SEQUENCE_OPTIONS = [
  "booked_trial_confirmation", "summer_camp_nurture", "afterschool_nurture",
  "tkd_trial_nurture", "kickboxing_trial_nurture", "bjj_trial_nurture",
  "fb_generic_nurture", "web_form_nurture",
];

type Draft = {
  id?: number;
  priority: number;
  ruleName: string;
  matchField: string;
  matchOperator: string;
  matchValue: string;
  sequenceKey: string;
  isActive: boolean;
  description: string;
};

const BLANK_DRAFT: Draft = {
  priority: 500, ruleName: "", matchField: "utmCampaign", matchOperator: "contains",
  matchValue: "", sequenceKey: "summer_camp_nurture", isActive: true, description: "",
};

export default function IntakeRulesEditor() {
  const utils = trpc.useUtils();
  const { data: rules, isLoading, error } = trpc.rules.list.useQuery({ activeOnly: false });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Test panel
  const [testLead, setTestLead] = useState({ utmSource: "facebook", utmCampaign: "", programInterest: "", trialClassDate: "" });
  const [testResult, setTestResult] = useState<{ matchedRuleId: number | null; sequenceKey: string } | null>(null);

  const createRule = trpc.rules.create.useMutation({
    onSuccess: async () => { await utils.rules.list.invalidate(); toast.success("Rule added."); setDraft(null); },
    onError: (e) => toast.error(`Add failed: ${e.message}`),
  });
  const updateRule = trpc.rules.update.useMutation({
    onSuccess: async () => { await utils.rules.list.invalidate(); toast.success("Rule saved."); setDraft(null); },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });
  const deleteRule = trpc.rules.delete.useMutation({
    onSuccess: async () => { await utils.rules.list.invalidate(); toast.success("Rule deleted."); setDeleteId(null); },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });
  const routeTest = trpc.rules.route.useMutation({
    onSuccess: (r) => setTestResult(r),
    onError: (e) => toast.error(`Test failed: ${e.message}`),
  });

  const startEdit = (r: Rule) => setDraft({
    id: r.id, priority: r.priority, ruleName: r.ruleName, matchField: r.matchField,
    matchOperator: r.matchOperator, matchValue: r.matchValue ?? "", sequenceKey: r.sequenceKey,
    isActive: r.isActive === 1, description: r.description ?? "",
  });

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.ruleName.trim()) { toast.error("Rule name required"); return; }
    if (draft.matchOperator !== "is_true" && !draft.matchValue.trim()) { toast.error("Match value required"); return; }
    if (draft.id) {
      updateRule.mutate({ id: draft.id, patch: {
        priority: draft.priority, ruleName: draft.ruleName, matchField: draft.matchField as any,
        matchOperator: draft.matchOperator as any, matchValue: draft.matchValue || undefined,
        sequenceKey: draft.sequenceKey, isActive: draft.isActive ? 1 : 0, description: draft.description || undefined,
        updatedBy: "admin_ui",
      }});
    } else {
      createRule.mutate({
        priority: draft.priority, ruleName: draft.ruleName, matchField: draft.matchField as any,
        matchOperator: draft.matchOperator as any, matchValue: draft.matchValue || undefined,
        sequenceKey: draft.sequenceKey, description: draft.description || undefined, createdBy: "admin_ui",
      });
    }
  };

  const runTest = () => {
    routeTest.mutate({
      utmSource: testLead.utmSource || undefined,
      utmCampaign: testLead.utmCampaign || undefined,
      programInterest: testLead.programInterest || undefined,
      trialClassDate: testLead.trialClassDate || undefined,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /><span className="ml-2 text-gray-500">Loading rules...</span></div>;
  if (error) return <div className="text-center py-16 text-red-500">Failed to load rules: {error.message}</div>;

  const sortedRules = [...(rules as Rule[] ?? [])].sort((a, b) => b.priority - a.priority);

  return (
    <div className="space-y-4">
      {/* Intro */}
      <Card>
        <CardContent className="py-5 px-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-[#1a2d5a] rounded-lg flex items-center justify-center flex-shrink-0">
              <Route className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">Intake Routing Rules</h2>
              <p className="text-sm text-gray-600 mt-1">
                These rules decide which email sequence a new lead enters. They're checked from highest priority to lowest;
                the first rule that matches wins. If nothing matches, the lead is flagged "unsegmented" and staff are alerted (no automatic emails).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-[1fr_320px] gap-4">
        {/* Rules table */}
        <Card>
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Rules ({sortedRules.length}), highest priority first</p>
            <Button size="sm" onClick={() => setDraft({ ...BLANK_DRAFT })} className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Rule
            </Button>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="w-16">Priority</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Routes to</TableHead>
                    <TableHead className="w-16">Active</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRules.map(r => (
                    <TableRow key={r.id} className={`hover:bg-gray-50 ${r.isActive === 0 ? "opacity-50" : ""}`}>
                      <TableCell className="font-mono text-xs text-gray-500">{r.priority}</TableCell>
                      <TableCell className="font-medium text-gray-900 text-sm">{r.ruleName}</TableCell>
                      <TableCell className="text-xs text-gray-600">
                        <code className="bg-gray-100 px-1 rounded">{r.matchField}</code> {r.matchOperator} {r.matchValue ? <code className="bg-gray-100 px-1 rounded">{r.matchValue}</code> : ""}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[11px] font-mono">{r.sequenceKey}</Badge></TableCell>
                      <TableCell>{r.isActive === 1 ? <Badge className="bg-green-100 text-green-800 text-[10px]">On</Badge> : <Badge variant="outline" className="text-[10px]">Off</Badge>}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(r)} className="p-1.5 h-auto text-gray-500 hover:text-[#1a2d5a]" title="Edit"><Save className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteId(r.id)} className="p-1.5 h-auto text-red-400 hover:text-red-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Test panel */}
        <Card className="h-fit">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center gap-2">
            <Play className="w-4 h-4 text-gray-500" />
            <p className="text-sm font-semibold text-gray-900">Test a lead</p>
          </div>
          <CardContent className="pt-4 space-y-3">
            <p className="text-[11px] text-gray-500">Enter sample lead attributes to see which sequence the rules would pick.</p>
            <div className="space-y-1">
              <Label className="text-[11px] text-gray-600">Traffic source</Label>
              <Input value={testLead.utmSource} onChange={e => setTestLead({ ...testLead, utmSource: e.target.value })} placeholder="facebook / website" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-gray-600">Campaign</Label>
              <Input value={testLead.utmCampaign} onChange={e => setTestLead({ ...testLead, utmCampaign: e.target.value })} placeholder="summer_camp_2026" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-gray-600">Program interest</Label>
              <Input value={testLead.programInterest} onChange={e => setTestLead({ ...testLead, programInterest: e.target.value })} placeholder="kickboxing" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-gray-600">Trial date (if booked)</Label>
              <Input value={testLead.trialClassDate} onChange={e => setTestLead({ ...testLead, trialClassDate: e.target.value })} placeholder="2026-06-01" className="h-8 text-sm" />
            </div>
            <Button onClick={runTest} disabled={routeTest.isPending} className="w-full bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 gap-1.5" size="sm">
              {routeTest.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />} Test routing
            </Button>
            {testResult && (
              <div className={`rounded-md p-3 text-sm ${testResult.sequenceKey === "unsegmented" ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider">Routes to</p>
                <p className="font-mono font-semibold text-gray-900">{testResult.sequenceKey}</p>
                {testResult.matchedRuleId ? (
                  <p className="text-[11px] text-gray-500 mt-1">Matched rule #{testResult.matchedRuleId}</p>
                ) : (
                  <p className="text-[11px] text-amber-700 mt-1">No rule matched, staff would be alerted</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit/Add dialog */}
      {draft && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDraft(null)}>
          <Card className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1a2d5a] text-white px-5 py-3 flex items-center justify-between">
              <p className="font-semibold flex items-center gap-2"><GitBranch className="w-4 h-4" /> {draft.id ? "Edit Rule" : "New Rule"}</p>
              <button onClick={() => setDraft(null)} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Rule Name</Label>
                  <Input value={draft.ruleName} onChange={e => setDraft({ ...draft, ruleName: e.target.value })} placeholder="Summer camp leads → camp sequence" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Priority</Label>
                  <Input type="number" value={draft.priority} onChange={e => setDraft({ ...draft, priority: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50 space-y-3">
                <p className="text-xs font-semibold text-gray-700">IF the lead's...</p>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={draft.matchField} onValueChange={v => setDraft({ ...draft, matchField: v })}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{MATCH_FIELDS.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={draft.matchOperator} onValueChange={v => setDraft({ ...draft, matchOperator: v })}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{MATCH_OPERATORS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input
                    value={draft.matchValue}
                    onChange={e => setDraft({ ...draft, matchValue: e.target.value })}
                    placeholder="value"
                    disabled={draft.matchOperator === "is_true"}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">THEN route to sequence</Label>
                <Select value={draft.sequenceKey} onValueChange={v => setDraft({ ...draft, sequenceKey: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEQUENCE_OPTIONS.map(s => <SelectItem key={s} value={s} className="font-mono text-sm">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Description (internal note)</Label>
                <Input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Why this rule exists" />
              </div>

              {draft.id && (
                <div className="flex items-center gap-2">
                  <Switch checked={draft.isActive} onCheckedChange={v => setDraft({ ...draft, isActive: v })} />
                  <span className="text-sm text-gray-700">{draft.isActive ? "Active" : "Inactive"}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                <Button onClick={saveDraft} disabled={createRule.isPending || updateRule.isPending} className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 gap-1.5">
                  {(createRule.isPending || updateRule.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {draft.id ? "Save" : "Add Rule"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Leads that would have matched this rule will fall through to the next matching rule (or unsegmented). This can't be undone, but you can re-create the rule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteRule.mutate({ id: deleteId })} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
