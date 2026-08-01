import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Trash2, RotateCcw, Calendar, Eye, EyeOff, Mail,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// NOTE: This file used to also export a standalone admin shell (default export)
// with its own hardcoded login gate. That shell was unrouted (/admin/registrations
// redirects to /admin/leads) and shipped an admin password in the client bundle,
// so it was removed 2026-07-25. The dashboard now lives entirely in AdminShell;
// only CampRegistrationsTab is consumed from here.

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

export function CampRegistrationsTab() {
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
  const resendConfirmation = trpc.admin.resendCampConfirmation.useMutation({
    onSuccess: (r) => { toast.success(`Confirmation + waiver email resent to ${r.email}`); },
    onError: (e) => { toast.error(e.message ?? "Failed to resend the confirmation email."); },
  });
  const restore = trpc.admin.restoreRegistration.useMutation({
    onSuccess: async () => { await utils.admin.getCampRegistrations.invalidate(); toast.success("Registration restored."); },
    onError: () => toast.error("Failed to restore registration."),
  });

  const activeRegistrations = allRegistrations?.filter(r => !r.isDeleted) ?? [];
  const deletedRegistrations = allRegistrations?.filter(r => r.isDeleted) ?? [];
  const displayedRegistrations = showDeleted ? deletedRegistrations : activeRegistrations;

  const paidRegistrations = activeRegistrations.filter(r => r.stripePaymentStatus === "succeeded");
  const totalRevenue = paidRegistrations.reduce((sum, r) => sum + (r.amountPaid ?? 0), 0);
  const totalCampers = paidRegistrations.reduce((sum, r) => sum + r.numCampers, 0);

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
                    const campers = [
                      { name: reg.camper1Name, age: reg.camper1Age, dob: reg.camper1Dob },
                      { name: reg.camper2Name, age: reg.camper2Age, dob: reg.camper2Dob },
                      { name: reg.camper3Name, age: reg.camper3Age, dob: reg.camper3Dob },
                    ].filter(c => c.name);
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
                            {campers.map((c, i) => (
                              <div key={i} className="text-sm font-medium text-gray-800">
                                {c.name}
                                {c.age ? <span className="text-xs font-normal text-gray-500"> · age {c.age}</span> : null}
                                {c.dob ? <span className="text-xs font-normal text-gray-400"> ({c.dob})</span> : null}
                              </div>
                            ))}
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
                          <div className="flex items-center gap-0.5">
                            {!reg.isDeleted && reg.stripePaymentStatus === "succeeded" && reg.email && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => resendConfirmation.mutate({ id: reg.id })}
                                disabled={resendConfirmation.isPending}
                                className="text-[#1a2d5a] hover:text-[#1a2d5a] hover:bg-blue-50 p-1.5 h-auto"
                                title="Resend confirmation + waiver email to the parent"
                              >
                                <Mail className="w-4 h-4" />
                              </Button>
                            )}
                            {reg.isDeleted ? (
                              <Button variant="ghost" size="sm" onClick={() => restore.mutate({ id: reg.id })} disabled={restore.isPending} className="text-green-600 hover:text-green-700 hover:bg-green-50 p-1.5 h-auto" title="Restore">
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => setDeleteTargetId(reg.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 h-auto" title="Remove">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
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
