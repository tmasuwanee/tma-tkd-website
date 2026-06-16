import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Upload, Search, Users, RefreshCw, ChevronUp, ChevronDown, AlertCircle, X, Award,
  CreditCard, ExternalLink, Clock, FileSignature,
} from "lucide-react";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BELT_SEQUENCE } from "@/../../shared/beltRanks";

const stripePromise = loadStripe(import.meta.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY);
const TRIAL_PROGRAMS = ["Taekwondo", "Little Tigers", "BJJ", "Kickboxing"];

const COLUMN_MAP: Record<string, string> = {
  "name": "name", "full name": "name", "student name": "name",
  "email": "email", "email address": "email",
  "phone": "phone", "phone number": "phone", "cell": "phone", "mobile": "phone",
  "program": "programs", "class": "programs", "program name": "programs",
  "enrollment date": "enrollmentDate", "enroll date": "enrollmentDate", "start date": "enrollmentDate",
  "belt rank": "beltRank", "rank": "beltRank", "belt": "beltRank",
  "status": "status", "member status": "status",
  "emergency contact": "emergencyContact", "emergency": "emergencyContact",
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const mappedHeaders = rawHeaders.map(h => COLUMN_MAP[h] ?? h);

  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    mappedHeaders.forEach((header, i) => {
      row[header] = (values[i] ?? "").replace(/^"|"$/g, "").trim();
    });
    return row;
  }).filter(row => row.name);
}

interface StudentEditState {
  id?: number;
  name: string;
  email: string;
  phone: string;
  programs: string;
  enrollmentDate: string;
  emergencyContact: string;
  status: string;
  beltRank: string;
  isEligibleOverride: boolean;
  attendanceCount?: number; // editable attendance count
}

const PROGRAMS = ["Taekwondo", "BJJ", "Kickboxing", "Afterschool"];
const STATUSES = ["Active", "Inactive", "On Hold"];

