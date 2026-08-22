import { ExternalLink } from "lucide-react";

/**
 * Front Desk Playbook, the staff-facing "where do I look" guide for the new
 * CRM structure. The content is a self-contained HTML page at
 * client/public/playbook.html (theme-aware, TMA-branded), embedded here so staff
 * reach it inside the dashboard. Update that file to change the guide.
 */
export default function PlaybookView() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          A quick reference for where every lead, family, order, and form lives. Share it with new front-desk staff.
        </p>
        <a
          href="/playbook.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1a2d5a] hover:text-[#c41e3a]"
        >
          <ExternalLink className="w-4 h-4" /> Open full page
        </a>
      </div>
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
        <iframe
          src="/playbook.html"
          title="TMA Front Desk Playbook"
          className="w-full"
          style={{ height: "calc(100vh - 180px)", border: "none" }}
        />
      </div>
    </div>
  );
}
