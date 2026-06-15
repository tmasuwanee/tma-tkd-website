import { useState } from "react";
import { useLocation } from "wouter";
import { useAdminAuth, AdminLoginGate } from "./AdminAuth";
import { Button } from "@/components/ui/button";
import {
  Kanban, ClipboardCheck, Phone, PhoneOutgoing, Mail, Route as RouteIcon,
  BarChart2, GraduationCap, CalendarCheck, ShieldAlert, Camera, LogOut,
  Menu, PhoneCall, CalendarDays, CheckSquare,
} from "lucide-react";
import { CallsApp } from "@/pages/AdminTodaysCalls";
import { CallLogApp } from "@/pages/AdminCallLog";
import { CheckinApp } from "@/pages/AdminCheckin";
import { ControlsApp } from "@/pages/AdminControls";
import { StudioApp } from "@/pages/Studio";
import AdminVoiceTest from "@/pages/AdminVoiceTest";
import { CampRegistrationsTab } from "@/pages/AdminRegistrations";
import LeadsPipeline from "@/components/admin/LeadsPipeline";
import StudentsRoster from "@/components/admin/StudentsRoster";
import AdsInsightsDashboard from "@/components/admin/AdsInsightsDashboard";
import SequencesEditor from "@/components/admin/SequencesEditor";
import IntakeRulesEditor from "@/components/admin/IntakeRulesEditor";
import CalendarView from "@/components/admin/CalendarView";
import MyTasks from "@/components/admin/MyTasks";

// Keys double as URL segments (/admin/<key>). They match the old standalone
// routes where possible (/admin/calls, /admin/checkin, /admin/call-log,
// /admin/voice-test, /admin/controls) so those URLs still land in the shell.
type ViewKey =
  | "calls" | "calendar" | "leads" | "checkin" | "call-log" | "voice-test"
  | "sequences" | "rules" | "ads" | "students" | "camp" | "controls" | "studio" | "tasks";

const NAV: { group: string; items: { key: ViewKey; label: string; icon: any }[] }[] = [
  { group: "Leads", items: [
    { key: "calls", label: "Today's Calls", icon: PhoneCall },
    { key: "calendar", label: "Calendar", icon: CalendarDays },
    { key: "leads", label: "Leads", icon: Kanban },
    { key: "checkin", label: "Trial Check-in", icon: ClipboardCheck },
  ]},
  { group: "Calls", items: [
    { key: "call-log", label: "Call Log", icon: Phone },
    { key: "voice-test", label: "Voice Test", icon: PhoneOutgoing },
  ]},
  { group: "Growth", items: [
    { key: "sequences", label: "Email Sequences", icon: Mail },
    { key: "rules", label: "Routing Rules", icon: RouteIcon },
    { key: "ads", label: "Ad Performance", icon: BarChart2 },
  ]},
  { group: "Roster", items: [
    { key: "students", label: "Students", icon: GraduationCap },
    { key: "camp", label: "Camp Registrations", icon: CalendarCheck },
  ]},
  { group: "System", items: [
    { key: "tasks", label: "My Tasks", icon: CheckSquare },
    { key: "controls", label: "Automation", icon: ShieldAlert },
    { key: "studio", label: "Studio", icon: Camera },
  ]},
];

const ALL_ITEMS = NAV.flatMap(g => g.items);

function renderView(key: ViewKey, email: string) {
  switch (key) {
    case "calls": return <CallsApp email={email} embedded />;
    case "calendar": return <CalendarView />;
    case "leads": return <LeadsPipeline />;
    case "checkin": return <CheckinApp email={email} embedded />;
    case "call-log": return <CallLogApp email={email} embedded />;
    case "voice-test": return <AdminVoiceTest embedded />;
    case "sequences": return <SequencesEditor />;
    case "rules": return <IntakeRulesEditor />;
    case "ads": return <AdsInsightsDashboard />;
    case "students": return <StudentsRoster />;
    case "camp": return <CampRegistrationsTab />;
    case "controls": return <ControlsApp email={email} embedded />;
    case "studio": return <StudioApp email={email} embedded />;
    case "tasks": return <MyTasks />;
  }
}

export default function AdminShell() {
  const { email, ready, login, logout } = useAdminAuth();
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!ready) return null;
  if (!email) return <AdminLoginGate onLogin={login} />;

  const seg = location.replace(/^\/admin\/?/, "").split("/")[0];
  const active: ViewKey = ALL_ITEMS.find(i => i.key === seg)?.key ?? "leads";
  const activeLabel = ALL_ITEMS.find(i => i.key === active)?.label ?? "Leads";

  const go = (key: ViewKey) => { navigate(`/admin/${key}`); setMobileOpen(false); };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-60 bg-white border-r border-gray-200 flex flex-col transition-transform md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-100 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#1a2d5a] flex items-center justify-center text-white font-bold text-sm">T</div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-[#1a2d5a]">Top Martial Arts</div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Admin</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map(group => (
            <div key={group.group} className="mb-3">
              <div className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group.group}</div>
              {group.items.map(item => {
                const Icon = item.icon;
                const on = item.key === active;
                return (
                  <button key={item.key} onClick={() => go(item.key)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                      on ? "bg-[#1a2d5a]/10 text-[#1a2d5a] font-semibold border-r-2 border-[#1a2d5a]"
                         : "text-gray-600 hover:bg-gray-100"}`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-gray-100 p-3 shrink-0">
          <div className="text-[11px] text-gray-400 px-1 mb-2 truncate">{email}</div>
          <Button variant="outline" size="sm" className="w-full" onClick={logout}>
            <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign out
          </Button>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <div className="flex-1 md:ml-60 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-4 sticky top-0 z-10 shrink-0">
          <button className="md:hidden text-gray-600" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-[#1a2d5a]">{activeLabel}</h1>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="p-3 md:p-5">
            {renderView(active, email)}
          </div>
        </main>
      </div>
    </div>
  );
}
