import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Users, DollarSign, CheckCircle, Clock, XCircle,
  Trash2, RotateCcw, Calendar, Eye, EyeOff, LogOut,
  LayoutDashboard, Kanban, GraduationCap, BarChart2, Mail,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import LeadsPipeline from "@/components/admin/LeadsPipeline";
import StudentsRoster from "@/components/admin/StudentsRoster";
import AdsInsightsDashboard from "@/components/admin/AdsInsightsDashboard";
import SequencesEditor from "@/components/admin/SequencesEditor";

// ─── Auth ─────────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "tmasuwanee@gmail.com";
const ADMIN_PASSWORD = "Keep9oing!";
const SESSION_KEY = "tma_admin_session";

function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      onLogin();
    } else {
      setError("Incorrect email or password.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 bg-[#1a2d5a] rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-lg">TMA</span>
          </div>
          <CardTitle className="text-xl text-[#1a2d5a]">Admin Access</CardTitle>
          <p className="text-sm text-gray-500">Top Martial Arts Suwanee</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tmasuwanee@gmail.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPw(v => !v)}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full bg-[#1a2d5a] hover:bg-[#1a2d5a]/90">
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Camp Registrations Tab ───────────────────────────────────────────────────

const PROGRAM_LABELS: Record<string, string> = {
  "5day": "5 Days / Week",
  "3day": "3 Days / Week",
  "daily": "Daily Drop-In",
};

function StatusBadge({ status }: { status: string | null }) {
  if (status === "succeeded") return <Badge className="bg-green-100 text-green-800 border-green-200 gap-1"><CheckCircle className="w-3 h-3" />Paid</Badge>;
  if (status === "pending") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200 gap-1"><XCircle className="w-3 h-3" />{status ?? "Unknown"}</Badge>;
}

function CampRegistrationsTab() {
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();
  const { data: allRegistrations, isLoading, error } = trpc.admin.getCampRegistrations.useQuery();

  const softDelete = trpc.admin.softDeleteRegistration.useMutation({
    onSuccess: async () => { await utils.admin.getCampRegistrations.invalidate(); toast.success("Registration removed."); },
    onError: () => toast.error("Failed to delete registration."),
  });
  const restore = trpc.admin.restoreRegistration.useMutation({
    onSuccess: async () => { await utils.admin.getCampRegistrations.invalidate(); toast.success("Registration restored."); },
    onError: () => toast.error("Failed to restore registration."),
  });

  const activeRegistrations = allRegistrations?.filter(r => !r.isDeleted) ?? [];
  const deletedRegistrations = allRegistrations?.filter(r => r.isDeleted) ?? [];
  const displayedRegistrations = showDeleted ? deletedRegistrations : activeRegistrations;

  const totalRevenue = activeRegistrations.reduce((sum, r) => sum + (r.amountPaid ?? 0), 0);
  const totalCampers = activeRegistrations.reduce((sum, r) => sum + r.numCampers, 0);

  const allDisplayedIds = displayedRegistrations.map(r => r.id);
  const allSelected = allDisplayedIds.length > 0 && allDisplayedIds.every(id => selectedIds.has(id));
  const someSelected = allDisplayedIds.some(id => selectedIds.has(id));

  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(allDisplayedIds));
  const toggleSelectOne = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) await softDelete.mutateAsync({ id });
    await utils.admin.getCampRegistrations.invalidate();
    setSelectedIds(new Set());
    setShowBatchDeleteConfirm(false);
    toast.success(`${ids.length} registration${ids.length > 1 ? "s" : ""} removed.`);
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">${(totalRevenue / 100).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Registrations</p>
              <p className="text-2xl font-bold text-gray-900">{activeRegistrations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Campers</p>
              <p className="text-2xl font-bold text-gray-900">{totalCampers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-lg">
            {showDeleted ? `Deleted Registrations (${deletedRegistrations.length})` : `Active Registrations (${activeRegistrations.length})`}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {!showDeleted && selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setShowBatchDeleteConfirm(true)} className="gap-1.5">
                <Trash2 className="w-4 h-4" />Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => { setShowDeleted(v => !v); setSelectedIds(new Set()); }} className="gap-1.5 text-sm">
              {showDeleted ? <><Eye className="w-4 h-4" /> View Active</> : <><EyeOff className="w-4 h-4" /> View Deleted ({deletedRegistrations.length})</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading registrations...</span>
            </div>
          ) : error ? (
            <div className="text-center py-16 text-red-500">Failed to load registrations.</div>
          ) : displayedRegistrations.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              {showDeleted ? "No deleted registrations." : "No active registrations yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    {!showDeleted && (
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                          className={`border-2 border-gray-500 data-[state=unchecked]:bg-gray-100 ${someSelected && !allSelected ? "opacity-50" : ""}`}
                        />
                      </TableHead>
                    )}
                    <TableHead className="font-semibold">Parent</TableHead>
                    <TableHead className="font-semibold">Camper(s)</TableHead>
                    <TableHead className="font-semibold">Program</TableHead>
                    <TableHead className="font-semibold">Weeks Paid For</TableHead>
                    <TableHead className="font-semibold">Add-Ons</TableHead>
                    <TableHead className="font-semibold">Amount</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRegistrations.map((reg) => {
                    const campers = [reg.camper1Name, reg.camper2Name, reg.camper3Name].filter(Boolean);
                    const addOns = [
                      reg.addFieldTrip ? "Field Trip ($25)" : null,
                      reg.addExtendedCare ? "Extended Care ($25)" : null,
                    ].filter(Boolean);
                    const isChecked = selectedIds.has(reg.id);
                    return (
                      <TableRow key={reg.id} className={`hover:bg-gray-50 ${reg.isDeleted ? "opacity-60" : ""} ${isChecked ? "bg-blue-50" : ""}`}>
                        {!showDeleted && (
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleSelectOne(reg.id)}
                              aria-label={`Select registration ${reg.id}`}
                              className="border-2 border-gray-500 data-[state=unchecked]:bg-gray-100"
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="font-medium text-gray-900">{reg.parentFirstName} {reg.parentLastName}</div>
                          <div className="text-xs text-gray-500">{reg.email}</div>
                          <div className="text-xs text-gray-500">{reg.phone}</div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            {campers.map((name, i) => <div key={i} className="text-sm font-medium text-gray-800">{name}</div>)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-700">{PROGRAM_LABELS[reg.programType] ?? reg.programType}</span>
                        </TableCell>
                        <TableCell>
                          {reg.selectedWeeks.length > 0 ? (
                            <div className="space-y-1">
                              {reg.selectedWeeks.map((week, i) => (
                                <div key={i} className="flex items-center gap-1 text-xs">
                                  <Calendar className="w-3 h-3 text-[#1a2d5a]" />
                                  <span className="text-gray-700">{week}</span>
                                </div>
                              ))}
                              {reg.futureWeeks.length > 0 && (
                                <div className="mt-1 pt-1 border-t border-dashed border-gray-200">
                                  <p className="text-xs text-gray-400 mb-1">Intends to pay later:</p>
                                  {reg.futureWeeks.map((week, i) => (
                                    <div key={i} className="flex items-center gap-1 text-xs text-gray-400">
                                      <Calendar className="w-3 h-3" /><span>{week}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </TableCell>
                        <TableCell>
                          {addOns.length > 0 ? (
                            <div className="space-y-0.5">{addOns.map((a, i) => <div key={i} className="text-xs text-gray-600">{a}</div>)}</div>
                          ) : <span className="text-xs text-gray-400">None</span>}
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-gray-900">${((reg.amountPaid ?? 0) / 100).toFixed(2)}</span>
                        </TableCell>
                        <TableCell><StatusBadge status={reg.stripePaymentStatus} /></TableCell>
                        <TableCell>
                          <div className="text-xs text-gray-500">
                            {new Date(reg.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </div>
                          {reg.isDeleted && reg.deletedAt && (
                            <div className="text-xs text-red-400 mt-0.5">
                              Deleted {new Date(reg.deletedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {reg.isDeleted ? (
                            <Button variant="ghost" size="sm" onClick={() => restore.mutate({ id: reg.id })} disabled={restore.isPending} className="text-green-600 hover:text-green-700 hover:bg-green-50 p-1.5 h-auto" title="Restore">
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteTargetId(reg.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 h-auto" title="Remove">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={open => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this registration?</AlertDialogTitle>
            <AlertDialogDescription>This will hide the registration from the active list. You can restore it anytime.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (deleteTargetId !== null) { softDelete.mutate({ id: deleteTargetId }); setDeleteTargetId(null); } }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBatchDeleteConfirm} onOpenChange={setShowBatchDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedIds.size} registration{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>These will be hidden from the active list. You can restore them anytime.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleBatchDelete} disabled={softDelete.isPending}>
              {softDelete.isPending ? "Removing..." : `Remove ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: "registrations", label: "Camp Registrations", icon: LayoutDashboard },
  { id: "pipeline",      label: "Leads Pipeline",     icon: Kanban },
  { id: "students",      label: "Students",            icon: GraduationCap },
  { id: "sequences",     label: "Email Sequences",     icon: Mail },
  { id: "ads",           label: "Ad Performance",      icon: BarChart2 },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminRegistrations() {
  const [isAuthed, setIsAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [activeTab, setActiveTab] = useState<TabId>("registrations");

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAuthed(false);
  };

  if (!isAuthed) {
    return <LoginGate onLogin={() => setIsAuthed(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a2d5a] text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">TMA Admin</h1>
            <p className="text-white/60 text-xs mt-0.5">Top Martial Arts Suwanee</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-white/60 hover:text-white text-sm">← Back to Site</a>
            <Button variant="outline" size="sm" onClick={handleLogout} className="bg-transparent border-white/30 text-white hover:bg-white/10 gap-1.5">
              <LogOut className="w-3.5 h-3.5" />Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-7xl mx-auto flex gap-0">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-[#1a2d5a] text-[#1a2d5a]"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "registrations" && <CampRegistrationsTab />}
        {activeTab === "pipeline"      && <LeadsPipeline />}
        {activeTab === "students"      && <StudentsRoster />}
        {activeTab === "sequences"     && <SequencesEditor />}
        {activeTab === "ads"           && <AdsInsightsDashboard />}
      </div>
    </div>
  );
}
