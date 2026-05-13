import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, Search, Users, RefreshCw, ChevronUp, ChevronDown, AlertCircle } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
// Belt ranks imported from shared module

// Expected ZenPlanner CSV column names (case-insensitive, flexible matching)
const COLUMN_MAP: Record<string, string> = {
  // name
  "name": "name", "full name": "name", "student name": "name",
  // email
  "email": "email", "email address": "email",
  // phone
  "phone": "phone", "phone number": "phone", "cell": "phone", "mobile": "phone",
  // program
  "program": "program", "class": "program", "program name": "program",
  // enrollment date
  "enrollment date": "enrollmentDate", "enroll date": "enrollmentDate", "start date": "enrollmentDate",
  // belt rank
  "belt rank": "beltRank", "rank": "beltRank", "belt": "beltRank",
  // status
  "status": "status", "member status": "status",
  // emergency contact
  "emergency contact": "emergencyContact", "emergency": "emergencyContact",
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const mappedHeaders = rawHeaders.map(h => COLUMN_MAP[h] ?? h);

  return lines.slice(1).map(line => {
    // Handle quoted fields with commas
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
  }).filter(row => row.name); // skip empty rows
}

export default function StudentsRoster() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<{ count: number; timestamp: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterEligible, setFilterEligible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: students = [], isLoading } = searchQuery.trim()
    ? { data: undefined, isLoading: false }
    : trpc.students.getAll.useQuery();

  const { data: searchResults = [], isLoading: isSearching } = searchQuery.trim()
    ? trpc.students.search.useQuery({ query: searchQuery }, { enabled: searchQuery.trim().length >= 2 })
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

  const promoteBelt = trpc.students.promoteBelt.useMutation({
    onSuccess: () => {
      utils.students.getAll.invalidate();
      setSelectedIds(new Set());
      toast.success("Belt rank updated");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const demoteBelt = trpc.students.demoteBelt.useMutation({
    onSuccess: () => {
      utils.students.getAll.invalidate();
      setSelectedIds(new Set());
      toast.success("Belt rank updated");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
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
      await importStudents.mutateAsync({ rows: rows as { name: string; email?: string; phone?: string; program?: string; enrollmentDate?: string; beltRank?: string; status?: string; emergencyContact?: string }[] });
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

  const displayedStudents = searchQuery.trim().length >= 2 ? (searchResults ?? []) : (students ?? []);
  const isLoadingData = isLoading || isSearching;

  // Calculate eligibility for each student
  const studentsWithEligibility = displayedStudents.map(student => {
    const lastPromoted = student.lastPromotedAt ? new Date(student.lastPromotedAt) : null;
    const now = new Date();
    const daysSincePromotion = lastPromoted ? Math.floor((now.getTime() - lastPromoted.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    // Estimated: 1-2 classes per week, so 15 classes ≈ 8-15 weeks. For demo, show as eligible after 60 days.
    const isEligible = daysSincePromotion >= 60 || !lastPromoted;
    return { ...student, isEligible };
  });

  const filteredStudents = filterEligible ? studentsWithEligibility.filter(s => s.isEligible) : studentsWithEligibility;
  const eligibleCount = studentsWithEligibility.filter(s => s.isEligible).length;

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map(s => s.id)));
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* CSV Upload Drop Zone */}
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
                <p className="text-xs text-gray-400">Replaces all existing student data</p>
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
        <p className="text-xs text-amber-600 mt-1">Column names are flexible — partial matches work. Uploading a new CSV replaces all existing student data.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, or phone..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Eligibility Banner */}
      {eligibleCount > 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">
                {eligibleCount} student{eligibleCount !== 1 ? "s" : ""} eligible to test
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterEligible(!filterEligible)}
              className={filterEligible ? "bg-green-100 border-green-300" : ""}
            >
              {filterEligible ? "Showing Eligible" : "Show Eligible"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Action Bar */}
      {selectedIds.size > 0 && (
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {searchQuery.trim() ? `Search Results (${filteredStudents.length})` : `All Students (${filteredStudents.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingData ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500 text-sm">Loading...</span>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {students.length === 0
                ? "No students imported yet. Upload a ZenPlanner CSV to get started."
                : filterEligible
                ? "No students eligible to test yet."
                : "No students match your search."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.size === filteredStudents.length && filteredStudents.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                    </TableHead>
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Contact</TableHead>
                    <TableHead className="font-semibold">Program</TableHead>
                    <TableHead className="font-semibold">Belt Rank</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Enrolled</TableHead>
                    <TableHead className="font-semibold">Emergency Contact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map(student => (
                    <TableRow key={student.id} className={`hover:bg-gray-50 ${selectedIds.has(student.id) ? "bg-blue-50" : ""}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(student.id)}
                          onCheckedChange={() => toggleSelect(student.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-gray-900">{student.name}</p>
                      </TableCell>
                      <TableCell>
                        {student.email && <p className="text-xs text-gray-600">{student.email}</p>}
                        {student.phone && <p className="text-xs text-gray-500">{student.phone}</p>}
                      </TableCell>
                      <TableCell>
                        {student.program ? (
                          <Badge variant="outline" className="text-xs">{student.program}</Badge>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-700">{student.beltRank || "—"}</span>
                          {student.isEligible && (
                            <Badge className="bg-green-100 text-green-800 text-xs">Eligible</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {student.status ? (
                          <Badge className={`text-xs ${student.status.toLowerCase().includes("active") ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                            {student.status}
                          </Badge>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-500">{student.enrollmentDate || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-500">{student.emergencyContact || "—"}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