export default function StudentsRoster() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<{ count: number; timestamp: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [beltFilter, setBeltFilter] = useState("all");
  const [editingStudent, setEditingStudent] = useState<StudentEditState | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null);
  const [eligibleFilter, setEligibleFilter] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: students = [], isLoading } = !searchQuery.trim()
    ? trpc.students.getAll.useQuery()
    : { data: undefined, isLoading: false };

  const { data: searchResults = [], isLoading: isSearching } = searchQuery.trim()
    ? trpc.students.search.useQuery({ query: searchQuery }, { enabled: searchQuery.trim().length >= 1 })
    : { data: undefined, isLoading: false };

  const importStudents = trpc.students.import.useMutation({
    onSuccess: (data) => {
      utils.students.getAll.invalidate();
      setImportStats({ count: data.count, timestamp: new Date().toLocaleString() });
      setImporting(false);
      toast.success(`Imported ${data.count} students successfully`);
    },
    onError: (err) => {
      setImporting(false);
      toast.error(`Import failed: ${err.message}`);
    },
  });

  const updateStudent = trpc.students.update.useMutation({
    onSuccess: () => {
      utils.students.getAll.invalidate();
      utils.students.search.invalidate();
      setIsEditDialogOpen(false);
      setEditingStudent(null);
      toast.success("Student updated");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const createStudent = trpc.students.create.useMutation({
    onSuccess: () => {
      utils.students.getAll.invalidate();
      setIsEditDialogOpen(false);
      setEditingStudent(null);
      toast.success("Student created");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const promoteBelt = trpc.students.promoteBelt.useMutation({
    onSuccess: () => {
      utils.students.getAll.invalidate();
      utils.attendance.countSincePromotion.invalidate();
      setSelectedIds(new Set());
      setSelectionMode(false);
      toast.success("Belt rank updated");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const demoteBelt = trpc.students.demoteBelt.useMutation({
    onSuccess: () => {
      utils.students.getAll.invalidate();
      utils.attendance.countSincePromotion.invalidate();
      setSelectedIds(new Set());
      setSelectionMode(false);
      toast.success("Belt rank updated");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const setAttendanceCount = trpc.attendance.setCount.useMutation({
    onSuccess: () => utils.attendance.countSincePromotion.invalidate(),
    onError: (err) => toast.error(`Failed to update class count: ${err.message}`),
  });

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error("No valid rows found in CSV. Check the file format.");
        setImporting(false);
        return;
      }
      await importStudents.mutateAsync({
        rows: rows as {
          name: string;
          email?: string;
          phone?: string;
          programs?: string;
          enrollmentDate?: string;
          beltRank?: string;
          status?: string;
          emergencyContact?: string;
        }[],
      });
    } catch {
      toast.error("Failed to read file");
      setImporting(false);
    }
  }, [importStudents]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const displayedStudents = searchQuery.trim().length >= 1 ? (searchResults ?? []) : (students ?? []);
  const isLoadingData = isLoading || isSearching;

  // Fetch attendance counts for all displayed students
  const attendanceCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    displayedStudents.forEach(student => {
      // This will be fetched via useQuery in the component
    });
    return counts;
  }, [displayedStudents]);

  // Apply belt filter
  const filteredByBelt = beltFilter === "all"
    ? displayedStudents
    : displayedStudents.filter(s => s.beltRank === beltFilter);

  // Count eligible students (isEligibleOverride = 1)
  const eligibleCount = students.filter(s => s.isEligibleOverride === 1).length;

  // Apply eligible filter
  const filteredStudents = eligibleFilter
    ? filteredByBelt.filter(s => s.isEligibleOverride === 1)
    : filteredByBelt;

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
    if (newSet.size === 0) {
      setSelectionMode(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredByBelt.length) {
      setSelectedIds(new Set());
      setSelectionMode(false);
    } else {
      setSelectedIds(new Set(filteredByBelt.map(s => s.id)));
      setSelectionMode(true);
    }
  };

  const handleRowClick = (student: typeof students[0]) => {
    if (selectionMode) {
      toggleSelect(student.id);
    } else {
      setEditingStudent({
        id: student.id,
        name: student.name,
        email: student.email || "",
        phone: student.phone || "",
        programs: student.programs || "",
        enrollmentDate: student.enrollmentDate || "",
        emergencyContact: student.emergencyContact || "",
        status: student.status || "",
        beltRank: student.beltRank || "",
        isEligibleOverride: student.isEligibleOverride ? true : false,
      });
      setIsEditDialogOpen(true);
    }
  };

  const handleAddStudent = () => {
    setEditingStudent({
      name: "",
      email: "",
      phone: "",
      programs: "",
      enrollmentDate: "",
      emergencyContact: "",
      status: "Active",
      beltRank: "White",
      isEligibleOverride: false,
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveStudent = async () => {
    if (!editingStudent || !editingStudent.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (editingStudent.id) {
      await updateStudent.mutateAsync({
        id: editingStudent.id,
        name: editingStudent.name,
        email: editingStudent.email || null,
        phone: editingStudent.phone || null,
        programs: editingStudent.programs || null,
        enrollmentDate: editingStudent.enrollmentDate || null,
        emergencyContact: editingStudent.emergencyContact || null,
        status: editingStudent.status || null,
        beltRank: editingStudent.beltRank || null,
        isEligibleOverride: editingStudent.isEligibleOverride ? 1 : 0,
      });
      // If attendance count was manually edited, persist it
      if (editingStudent.attendanceCount !== undefined) {
        await setAttendanceCount.mutateAsync({
          studentId: editingStudent.id,
          count: editingStudent.attendanceCount,
        });
      }
    } else {
      await createStudent.mutateAsync({
        name: editingStudent.name,
        email: editingStudent.email || null,
        phone: editingStudent.phone || null,
        programs: editingStudent.programs || null,
        enrollmentDate: editingStudent.enrollmentDate || null,
        emergencyContact: editingStudent.emergencyContact || null,
        status: editingStudent.status || null,
        beltRank: editingStudent.beltRank || null,
        isEligibleOverride: editingStudent.isEligibleOverride ? 1 : 0,
      });
    }
  };

  const handlePromote = () => {
    if (selectedIds.size === 0) {
      toast.error("No students selected");
      return;
    }
    const ids = Array.from(selectedIds);
    ids.forEach(id => promoteBelt.mutate({ studentId: id }));
  };

  const handleDemote = () => {
    if (selectedIds.size === 0) {
      toast.error("No students selected");
      return;
    }
    const ids = Array.from(selectedIds);
    ids.forEach(id => demoteBelt.mutate({ studentId: id }));
  };

  return (
    <div className="space-y-6">
      {/* Stats + Upload */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Students</p>
                <p className="text-2xl font-bold text-gray-900">{students.length}</p>
              </div>
            </div>
            {importStats && (
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                Last updated: {importStats.timestamp}
              </p>
            )}
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${eligibleFilter ? "ring-2 ring-green-500 bg-green-50" : "hover:bg-gray-50"}`}
          onClick={() => setEligibleFilter(f => !f)}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Award className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Eligible to Test</p>
                <p className="text-2xl font-bold text-gray-900">{eligibleCount}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">{eligibleFilter ? "Showing eligible only - click to clear" : "Click to filter"}</p>
          </CardContent>
        </Card>

        <Card
          className={`border-2 border-dashed transition-colors cursor-pointer ${isDragging ? "border-[#1a2d5a] bg-blue-50" : "border-gray-300 hover:border-[#1a2d5a]"}`}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="pt-5 pb-4 flex flex-col items-center justify-center text-center">
            {importing ? (
              <div className="flex items-center gap-2 text-[#1a2d5a]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">Importing...</span>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 text-gray-400 mb-1.5" />
                <p className="text-sm font-medium text-gray-700">Upload ZenPlanner CSV</p>
                <p className="text-xs text-gray-400 mt-0.5">Drag & drop or click to browse</p>
                <p className="text-xs text-gray-400">Re-uploading a CSV adds new students and updates existing ones by name - no data is deleted.</p>
              </>
            )}
          </CardContent>
        </Card>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>

      {/* CSV Format Hint */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-amber-800 mb-1">Expected CSV columns (from ZenPlanner export):</p>
        <p className="text-xs text-amber-700 font-mono">Name, Email, Phone, Program, Enrollment Date, Belt Rank, Status, Emergency Contact</p>
        <p className="text-xs text-amber-600 mt-1">Column names are flexible - partial matches work. Re-uploading a CSV adds new students and updates existing ones by name - no data is deleted.</p>
      </div>

      {/* Search + Belt Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={beltFilter} onValueChange={setBeltFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Belts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Belts</SelectItem>
            {BELT_SEQUENCE.map(belt => (
              <SelectItem key={belt} value={belt}>
                {belt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selection Mode Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-blue-800">
              {selectedIds.size} student{selectedIds.size !== 1 ? "s" : ""} selected
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDemote}
                disabled={demoteBelt.isPending}
                className="gap-1"
              >
                <ChevronDown className="w-4 h-4" />
                Belt Rank −
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePromote}
                disabled={promoteBelt.isPending}
                className="gap-1"
              >
                <ChevronUp className="w-4 h-4" />
                Belt Rank +
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectionMode(false);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3-Week Trials */}
      <TrialSection />

      {/* Table */}
      <Card>
        <CardHeader className="pb-3 flex items-center justify-between">
          <CardTitle className="text-base">
            {searchQuery.trim() ? `Search Results (${filteredByBelt.length})` : `All Students (${filteredByBelt.length})`}
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-[#c41e3a]/40 text-[#c41e3a] hover:bg-[#c41e3a]/5" onClick={() => setTrialOpen(true)}>
              <CreditCard className="w-4 h-4 mr-1" /> Add Trial Student
            </Button>
            <Button size="sm" onClick={handleAddStudent}>
              + Add Student
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingData ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500 text-sm">Loading...</span>
            </div>
          ) : filteredByBelt.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {students.length === 0
                ? "No students imported yet. Upload a ZenPlanner CSV to get started."
                : "No students match your filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-12">
                      {selectionMode && (
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={selectedIds.size === filteredByBelt.length && filteredByBelt.length > 0}
                            onCheckedChange={toggleSelectAll}
                            className="border-2 border-gray-800"
                          />
                        </div>
                      )}
                    </TableHead>
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Contact</TableHead>
                    <TableHead className="font-semibold">Program</TableHead>
                    <TableHead className="font-semibold">Belt Rank</TableHead>
                    <TableHead className="font-semibold">Progress</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Enrolled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map(student => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      selectionMode={selectionMode}
                      isSelected={selectedIds.has(student.id)}
                      onRowClick={() => handleRowClick(student)}
                      onCheckboxChange={() => toggleSelect(student.id)}
                      onHover={setHoveredRowId}
                      isHovered={hoveredRowId === student.id}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Edit Dialog */}
      {editingStudent && (
        <StudentEditDialog
          student={editingStudent}
          isOpen={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onStudentChange={setEditingStudent}
          onSave={handleSaveStudent}
          isSaving={updateStudent.isPending || createStudent.isPending}
          isNewStudent={!editingStudent.id}
        />
      )}

      {/* Add Trial Student (the $99 3-week trial) */}
      {trialOpen && (
        <TrialStudentDialog
          onClose={() => setTrialOpen(false)}
          onDone={() => utils.trial.list.invalidate()}
        />
      )}
    </div>
  );
}

// ── 3-Week Trials section ────────────────────────────────────────────────────
function daysLeft(endDate?: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(endDate + "T23:59:59");
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
}

const TRIAL_STATUS_STYLE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  active: "bg-blue-100 text-blue-800",
  converted: "bg-green-100 text-green-800",
  expired: "bg-amber-100 text-amber-800",
  canceled: "bg-red-100 text-red-700",
};

function TrialSection() {
  const utils = trpc.useUtils();
  const { data: trials = [] } = trpc.trial.list.useQuery();
  const setStatus = trpc.trial.setStatus.useMutation({ onSuccess: () => utils.trial.list.invalidate() });
  const active = (trials as any[]).filter(t => t.status === "active" || t.status === "pending");

  if (active.length === 0) return null;

  return (
    <Card className="border-[#c41e3a]/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#c41e3a]" /> 3-Week Trials ({active.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold">Student</TableHead>
                <TableHead className="font-semibold">Program</TableHead>
                <TableHead className="font-semibold">Ends</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((t: any) => {
                const left = daysLeft(t.endDate);
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <p className="font-medium text-gray-900">{t.studentName}</p>
                      {t.phone && <p className="text-xs text-gray-500">{t.phone}</p>}
                    </TableCell>
                    <TableCell className="text-sm capitalize">{t.programInterest || "-"}</TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-700">{t.endDate || "-"}</div>
                      {left !== null && (
                        <div className={`text-xs flex items-center gap-1 ${left <= 3 ? "text-[#c41e3a] font-medium" : "text-gray-400"}`}>
                          <Clock className="w-3 h-3" />{left < 0 ? "ended" : left === 0 ? "ends today" : `${left} days left`}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${TRIAL_STATUS_STYLE[t.status] ?? "bg-gray-100 text-gray-600"}`}>{t.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === "active" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => setStatus.mutate({ id: t.id, status: "converted" })}>Converted</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-400"
                            onClick={() => setStatus.mutate({ id: t.id, status: "expired" })}>Expired</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentRow({
  student,
  selectionMode,
  isSelected,
  onRowClick,
  onCheckboxChange,
  onHover,
  isHovered,
}: {
  student: any;
  selectionMode: boolean;
  isSelected: boolean;
  onRowClick: () => void;
  onCheckboxChange: () => void;
  onHover: (id: number | null) => void;
  isHovered: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: attendanceCount = 0 } = trpc.attendance.countSincePromotion.useQuery(
    { studentId: student.id },
    { enabled: !!student.id }
  );

  const isEligible = attendanceCount >= 15 || student.isEligibleOverride === 1;

  return (
    <TableRow
      className={`hover:bg-gray-50 cursor-pointer ${isSelected ? "bg-blue-50" : ""}`}
      onClick={onRowClick}
      onMouseEnter={() => onHover(student.id)}
      onMouseLeave={() => onHover(null)}
    >
      <TableCell onClick={e => e.stopPropagation()}>
        {(selectionMode || isHovered) && (
          <Checkbox checked={isSelected} onCheckedChange={onCheckboxChange} className="border-2 border-gray-800" />
        )}
      </TableCell>
      <TableCell>
        <p className="font-medium text-gray-900">{student.name}</p>
      </TableCell>
      <TableCell>
        {student.email && <p className="text-xs text-gray-600">{student.email}</p>}
        {student.phone && <p className="text-xs text-gray-500">{student.phone}</p>}
      </TableCell>
      <TableCell>
        {student.programs ? (
          <Badge variant="outline" className="text-xs">
            {student.programs}
          </Badge>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{student.beltRank || "-"}</span>
          {isEligible && (
            <Badge className="bg-green-100 text-green-800 text-xs">Eligible</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{attendanceCount} / 15</span>
          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${Math.min((attendanceCount / 15) * 100, 100)}%` }}
            />
          </div>
        </div>
      </TableCell>
      <TableCell>
        {student.status ? (
          <Badge
            className={`text-xs ${
              student.status.toLowerCase().includes("active")
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {student.status}
          </Badge>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-xs text-gray-500">{student.enrollmentDate || "-"}</span>
      </TableCell>
    </TableRow>
  );
}

function StudentEditDialog({
  student,
  isOpen,
  onOpenChange,
  onStudentChange,
  onSave,
  isSaving,
  isNewStudent,
}: {
  student: StudentEditState;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onStudentChange: (student: StudentEditState) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  isNewStudent: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: attendanceCount = 0 } = trpc.attendance.countSincePromotion.useQuery(
    { studentId: student.id || 0 },
    { enabled: !!student.id }
  );

  const isEligible = attendanceCount >= 15 || student.isEligibleOverride;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNewStudent ? "Add Student" : `Edit ${student.name}`}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="belt">Belt & Eligibility</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Name *</label>
              <Input
                value={student.name}
                onChange={e => onStudentChange({ ...student, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input
                value={student.email}
                onChange={e => onStudentChange({ ...student, email: e.target.value })}
                placeholder="Email address"
                type="email"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Phone</label>
              <Input
                value={student.phone}
                onChange={e => onStudentChange({ ...student, phone: e.target.value })}
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Programs</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {PROGRAMS.map(p => {
                  const selected = (student.programs || "").split(",").map(x => x.trim()).filter(Boolean);
                  const isChecked = selected.includes(p);
                  return (
                    <label key={p} className="flex items-center gap-2 cursor-pointer p-2 rounded-md border border-gray-200 hover:bg-gray-50">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={checked => {
                          const current = (student.programs || "").split(",").map(x => x.trim()).filter(Boolean);
                          const updated = checked
                            ? [...current.filter(x => x !== p), p]
                            : current.filter(x => x !== p);
                          onStudentChange({ ...student, programs: updated.join(", ") });
                        }}
                        className="border-2 border-gray-700"
                      />
                      <span className="text-sm text-gray-700">{p}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Enrollment Date</label>
              <Input
                value={student.enrollmentDate}
                onChange={e => onStudentChange({ ...student, enrollmentDate: e.target.value })}
                placeholder="YYYY-MM-DD"
                type="date"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Emergency Contact</label>
              <Input
                value={student.emergencyContact}
                onChange={e => onStudentChange({ ...student, emergencyContact: e.target.value })}
                placeholder="Name and phone"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Status</label>
              <Select value={student.status} onValueChange={v => onStudentChange({ ...student, status: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="belt" className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Belt Rank</label>
              <Select value={student.beltRank} onValueChange={v => onStudentChange({ ...student, beltRank: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select belt rank" />
                </SelectTrigger>
                <SelectContent>
                  {BELT_SEQUENCE.map(belt => (
                    <SelectItem key={belt} value={belt}>
                      {belt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isNewStudent && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Attendance Progress</label>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">
                      {attendanceCount} / 15 classes
                    </span>
                    {isEligible && (
                      <Badge className="bg-green-100 text-green-800">Eligible to Test</Badge>
                    )}
                  </div>
                  <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${Math.min((attendanceCount / 15) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Edit Class Count</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min="0"
                      max="999"
                      value={student.attendanceCount ?? attendanceCount}
                      onChange={e => onStudentChange({ ...student, attendanceCount: parseInt(e.target.value) || 0 })}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                    <span className="text-sm text-gray-600">classes attended</span>
                  </div>
                  <p className="text-xs text-gray-500">Manually override the attendance count. Leave blank to use actual check-in count.</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Manual Eligibility Override</label>
              <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg">
                <Checkbox
                  checked={student.isEligibleOverride}
                  onCheckedChange={v => onStudentChange({ ...student, isEligibleOverride: !!v })}
                />
                <span className="text-sm text-gray-600">
                  Eligible for Belt Test
                </span>
              </div>
              <p className="text-xs text-gray-500">Override automatic eligibility based on attendance. When enabled, this student is marked as eligible to test regardless of attendance count.</p>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card className="border-gray-200">
              <CardContent className="pt-6">
                <p className="text-sm text-gray-600">Payment history coming soon.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Trial Student ($99 3-week trial) ─────────────────────────────────────
function TrialStudentDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const [studentName, setStudentName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [program, setProgram] = useState("Taekwondo");
  const [startDate, setStartDate] = useState(today);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [tab, setTab] = useState("details");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testMode, setTestMode] = useState(false);

  const { data: waivers = [] } = trpc.waiver.list.useQuery();
  const hasWaiver = !!email.trim() && (waivers as any[]).some(w => (w.email || "").toLowerCase() === email.trim().toLowerCase());

  const endDate = (() => {
    const s = new Date(startDate + "T12:00:00");
    const e = new Date(s.getTime() + 21 * 86400000);
    return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
  })();

  const createIntent = trpc.trial.createIntent.useMutation({
    onSuccess: (r) => { setClientSecret(r.clientSecret ?? null); setPaymentIntentId(r.paymentIntentId); },
    onError: (e) => toast.error("Couldn't start payment: " + e.message),
  });

  const startPayment = () => {
    if (!studentName.trim()) { toast.error("Student name is required."); setTab("details"); return; }
    if (!email.trim() && !phone.trim()) { toast.error("Add an email or phone."); setTab("details"); return; }
    createIntent.mutate({
      studentName: studentName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      programInterest: program,
      emergencyContact: emergencyContact.trim() || undefined,
      startDate,
      testMode,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Trial Student · $99 3-Week Trial</DialogTitle></DialogHeader>

        {success ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-[#1a2d5a] mb-1">Payment received</h3>
            <p className="text-sm text-gray-600 mb-1">{studentName} is enrolled in the 3-week trial.</p>
            <p className="text-xs text-gray-400 mb-6">Receipt sent{email ? ` to ${email}` : ""}. Trial ends {endDate}.</p>
            <Button onClick={() => { onDone(); onClose(); }} className="bg-[#1a2d5a] hover:bg-[#142347] text-white">Done</Button>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="payment">Payment</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Student name *</label>
                <Input value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="for the receipt" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Phone</label>
                  <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="phone" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Program</label>
                  <Select value={program} onValueChange={setProgram}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TRIAL_PROGRAMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Trial start date</label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Emergency contact</label>
                <Input value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} placeholder="Name and phone" />
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileSignature className="w-4 h-4 text-gray-400" />
                  {email.trim()
                    ? (hasWaiver ? <span className="text-green-700 font-medium">Waiver on file</span> : <span className="text-amber-700">No waiver on file yet</span>)
                    : <span className="text-gray-500">Enter email to check for a waiver</span>}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => window.open("/enroll?type=trial", "_blank")}>
                  Open trial waiver <ExternalLink className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>

              <Button className="w-full bg-[#1a2d5a] hover:bg-[#142347] text-white" onClick={() => setTab("payment")}>
                Continue to payment
              </Button>
            </TabsContent>

            <TabsContent value="payment" className="space-y-4">
              <div className="bg-[#1a2d5a]/5 border border-[#1a2d5a]/15 rounded-lg p-4 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">3-Week Trial</span>
                  <span className="font-bold text-[#1a2d5a] text-lg">{testMode ? "$0.50" : "$99.00"}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{studentName || "Student"} · starts {startDate} · ends {endDate}</div>
              </div>

              {!clientSecret ? (
                <>
                  <label className="flex items-start gap-2.5 cursor-pointer bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <Checkbox checked={testMode} onCheckedChange={v => setTestMode(v === true)}
                      className="mt-0.5 border-2 border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500" />
                    <span className="text-xs text-amber-800">
                      <span className="font-semibold block">Test mode: charge $0.50 instead of $99</span>
                      Use this to verify the card flow, then refund the 50&cent; in Stripe. Leave OFF for real signups.
                    </span>
                  </label>
                  <Button className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white" onClick={startPayment} disabled={createIntent.isPending}>
                    {createIntent.isPending ? "Starting..." : (testMode ? "Charge $0.50 (test)" : "Charge $99")}
                  </Button>
                </>
              ) : (
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
                  <TrialPaymentForm paymentIntentId={paymentIntentId!} onSuccess={() => setSuccess(true)} />
                </Elements>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TrialPaymentForm({ paymentIntentId, onSuccess }: { paymentIntentId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const confirm = trpc.trial.confirmPayment.useMutation();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/admin/students` },
      redirect: "if_required",
    });
    if (error) { toast.error(error.message ?? "Payment failed. Please try again."); setProcessing(false); return; }
    try { await confirm.mutateAsync({ paymentIntentId }); } catch (err) { console.error("confirm trial payment:", err); }
    onSuccess();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || processing} className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white">
        {processing ? "Processing..." : "Pay $99"}
      </Button>
    </form>
  );
}
