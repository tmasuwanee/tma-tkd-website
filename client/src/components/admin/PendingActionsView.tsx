import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, ShieldCheck, Clock } from "lucide-react";

/**
 * Pending Actions — the human confirm step of the write-action flow. Actions
 * (e.g. an email the assistant drafts) show up here as "proposed" and do NOTHING
 * until a staff member reviews the preview and clicks Confirm (which executes it
 * once) or Reject. See server/action-flow.ts.
 */

const STATUS_STYLE: Record<string, string> = {
  executed: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-gray-100 text-gray-600 border-gray-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  proposed: "bg-amber-100 text-amber-800 border-amber-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function PendingActionsView() {
  const utils = trpc.useUtils();
  const pending = trpc.actions.listPending.useQuery();
  const recent = trpc.actions.listRecent.useQuery();

  const refresh = () => { utils.actions.listPending.invalidate(); utils.actions.listRecent.invalidate(); };
  const confirm = trpc.actions.confirm.useMutation({
    onSuccess: () => { toast.success("Action confirmed and executed."); refresh(); },
    onError: (e) => toast.error(e.message ?? "Could not confirm."),
  });
  const reject = trpc.actions.reject.useMutation({
    onSuccess: () => { toast.success("Action rejected."); refresh(); },
    onError: (e) => toast.error(e.message ?? "Could not reject."),
  });

  const items = pending.data ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1a2d5a]">Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Actions waiting for your OK (e.g. a drafted email). Nothing happens until you confirm.
          </p>
        </div>
      </div>

      {/* Pending */}
      {pending.isLoading ? (
        <div className="text-center py-12 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl">Nothing waiting for approval.</div>
      ) : (
        <div className="space-y-3">
          {items.map(a => (
            <div key={a.id} className="bg-white border border-amber-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 text-sm truncate">{a.title}</div>
                  <div className="text-[11px] text-gray-400">Proposed by {a.proposedBy || "?"} · {new Date(a.createdAt as string).toLocaleString()}</div>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">{a.actionType.replace(/_/g, " ")}</span>
              </div>
              {a.preview ? (
                <pre className="px-4 py-3 text-xs text-gray-700 whitespace-pre-wrap font-sans max-h-56 overflow-y-auto bg-gray-50/60">{a.preview}</pre>
              ) : null}
              <div className="px-4 py-3 flex items-center gap-2 border-t border-gray-100">
                <button onClick={() => confirm.mutate({ id: a.id })} disabled={confirm.isPending || reject.isPending}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#1a2d5a] hover:bg-[#142347] rounded-lg px-3 py-1.5 disabled:opacity-50">
                  <CheckCircle2 className="w-4 h-4" /> Confirm & run
                </button>
                <button onClick={() => reject.mutate({ id: a.id })} disabled={confirm.isPending || reject.isPending}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-200 hover:border-red-200 hover:text-red-600 rounded-lg px-3 py-1.5 disabled:opacity-50">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent history */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Recent</h2>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {(recent.data ?? []).filter(a => a.status !== "proposed").length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400">No history yet.</div>
          ) : (
            (recent.data ?? []).filter(a => a.status !== "proposed").map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={`shrink-0 text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 font-medium ${STATUS_STYLE[a.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>{a.status}</span>
                <div className="min-w-0 flex-1 truncate text-gray-800">{a.title}</div>
                <div className="text-[11px] text-gray-400 whitespace-nowrap">{a.executedAt ? new Date(a.executedAt as string).toLocaleDateString() : ""}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
