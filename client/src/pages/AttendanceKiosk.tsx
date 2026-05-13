import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type PageState = "password" | "search" | "confirmation";

export default function AttendanceKiosk() {
  const [pageState, setPageState] = useState<PageState>("password");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{ id: number; name: string; beltRank?: string | null } | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);

  // Fetch students for search
  const { data: students = [] } = trpc.students.getAll.useQuery();
  const checkInMutation = trpc.attendance.checkIn.useMutation();

  // Check if password is already stored in localStorage
  useEffect(() => {
    const storedPassword = localStorage.getItem("attendance_kiosk_unlocked");
    if (storedPassword === "true") {
      setPageState("search");
    }
  }, []);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would be validated against the server
    // For now, we'll accept any non-empty password and store it
    if (password.trim()) {
      localStorage.setItem("attendance_kiosk_unlocked", "true");
      localStorage.setItem("attendance_kiosk_password", password);
      setPageState("search");
      setPassword("");
      setPasswordError("");
    } else {
      setPasswordError("Password required");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("attendance_kiosk_unlocked");
    localStorage.removeItem("attendance_kiosk_password");
    setPageState("password");
    setPassword("");
    setSearchQuery("");
    setSelectedStudent(null);
  };

  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCheckIn = async () => {
    if (!selectedStudent) return;

    try {
      await checkInMutation.mutateAsync({
        studentId: selectedStudent.id,
        classDate: new Date().toISOString().split("T")[0],
      });

      setConfirmationMessage(`Welcome, ${selectedStudent.name}! Checked in for today.`);
      setAlreadyCheckedIn(false);

      // Auto-reset after 5 seconds
      setTimeout(() => {
        setPageState("search");
        setSearchQuery("");
        setSelectedStudent(null);
        setConfirmationMessage("");
      }, 5000);
    } catch (error: any) {
      if (error.message?.includes("already checked in")) {
        setConfirmationMessage(`Already checked in today, ${selectedStudent.name}!`);
        setAlreadyCheckedIn(true);
      } else {
        setConfirmationMessage("Error checking in. Please try again.");
      }

      setTimeout(() => {
        setPageState("search");
        setSearchQuery("");
        setSelectedStudent(null);
        setConfirmationMessage("");
      }, 5000);
    }
  };

  if (pageState === "password") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-2">Attendance Kiosk</h1>
          <p className="text-center text-gray-600 mb-6">Enter password to continue</p>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                className="text-lg py-6"
                autoFocus
              />
              {passwordError && <p className="text-red-600 text-sm mt-2">{passwordError}</p>}
            </div>

            <Button type="submit" className="w-full py-6 text-lg font-semibold">
              Unlock
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (pageState === "confirmation") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-12 w-full max-w-lg text-center">
          <h1 className="text-4xl font-bold text-green-600 mb-4">✓</h1>
          <p className="text-2xl font-semibold text-gray-800 mb-4">{confirmationMessage}</p>
          {selectedStudent?.beltRank && (
            <p className="text-lg text-gray-600">
              Belt Rank: <span className="font-semibold">{selectedStudent.beltRank}</span>
            </p>
          )}
          {alreadyCheckedIn && (
            <p className="text-sm text-yellow-600 mt-4">Already checked in today</p>
          )}
          <p className="text-sm text-gray-500 mt-6">Returning to search in a moment...</p>
        </div>
      </div>
    );
  }

  // Search page
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-800 p-4 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Check In</h1>
        <Button variant="outline" onClick={handleLogout} className="text-white border-white hover:bg-white hover:text-blue-900">
          Logout
        </Button>
      </div>

      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
        {/* Search Input */}
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Type student name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-2xl py-8 px-6"
            autoFocus
          />
        </div>

        {/* Student List */}
        <div className="flex-1 bg-white rounded-lg shadow-lg overflow-y-auto">
          {filteredStudents.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-xl">
              {searchQuery ? "No students found" : "Start typing to search"}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
              {filteredStudents.map((student) => (
                <button
                  key={student.id}
                  onClick={() => {
                    setSelectedStudent({
                      id: student.id,
                      name: student.name,
                      beltRank: student.beltRank,
                    });
                    setPageState("confirmation");
                    handleCheckIn();
                  }}
                  className="bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 rounded-lg p-4 text-left transition-colors"
                >
                  <p className="font-semibold text-lg text-gray-800">{student.name}</p>
                  {student.program && (
                    <p className="text-sm text-gray-600">{student.program}</p>
                  )}
                  {student.beltRank && (
                    <p className="text-sm text-blue-600 font-medium mt-1">{student.beltRank}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
