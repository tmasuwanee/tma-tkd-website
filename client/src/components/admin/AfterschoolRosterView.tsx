import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, Plus, Pencil, Trash2, Check, X, MessageSquare } from "lucide-react";

// ─── Week date helpers ────────────────────────────────────────────────────────
function getWeekDates(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon + offsetWeeks * 7);
  const days: Date[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    days.push(d);
  }
  return days;
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtFull(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Student = {
  id: number;
  schoolName: string;
  childName: string;
  grade: string | null;
  groupLabel: string | null;
  phone: string | null;
};

// ─── Add / Edit modal ─────────────────────────────────────────────────────────
function StudentForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Student>;
  onSave: (v: Omit<Student, "id">) => void;
  onCancel: () => void;
}) {
  const [schoolName, setSchoolName] = useState(initial?.schoolName ?? "");
  const [childName, setChildName] = useState(initial?.childName ?? "");
  const [grade, setGrade] = useState(initial?.grade ?? "");
  const [groupLabel, setGroupLabel] = useState(initial?.groupLabel ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold text-[#1a2d5a] mb-4">
          {initial?.id ? "Edit Student" : "Add Student"}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">School *</label>
            <Input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="e.g. Jackson" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Child's Name *</label>
            <Input value={childName} onChange={e => setChildName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Grade</label>
              <Input value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. 3rd" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Group</label>
              <Input value={groupLabel} onChange={e => setGroupLabel(e.target.value)} placeholder="optional" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parent Phone</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 404.555.1234" />
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            className="bg-[#1a2d5a] text-white hover:bg-[#1a2d5a]/90"
            disabled={!schoolName.trim() || !childName.trim()}
            onClick={() => onSave({ schoolName: schoolName.trim(), childName: childName.trim(), grade: grade.trim() || null, groupLabel: groupLabel.trim() || null, phone: phone.trim() || null })}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function AfterschoolRosterView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDays = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);

  const { data: students = [], refetch } = trpc.roster.list.useQuery();
  const addMut = trpc.roster.add.useMutation({ onSuccess: () => { refetch(); setAdding(false); } });
  const updateMut = trpc.roster.update.useMutation({ onSuccess: () => { refetch(); setEditing(null); } });
  const removeMut = trpc.roster.remove.useMutation({ onSuccess: () => refetch() });

  // Group by school
  const bySchool = useMemo(() => {
    const map: Record<string, Student[]> = {};
    for (const s of students) {
      if (!map[s.schoolName]) map[s.schoolName] = [];
      map[s.schoolName].push(s);
    }
    return map;
  }, [students]);

  const toggleAttendance = (studentId: number, dayIdx: number) => {
    const key = `${studentId}-${dayIdx}`;
    setAttendance(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const sendSms = (student: Student) => {
    if (!student.phone) { alert("No phone number on file for this student."); return; }
    const raw = student.phone.replace(/\D/g, "");
    const msg = encodeURIComponent(`Hi! This is TMA Suwanee. Please text back to confirm pickup for ${student.childName} today. Thank you!`);
    window.open(`sms:${raw}?body=${msg}`, "_blank");
  };

  const dayLabels = ["Mon", "Tue", "Wed", "Thurs", "Fri"];

  // Row counter across all schools
  let rowNum = 0;

  return (
    <div className="font-sans">
      {/* ── Toolbar (hidden on print) ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>← Prev</Button>
          <span className="text-sm font-medium text-gray-700 min-w-[160px] text-center">
            {fmtFull(weekDays[0])} – {fmtFull(weekDays[4])}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>Next →</Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} className="text-xs text-gray-500">
              This Week
            </Button>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Student
          </Button>
          <Button
            size="sm"
            className="bg-[#1a2d5a] text-white hover:bg-[#1a2d5a]/90"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* ── Roster sheet ── */}
      <div className="roster-sheet bg-white border border-gray-300 rounded-lg overflow-hidden print:border-0 print:rounded-none print:shadow-none">
        {/* Header */}
        <div className="px-4 py-2 border-b border-gray-300 print:px-2">
          <p className="text-sm font-semibold text-gray-700">
            From <span className="text-[#1a2d5a]">{fmt(weekDays[0])}</span> To <span className="text-[#1a2d5a]">{fmt(weekDays[4])}</span>
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-white">
                <th className="border border-gray-300 px-2 py-1 text-center w-8">#</th>
                <th className="border border-gray-300 px-2 py-1 text-left min-w-[110px]">Phone</th>
                <th className="border border-gray-300 px-2 py-1 text-center w-14">Grade</th>
                <th className="border border-gray-300 px-2 py-1 text-center w-14">Group</th>
                <th className="border border-gray-300 px-2 py-1 text-left min-w-[140px] text-[#c0392b] font-bold">CHILD'S NAME</th>
                {dayLabels.map((d, i) => (
                  <th key={d} className="border border-gray-300 px-1 py-1 text-center text-[#c0392b] font-bold w-14">
                    <div>{d}</div>
                    <div className="font-normal text-gray-500 text-[10px]">{fmt(weekDays[i])}</div>
                  </th>
                ))}
                <th className="border border-gray-300 px-1 py-1 text-center w-10 print:hidden">SMS</th>
                <th className="border border-gray-300 px-1 py-1 text-center w-16 print:hidden">Edit</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bySchool).map(([school, schoolStudents]) => (
                <React.Fragment key={school}>
                  {/* School header row */}
                  <tr key={`school-${school}`} className="bg-[#4a90d9]">
                    <td colSpan={13} className="border border-gray-300 px-3 py-1 text-center font-bold text-white text-sm tracking-wide uppercase">
                      {school}
                    </td>
                  </tr>
                  {/* Student rows */}
                  {schoolStudents.map(student => {
                    rowNum++;
                    return (
                      <tr key={student.id} className="even:bg-gray-50 hover:bg-blue-50/30">
                        <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-500">{rowNum}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-gray-700">{student.phone ?? ""}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-700">{student.grade ?? ""}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-700">{student.groupLabel ?? ""}</td>
                        <td className="border border-gray-300 px-2 py-1.5 font-semibold text-gray-900">{student.childName}</td>
                        {[0,1,2,3,4].map(dayIdx => {
                          const key = `${student.id}-${dayIdx}`;
                          const checked = !!attendance[key];
                          return (
                            <td key={dayIdx} className="border border-gray-300 px-1 py-1.5 text-center cursor-pointer select-none"
                              onClick={() => toggleAttendance(student.id, dayIdx)}>
                              {checked
                                ? <Check className="w-4 h-4 mx-auto text-[#1a2d5a]" />
                                : <span className="inline-block w-4 h-4 border border-gray-300 rounded-sm mx-auto" />}
                            </td>
                          );
                        })}
                        {/* SMS button */}
                        <td className="border border-gray-300 px-1 py-1.5 text-center print:hidden">
                          <button
                            title={`Text ${student.phone ?? "no phone"}`}
                            onClick={() => sendSms(student)}
                            className="text-blue-600 hover:text-blue-800 disabled:opacity-30"
                            disabled={!student.phone}
                          >
                            <MessageSquare className="w-4 h-4 mx-auto" />
                          </button>
                        </td>
                        {/* Edit / remove */}
                        <td className="border border-gray-300 px-1 py-1.5 text-center print:hidden">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setEditing(student)} className="text-gray-500 hover:text-[#1a2d5a]">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { if (confirm(`Remove ${student.childName}?`)) removeMut.mutate({ id: student.id }); }}
                              className="text-gray-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
              {/* Empty buffer rows for printing */}
              {Array.from({ length: Math.max(0, 5 - students.length) }).map((_, i) => (
                <tr key={`empty-${i}`}>
                  <td className="border border-gray-300 px-2 py-3" />
                  <td className="border border-gray-300 px-2 py-3" />
                  <td className="border border-gray-300 px-2 py-3" />
                  <td className="border border-gray-300 px-2 py-3" />
                  <td className="border border-gray-300 px-2 py-3" />
                  {[0,1,2,3,4].map(d => <td key={d} className="border border-gray-300 px-2 py-3" />)}
                  <td className="border border-gray-300 print:hidden" />
                  <td className="border border-gray-300 print:hidden" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notes section */}
        <div className="border-t border-gray-300 p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Staff notes for this week..."
            rows={3}
            className="w-full text-sm border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a2d5a] print:border-0 print:resize-none"
          />
        </div>
      </div>

      {/* ── Modals ── */}
      {adding && (
        <StudentForm
          onSave={v => addMut.mutate(v)}
          onCancel={() => setAdding(false)}
        />
      )}
      {editing && (
        <StudentForm
          initial={editing}
          onSave={v => updateMut.mutate({ id: editing.id, ...v })}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .roster-sheet, .roster-sheet * { visibility: visible; }
          .roster-sheet { position: fixed; top: 0; left: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
          table { font-size: 10px; }
          textarea { border: none !important; }
        }
      `}</style>
    </div>
  );
}
