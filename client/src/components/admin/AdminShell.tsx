import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminAuth, AdminLoginGate } from "./AdminAuth";
import { Button } from "@/components/ui/button";
import {
  Kanban, ClipboardCheck, Phone, PhoneOutgoing, Mail, Route as RouteIcon,
  BarChart2, GraduationCap, CalendarCheck, ShieldAlert, Camera, LogOut,
  Menu, PhoneCall, CalendarDays, CheckSquare, FileSignature, Link2, BookOpen,
  ShoppingBag, Users, ClipboardList, FileText, Home, ChevronDown, ChevronRight, Search, Sparkles,
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
import WaiversView from "@/components/admin/WaiversView";
import LinksView from "@/components/admin/LinksView";
import PlaybookView from "@/components/admin/PlaybookView";
import OrdersView from "@/components/admin/OrdersView";
import EnrolledFamiliesView from "@/components/admin/EnrolledFamiliesView";
import AfterschoolRosterView from "@/components/admin/AfterschoolRosterView";
import InvoicesView from "@/components/admin/InvoicesView";
import TodayView from "@/components/admin/TodayView";
import CommandPalette from "@/components/admin/CommandPalette";
import AssistantPanel from "@/components/admin/AssistantPanel";

// Keys double as URL segments (/admin/<key>). They match the old standalone
// routes where possible (/admin/calls, /admin/checkin, /admin/call-log,
// /admin/voice-test, /admin/controls) so those URLs still land in the shell.
type ViewKey =
  | "today" | "calls" | "calendar" | "leads" | "checkin" | "waivers" | "call-log" | "voice-test"
  | "sequences" | "rules" | "ads" | "students" | "camp" | "controls" | "studio" | "tasks" | "links" | "playbook"
  | "orders" | "enrolled" | "afterschool-roster" | "invoices";

type NavItem = { key: ViewKey; label: string; icon: any };
type NavGroup = { group: string; items: NavItem[]; collapsible?: boolean };

// Front-desk-facing groups (always shown). Reorganized 2026-08-05 around the
// three real daily jobs: work leads (Today/Prospects), manage people, handle money.
// 2026-08-11 (Phase 4): promoted Studio -> "Flyer Studio" into visible Tools
// (flyer-building is a core job, no longer buried in Owner tools); moved the
// personal "My Tasks" into collapsed Owner tools; renamed "Call Log" -> "Call
// History"; dissolved "Forms & Calls" (Waivers + Call History live in Tools).
// Route keys are unchanged, so every existing /admin/<key> URL still works.
const NAV: NavGroup[] = [
  { group: "Main", items: [
    { key: "today", label: "Today", icon: Home },
  ]},
  { group: "Prospects", items: [
    { key: "calendar", label: "Calendar", icon: CalendarDays },
    { key: "leads", label: "Leads", icon: Kanban },
  ]},
  { group: "People", items: [
    { key: "enrolled", label: "Enrolled Families", icon: Users },
    { key: "afterschool-roster", label: "Afterschool Roster", icon: ClipboardList },
    { key: "students", label: "Students", icon: GraduationCap },
  ]},
  { group: "Money", items: [
    { key: "orders", label: "Orders", icon: ShoppingBag },
    { key: "camp", label: "Camp Registrations", icon: CalendarCheck },
    { key: "invoices", label: "Invoice Generator", icon: FileText },
  ]},
  { group: "Tools", items: [
    { key: "studio", label: "Flyer Studio", icon: Camera },
    { key: "waivers", label: "Waivers", icon: FileSignature },
    { key: "call-log", label: "Call History", icon: Phone },
    { key: "playbook", label: "Front Desk Playbook", icon: BookOpen },
    { key: "links", label: "Links", icon: Link2 },
  ]},
  // Owner / config tools — collapsed by default so the front desk isn't buried
  // in settings. (Shared login, so this is decluttering, not access control.)
  { group: "Owner tools", collapsible: true, items: [
    { key: "tasks", label: "My Tasks", icon: CheckSquare },
    { key: "sequences", label: "Email Sequences", icon: Mail },
    { key: "rules", label: "Routing Rules", icon: RouteIcon },
    { key: "ads", label: "Ad Performance", icon: BarChart2 },
    { key: "controls", label: "Automation", icon: ShieldAlert },
    { key: "voice-test", label: "Voice Test", icon: PhoneOutgoing },
  ]},
];

const ALL_ITEMS = NAV.flatMap(g => g.items);

// Routes reachable by URL / drill-down but intentionally NOT shown in the sidebar.
// 2026-08-11: Today's Calls + Trial Check-in are folded into the Today screen so
// the daily loop is one page instead of three. Their full views stay one click
// away (Today links to them, the search palette jumps to them, old URLs still
// resolve), so keep the routes routable here even though they left the nav.
const HIDDEN_ITEMS: { key: ViewKey; label: string }[] = [
  { key: "calls", label: "Today's Calls" },
  { key: "checkin", label: "Trial Check-in" },
];
const ROUTABLE_ITEMS = [...ALL_ITEMS, ...HIDDEN_ITEMS];

function renderView(key: ViewKey, email: string) {
  switch (key) {
    case "today": return <TodayView />;
    case "calls": return <CallsApp email={email} embedded />;
    case "calendar": return <CalendarView />;
    case "leads": return <LeadsPipeline />;
    case "checkin": return <CheckinApp email={email} embedded />;
    case "waivers": return <WaiversView />;
    case "call-log": return <CallLogApp email={email} embedded />;
    case "voice-test": return <AdminVoiceTest embedded />;
    case "sequences": return <SequencesEditor />;
    case "rules": return <IntakeRulesEditor />;
    case "ads": return <AdsInsightsDashboard />;
    case "students": return <StudentsRoster />;
    case "enrolled": return <EnrolledFamiliesView />;
    case "orders": return <OrdersView />;
    case "camp": return <CampRegistrationsTab />;
    case "invoices": return <InvoicesView />;
    case "controls": return <ControlsApp email={email} embedded />;
    case "studio": return <StudioApp email={email} embedded />;
    case "tasks": return <MyTasks />;
    case "links": return <LinksView />;
    case "playbook": return <PlaybookView />;
    case "afterschool-roster": return <AfterschoolRosterView />;
  }
}

export default function AdminShell() {
  const { email, ready, login, logout } = useAdminAuth();
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(() => {
    try { return localStorage.getItem("tma_admin_owner_open") === "1"; } catch { return false; }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  // Global search shortcut: Cmd/Ctrl-K toggles the palette; "/" opens it, unless
  // the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(o => !o);
      } else if (e.key === "/") {
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) return null;
  if (!email) return <AdminLoginGate onLogin={login} />;

  const seg = location.replace(/^\/admin\/?/, "").split("/")[0];
  const active: ViewKey = ROUTABLE_ITEMS.find(i => i.key === seg)?.key ?? "today";
  const activeLabel = ROUTABLE_ITEMS.find(i => i.key === active)?.label ?? "Today";

  const go = (key: ViewKey) => { navigate(`/admin/${key}`); setMobileOpen(false); };
  const toggleOwner = () => setOwnerOpen(v => {
    const next = !v;
    try { localStorage.setItem("tma_admin_owner_open", next ? "1" : "0"); } catch { /* noop */ }
    return next;
  });

  const renderItem = (item: NavItem) => {
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
  };

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
              {group.collapsible ? (
                <button onClick={toggleOwner}
                  className="w-full flex items-center justify-between px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600">
                  <span>{group.group}</span>
                  {ownerOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              ) : (
                group.group !== "Main" && <div className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group.group}</div>
              )}
              {(!group.collapsible || ownerOpen) && group.items.map(renderItem)}
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
          <button onClick={() => setAssistantOpen(true)}
            className="ml-auto flex items-center gap-2 text-sm text-[#1a2d5a] border border-[#1a2d5a]/25 rounded-lg px-3 py-1.5 hover:bg-[#1a2d5a]/5 transition-colors">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Assistant</span>
          </button>
          <button onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-[#1a2d5a]/40 hover:text-[#1a2d5a] transition-colors">
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-400">Ctrl K</kbd>
          </button>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="p-3 md:p-5">
            {renderView(active, email)}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
