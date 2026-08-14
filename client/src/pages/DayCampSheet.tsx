/**
 * Printable blank day-camp sign-up sheet for the office (paper signups).
 * /day-camp-sheet — click Print, or Ctrl/Cmd-P.
 */
export default function DayCampSheet() {
  const rows = Array.from({ length: 16 });
  return (
    <div className="min-h-screen bg-white p-8 max-w-3xl mx-auto text-[#1a2233] print:p-2">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-extrabold text-[#1a2d5a]">TMA Day Camp — Sign-Up Sheet</h1>
        <button onClick={() => window.print()} className="print:hidden text-sm font-semibold text-white bg-[#1a2d5a] rounded-lg px-3 py-2">Print</button>
      </div>
      <p className="text-sm text-gray-600 mb-1">Morning care · <strong>$60 per day</strong>. Also sign up online at <strong>tmatkd.com/day-camp</strong>.</p>
      <p className="text-sm mb-4">Camp date(s): <span className="inline-block border-b border-gray-400 min-w-[240px]">&nbsp;</span></p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-400 text-left">
            <th className="py-2 pr-2 w-6">#</th>
            <th className="py-2 pr-2">Child's name</th>
            <th className="py-2 pr-2">Parent name</th>
            <th className="py-2 pr-2">Phone</th>
            <th className="py-2 pr-2 w-24">Day(s)</th>
            <th className="py-2 pr-2 w-24">Paid (cash/card)</th>
            <th className="py-2 w-16">Staff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((_, i) => (
            <tr key={i} className="border-b border-gray-300" style={{ height: "2.2rem" }}>
              <td className="py-1 pr-2 text-gray-400">{i + 1}</td>
              <td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-4 print:mt-2">Top Martial Arts Suwanee · (770) 277-3009</p>
    </div>
  );
}
