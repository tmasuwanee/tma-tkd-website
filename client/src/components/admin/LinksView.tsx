import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, ExternalLink, QrCode, Link2 } from "lucide-react";

// Canonical share base. Links are shared with customers, who must hit
// production, so we always build tmatkd.com URLs regardless of where the
// dashboard itself is being viewed from.
const BASE = "https://tmatkd.com";

type LinkItem = {
  label: string;
  path: string;
  desc: string;
  staffOnly?: boolean;
};

type LinkGroup = { group: string; items: LinkItem[] };

const LINK_GROUPS: LinkGroup[] = [
  {
    group: "Sign-ups & Sales",
    items: [
      { label: "Free Class", path: "/free-class", desc: "Book a free intro class. Feeds the leads pipeline." },
      { label: "Open House RSVP (Aug 29)", path: "/open-house", desc: "Back-to-School bring-a-friend open house. RSVPs become leads tagged open_house_2026. Referral link: /open-house?ref=MemberName" },
      { label: "$49 Back to School (2 weeks)", path: "/back-to-school", desc: "Pick a program, pay $49 online for two weeks." },
      { label: "Christmas in July Sale", path: "/christmas-in-july", desc: "Pro shop + bulk tuition + bundle order form." },
      { label: "Afterschool Tour Request", path: "/afterschooltour", desc: "Parents request a tour; staff calls to confirm." },
      { label: "Afterschool Registration", path: "/afterschool-register", desc: "Paid afterschool enrollment (registration, uniform, supply fees)." },
      { label: "Summer Camp Registration", path: "/camp-registration", desc: "Paid summer camp signup." },
      { label: "Camp Field Trip Payment", path: "/field-trip", desc: "Self-serve $25/field-trip payment. Sends a confirmation email." },
      { label: "After-School Supply Fee ($65)", path: "/supply-fee", desc: "Private link for families who skipped the $65 annual supply fee. Prefill: /supply-fee?name=..&email=..&student=.." },
    ],
  },
  {
    group: "Waivers & In-Studio",
    items: [
      { label: "Guest / Walk-in Waiver", path: "/enroll", desc: "Liability waiver + sign-up. Alias: /waiver." },
      { label: "After-School Transportation Form", path: "/transportation", desc: "GCPS transportation authorization. Parent signs; a filled PDF is emailed + stored." },
      { label: "After-School Waiver (sign only)", path: "/afterschool-waiver", desc: "Just the after-school waiver + policies, no registration questions. Parent signs; stored under Waivers. Prefill: /afterschool-waiver?student=.." },
      { label: "Walk-in Self Sign-up", path: "/walkin", desc: "Walk-in picks a trial class and signs on their own phone." },
      { label: "Walk-in QR Display (staff)", path: "/walkin-qr", desc: "Full-screen QR to hand a walk-in on a tablet.", staffOnly: true },
      { label: "Attendance Kiosk", path: "/attendance", desc: "In-studio attendance check-in kiosk.", staffOnly: true },
    ],
  },
  {
    group: "Program Pages",
    items: [
      { label: "Class Schedule", path: "/schedule", desc: "Current weekly class schedule image. QR-friendly." },
      { label: "Taekwondo", path: "/taekwondo", desc: "Taekwondo program page." },
      { label: "Kickboxing", path: "/kickboxing", desc: "Kickboxing program page." },
      { label: "Brazilian Jiu-Jitsu", path: "/bjj", desc: "BJJ program page." },
      { label: "Afterschool", path: "/afterschool", desc: "Afterschool program overview page." },
    ],
  },
];

function qrSrc(url: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=${encodeURIComponent(url)}`;
}

function LinkRow({ item }: { item: LinkItem }) {
  const url = `${BASE}${item.path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Long-press the URL to copy manually.");
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 border border-gray-200 rounded-lg bg-white hover:border-[#1a2d5a]/40 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-[#1a2d5a] text-sm">{item.label}</p>
          {item.staffOnly && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">STAFF</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
        <p className="text-xs font-mono text-gray-400 mt-1 truncate">{url}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={copy}>
          <Copy className="w-3.5 h-3.5 mr-1" /> Copy
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => window.open(qrSrc(url), "_blank", "noopener,noreferrer")}
          title="Open a printable QR code for this link"
        >
          <QrCode className="w-3.5 h-3.5 mr-1" /> QR
        </Button>
      </div>
    </div>
  );
}

export default function LinksView() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1a2d5a] flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1a2d5a]">Links</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every shareable page in one place. Copy a link to text or email a prospect, open it to
            preview, or pull a QR code to print or show on a tablet.
          </p>
        </div>
      </div>

      {LINK_GROUPS.map(g => (
        <div key={g.group}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2.5">{g.group}</h2>
          <div className="space-y-2.5">
            {g.items.map(item => (
              <LinkRow key={item.path} item={item} />
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">$99 3-week trial</p>
        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
          The $99 trial is staff-initiated: open the Students tab, use Add Trial Student, and it
          generates a one-time payment link for that family. There is no public signup page for it
          yet. If you want a shareable $99 landing page like the $49 Back to School one, ask and it
          can be built.
        </p>
      </div>
    </div>
  );
}
