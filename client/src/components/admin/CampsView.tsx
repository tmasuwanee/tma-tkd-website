import { useState } from "react";
import { CalendarCheck, Sun, ExternalLink, Printer } from "lucide-react";
import { CampRegistrationsTab } from "@/pages/AdminRegistrations";
import DayCampView from "@/components/admin/DayCampView";

/**
 * Camps — one home for every camp program. Seasonal camp registrations (summer /
 * spring break) and day camps ($60/day, school-out mornings) used to be two
 * separate nav items; they live here under sub-tabs, with quick links to the
 * public signup page and the printable office sheet.
 */
const LINKS = [
  { href: "/day-camp", label: "Day camp signup page", icon: ExternalLink },
  { href: "/day-camp-sheet", label: "Printable day-camp sheet", icon: Printer },
  { href: "/camp-registration", label: "Camp registration page", icon: ExternalLink },
];

export default function CampsView() {
  const [tab, setTab] = useState<"registrations" | "day">("registrations");
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1a2d5a]/10 flex items-center justify-center shrink-0"><CalendarCheck className="w-5 h-5 text-[#1a2d5a]" /></div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a2d5a]">Camps</h1>
          <p className="text-sm text-gray-500 mt-0.5">Seasonal camp registrations and day camps in one place.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {LINKS.map(l => {
          const Icon = l.icon;
          return (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a2d5a] border border-[#1a2d5a]/25 rounded-lg px-2.5 py-1.5 hover:bg-[#1a2d5a]/5">
              <Icon className="w-3.5 h-3.5" /> {l.label}
            </a>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 border-b border-gray-200">
        <TabBtn active={tab === "registrations"} onClick={() => setTab("registrations")} icon={<CalendarCheck className="w-4 h-4" />}>Camp registrations</TabBtn>
        <TabBtn active={tab === "day"} onClick={() => setTab("day")} icon={<Sun className="w-4 h-4" />}>Day camp</TabBtn>
      </div>

      <div>{tab === "registrations" ? <CampRegistrationsTab /> : <DayCampView />}</div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 -mb-px border-b-2 transition-colors ${active ? "border-[#1a2d5a] text-[#1a2d5a]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
      {icon}{children}
    </button>
  );
}
