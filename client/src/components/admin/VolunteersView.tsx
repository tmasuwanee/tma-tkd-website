import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Leaf, ExternalLink, Trash2 } from "lucide-react";

/** Fall Fest volunteer sign-ups (the public /fall-fest-volunteer page). Stored
 *  outside the leads pipeline in fallFestVolunteers. Read-only list plus a
 *  delete for duplicates / test rows. */
export default function VolunteersView() {
  const list = trpc.fallFest.listVolunteers.useQuery();
  const rows = list.data ?? [];
  const del = trpc.fallFest.deleteVolunteer.useMutation({
    onSuccess: () => { toast.success("Removed."); list.refetch(); },
    onError: () => toast.error("Could not remove that row."),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0"><Leaf className="w-5 h-5 text-amber-600" /></div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a2d5a]">Fall Fest Volunteers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Parents who signed up to help on Sept 19. {rows.length > 0 ? `${rows.length} signed up.` : ""}
          </p>
        </div>
        <a href="/fall-fest-volunteer" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a2d5a] border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-[#1a2d5a]/40"><ExternalLink className="w-3.5 h-3.5" /> Signup page</a>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {list.isLoading ? (
          <div className="text-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No volunteer sign-ups yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Contact</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Helping with</th>
                <th className="px-4 py-3 font-semibold text-gray-600">When</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Donating</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Date</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      {r.note ? <div className="text-xs text-gray-400 max-w-[220px]">{r.note}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{r.phone}</div>
                      {r.email ? <div className="text-xs text-gray-400">{r.email}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[220px]">{r.roles || <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px]">{r.availability || <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px]">{r.donations || <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(r.createdAt as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { if (confirm(`Remove ${r.name} from the volunteer list?`)) del.mutate({ id: r.id }); }}
                        className="text-gray-300 hover:text-[#c41e3a] transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
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
