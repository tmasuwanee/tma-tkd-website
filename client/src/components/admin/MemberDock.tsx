import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { X, Minus, ChevronUp, CreditCard } from "lucide-react";
import { MemberPanelBody } from "@/components/admin/MembershipsView";

/**
 * MemberDock — Gmail-compose-style docked member panels. Clicking a member (in the
 * Members list, or via the assistant) opens their command center as a panel pinned
 * bottom-right. Multiple stay open at once, stacked left as more open, each
 * minimizable to its title bar. This is the standing dashboard pattern
 * (feedback_dashboard_expandable_rows): docked + multi-open, NOT a blocking modal.
 *
 * Wrap the admin content in <MemberDockProvider>; call useMemberDock().open(id, name)
 * from anywhere inside it.
 */

type Panel = { id: number; name: string; minimized: boolean };
type Ctx = { open: (membershipId: number, name?: string) => void; close: (membershipId: number) => void; openIds: number[] };

const MemberDockCtx = createContext<Ctx | null>(null);
export function useMemberDock(): Ctx {
  const c = useContext(MemberDockCtx);
  if (!c) throw new Error("useMemberDock must be used inside <MemberDockProvider>");
  return c;
}

const MAX_OPEN = 4; // keep the corner uncluttered; opening a 5th drops the oldest

export function MemberDockProvider({ children }: { children: React.ReactNode }) {
  const [panels, setPanels] = useState<Panel[]>([]);
  const utils = trpc.useUtils();

  const open = useCallback((membershipId: number, name?: string) => {
    setPanels(prev => {
      const existing = prev.find(p => p.id === membershipId);
      if (existing) return prev.map(p => p.id === membershipId ? { ...p, minimized: false, name: name ?? p.name } : p);
      const next = [...prev, { id: membershipId, name: name ?? "Member", minimized: false }];
      return next.length > MAX_OPEN ? next.slice(next.length - MAX_OPEN) : next;
    });
  }, []);
  const close = useCallback((membershipId: number) => setPanels(prev => prev.filter(p => p.id !== membershipId)), []);
  const toggleMin = useCallback((membershipId: number) => setPanels(prev => prev.map(p => p.id === membershipId ? { ...p, minimized: !p.minimized } : p)), []);
  const setName = useCallback((membershipId: number, name: string) => setPanels(prev => prev.map(p => p.id === membershipId ? { ...p, name } : p)), []);
  const onChanged = useCallback(() => { utils.members.list.invalidate(); utils.members.overview.invalidate(); }, [utils]);
  const ctxValue = useMemo(() => ({ open, close, openIds: panels.map(p => p.id) }), [open, close, panels]);

  return (
    <MemberDockCtx.Provider value={ctxValue}>
      {children}
      {/* Outer layer positions the dock and stays click-through; the inner scroller
          owns overflow AND pointer events so off-screen panels remain reachable. */}
      <div className="fixed bottom-0 right-0 z-40 max-w-full pointer-events-none">
      <div className="flex items-end gap-3 p-3 max-w-full overflow-x-auto pointer-events-auto">
        {panels.map(p => (
          <div key={p.id} className="pointer-events-auto w-[370px] max-w-[92vw] bg-white rounded-t-xl shadow-2xl border border-gray-200 flex flex-col shrink-0" style={{ maxHeight: "82vh" }}>
            <div className="h-11 shrink-0 flex items-center gap-2 px-3 bg-[#1a2d5a] text-white rounded-t-xl cursor-pointer select-none" onClick={() => toggleMin(p.id)}>
              <CreditCard className="w-4 h-4 shrink-0 opacity-80" />
              <div className="text-sm font-semibold truncate flex-1">{p.name}</div>
              <button onClick={(e) => { e.stopPropagation(); toggleMin(p.id); }} className="opacity-80 hover:opacity-100" title={p.minimized ? "Expand" : "Minimize"}>
                {p.minimized ? <ChevronUp className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); close(p.id); }} className="opacity-80 hover:opacity-100" title="Close"><X className="w-4 h-4" /></button>
            </div>
            {!p.minimized && (
              <div className="overflow-y-auto p-3">
                <MemberPanelBody id={p.id} onChanged={onChanged} onName={(n) => setName(p.id, n)} />
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
    </MemberDockCtx.Provider>
  );
}
