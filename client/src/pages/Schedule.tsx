import { Maximize2 } from "lucide-react";

// Standalone class-schedule page. A QR code (on flyers / the studio wall) links
// here so families always see the current schedule. Swap the image in
// client/public/schedule/august-2026.jpg to update it.
const SCHEDULE_IMG = "/schedule/august-2026.jpg";

export default function Schedule() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-[#1a2d5a] shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">TMA</span>
            </div>
            <div>
              <p className="text-white font-semibold leading-tight">Top Martial Arts Suwanee</p>
              <p className="text-white/60 text-xs">Class Schedule</p>
            </div>
          </div>
          <a
            href={SCHEDULE_IMG}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-white/90 text-sm font-medium border border-white/25 rounded-lg px-3 py-1.5 hover:bg-white/10"
          >
            <Maximize2 className="w-4 h-4" /> Full size
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 py-5">
        <p className="text-center text-sm text-gray-500 mb-3 sm:hidden">Tap the schedule to zoom, or open full size.</p>

        <a href={SCHEDULE_IMG} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={SCHEDULE_IMG}
            alt="Top Martial Arts Suwanee weekly class schedule"
            className="w-full h-auto rounded-lg shadow-md border border-gray-200 bg-white"
          />
        </a>

        <div className="mt-4 flex justify-center">
          <a
            href={SCHEDULE_IMG}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#c41e3a] hover:bg-[#a81830] text-white font-semibold px-5 py-3 rounded-xl"
          >
            <Maximize2 className="w-5 h-5" /> Open full-size schedule
          </a>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Top Martial Arts Suwanee &bull; 2005 Lawrenceville Suwanee Rd, Suwanee, GA 30024 &bull; (770) 277-3009
        </p>
      </main>
    </div>
  );
}
