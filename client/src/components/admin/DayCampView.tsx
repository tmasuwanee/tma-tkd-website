import { trpc } from "@/lib/trpc";
import { Loader2, Sun, ExternalLink, Printer } from "lucide-react";

/** Day-camp signups ($60/day). Online signups land here; the printable office
 *  sheet is at /day-camp-sheet. */
export default function DayCampView() {
  const list = trpc.dayCamp.list.useQuery();
  const rows = list.data ?? [];
  const parseDates = (s: string) => { try { return (JSON.parse(s) as string[]).join(", "); } catch { return s; } };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0"><Sun className="w-5 h-5 text-amber-600" /></div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a2d5a]">Day Camp</h1>
          <p className="text-sm text-gray-500 mt-0.5">$60/day signups. Share the online link, or print the office sheet.</p>
        </div>
        <div className="flex gap-2">
          <a href="/day-camp" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a2d5a] border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-[#1a2d5a]/40"><ExternalLink className="w-3.5 h-3.5" /> Signup page</a>
          <a href="/day-camp-sheet" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a2d5a] border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-[#1a2d5a]/40"><Printer className="w-3.5 h-3.5" /> Print sheet</a>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {list.isLoading ? (
          <div className="text-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No day-camp signups yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-semibold text-gray-600">Child</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Parent</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Day(s)</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Amount</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Date</th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                    <td className="px-4 py-3"><div className="font-medium text-gray-900">{r.childName}</div></td>
                    <td className="px-4 py-3 text-gray-700">{r.parentName}{r.phone ? <div className="text-xs text-gray-400">{r.phone}</div> : null}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[220px]">{parseDates(r.dates)} <span className="text-gray-400">({r.dayCount})</span></td>
                    <td className="px-4 py-3 tabular-nums">${(r.amountCents / 100).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] rounded-full border px-2 py-0.5 font-medium ${r.stripePaymentStatus === "succeeded" ? "bg-green-100 text-green-800 border-green-200" : r.stripePaymentStatus === "unpaid" ? "bg-gray-100 text-gray-600 border-gray-200" : "bg-yellow-100 text-yellow-800 border-yellow-200"}`}>
                        {r.stripePaymentStatus === "succeeded" ? "Paid" : r.stripePaymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(r.createdAt as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
