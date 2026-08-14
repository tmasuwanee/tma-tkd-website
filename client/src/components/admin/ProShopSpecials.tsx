import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Tag, Plus, X, Link2, Printer, Pencil, Eye, EyeOff, Copy } from "lucide-react";

/**
 * Pro Shop specials — staff-managed promotions (Back to School, gear bundle,
 * bring-a-friend, seasonal camp). Each is informational: it carries a shareable
 * signup link (an existing pay page or external URL) and a printable flyer. The
 * actual charge still runs on the linked page, so no card/PII lives here.
 */

type Special = {
  id: number; title: string; description: string | null; priceLabel: string | null;
  linkUrl: string | null; badge: string | null; active: number; sortOrder: number;
  createdAt: string | Date; updatedAt: string | Date | null;
};

const absUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `${window.location.origin}${u.startsWith("/") ? "" : "/"}${u}`);

function printFlyer(s: Special) {
  const link = s.linkUrl ? absUrl(s.linkUrl) : "";
  const w = window.open("", "_blank", "width=800,height=1000");
  if (!w) { toast.error("Popup blocked. Allow popups to print."); return; }
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.title)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;color:#101828}
      .sheet{max-width:680px;margin:0 auto;padding:56px 48px;text-align:center}
      .brand{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#1a2d5a;font-weight:700}
      .badge{display:inline-block;margin:24px 0 8px;background:#c41e3a;color:#fff;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:6px 14px;border-radius:999px}
      h1{font-size:44px;line-height:1.05;margin:12px 0 8px;color:#1a2d5a}
      .price{font-size:34px;font-weight:800;color:#c41e3a;margin:8px 0 20px}
      .desc{font-size:18px;line-height:1.6;color:#344054;white-space:pre-wrap;margin:0 auto 28px;max-width:520px}
      .link{font-size:16px;color:#1a2d5a;word-break:break-all;border-top:1px solid #e4e7ec;padding-top:20px;margin-top:20px}
      .link b{display:block;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#98a2b3;margin-bottom:6px}
      .foot{margin-top:36px;font-size:13px;color:#98a2b3}
    </style></head><body onload="window.print()">
    <div class="sheet">
      <div class="brand">Top Martial Arts &middot; Suwanee</div>
      ${s.badge ? `<div class="badge">${esc(s.badge)}</div>` : ""}
      <h1>${esc(s.title)}</h1>
      ${s.priceLabel ? `<div class="price">${esc(s.priceLabel)}</div>` : ""}
      ${s.description ? `<div class="desc">${esc(s.description)}</div>` : ""}
      ${link ? `<div class="link"><b>Sign up</b>${esc(link)}</div>` : ""}
      <div class="foot">Ask the front desk to get started.</div>
    </div></body></html>`);
  w.document.close();
}

export default function ProShopSpecials() {
  const list = trpc.specials.list.useQuery();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<Special | "new" | null>(null);

  const setActive = trpc.specials.setActive.useMutation({
    onSuccess: () => { utils.specials.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const rows = (list.data ?? []) as Special[];

  const copyLink = (s: Special) => {
    if (!s.linkUrl) { toast.error("No link on this special."); return; }
    navigator.clipboard.writeText(absUrl(s.linkUrl)).then(() => toast.success("Link copied."), () => toast.error("Could not copy."));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-[#c41e3a]/10 flex items-center justify-center shrink-0"><Tag className="w-4.5 h-4.5 text-[#c41e3a]" /></div>
          <div>
            <h2 className="text-lg font-bold text-[#1a2d5a]">Specials</h2>
            <p className="text-xs text-gray-500">Promotions with a share link and a printable flyer.</p>
          </div>
        </div>
        <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#1a2d5a] hover:bg-[#142347] rounded-lg px-3 py-2"><Plus className="w-4 h-4" /> New special</button>
      </div>

      {list.isLoading ? (
        <div className="text-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center text-sm text-gray-400">No specials yet. Click "New special" to add one (e.g. Back to School, gear bundle, bring-a-friend).</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(s => (
            <div key={s.id} className={`bg-white border rounded-xl p-4 flex flex-col ${s.active ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
              <div className="flex items-start gap-2">
                {s.badge ? <span className="text-[10px] uppercase tracking-wide font-bold text-white bg-[#c41e3a] rounded px-1.5 py-0.5 shrink-0">{s.badge}</span> : null}
                {!s.active ? <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 shrink-0">Inactive</span> : null}
              </div>
              <div className="font-bold text-gray-900 mt-1.5">{s.title}</div>
              {s.priceLabel ? <div className="text-[#c41e3a] font-bold">{s.priceLabel}</div> : null}
              {s.description ? <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap line-clamp-4">{s.description}</div> : null}
              {s.linkUrl ? <div className="text-[11px] text-gray-400 mt-2 truncate">{s.linkUrl}</div> : null}
              <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
                {s.linkUrl ? <IconBtn onClick={() => copyLink(s)} icon={<Copy className="w-3.5 h-3.5" />} label="Copy link" /> : null}
                {s.linkUrl ? <a href={absUrl(s.linkUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 hover:border-[#1a2d5a]/40 rounded px-2 py-1"><Link2 className="w-3.5 h-3.5" /> Open</a> : null}
                <IconBtn onClick={() => printFlyer(s)} icon={<Printer className="w-3.5 h-3.5" />} label="Print" />
                <IconBtn onClick={() => setEditing(s)} icon={<Pencil className="w-3.5 h-3.5" />} label="Edit" />
                <IconBtn onClick={() => setActive.mutate({ id: s.id, active: !s.active })} icon={s.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} label={s.active ? "Hide" : "Show"} />
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && <SpecialForm special={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { utils.specials.list.invalidate(); setEditing(null); }} />}
    </div>
  );
}

function IconBtn({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 hover:border-[#1a2d5a]/40 rounded px-2 py-1">{icon}{label}</button>;
}

function SpecialForm({ special, onClose, onSaved }: { special: Special | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(special?.title ?? "");
  const [badge, setBadge] = useState(special?.badge ?? "");
  const [priceLabel, setPriceLabel] = useState(special?.priceLabel ?? "");
  const [description, setDescription] = useState(special?.description ?? "");
  const [linkUrl, setLinkUrl] = useState(special?.linkUrl ?? "");
  const create = trpc.specials.create.useMutation({ onSuccess: () => { toast.success("Special created."); onSaved(); }, onError: (e) => toast.error(e.message) });
  const update = trpc.specials.update.useMutation({ onSuccess: () => { toast.success("Special updated."); onSaved(); }, onError: (e) => toast.error(e.message) });

  const submit = () => {
    if (!title.trim()) { toast.error("Title required."); return; }
    const payload = {
      title: title.trim(),
      badge: badge.trim() || undefined,
      priceLabel: priceLabel.trim() || undefined,
      description: description.trim() || undefined,
      linkUrl: linkUrl.trim() || undefined,
    };
    if (special) update.mutate({ id: special.id, ...payload, badge: badge.trim() || null, priceLabel: priceLabel.trim() || null, description: description.trim() || null, linkUrl: linkUrl.trim() || null });
    else create.mutate(payload);
  };
  const busy = create.isPending || update.isPending;
  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4 bg-black/40 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-200" onClick={e => e.stopPropagation()}>
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100">
          <div className="font-bold text-[#1a2d5a] text-sm">{special ? "Edit special" : "New special"}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <input className={inp} placeholder="Title * (e.g. Back to School Special)" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} placeholder="Badge (e.g. LIMITED)" value={badge} onChange={e => setBadge(e.target.value)} maxLength={40} />
            <input className={inp} placeholder="Price (e.g. $49)" value={priceLabel} onChange={e => setPriceLabel(e.target.value)} maxLength={80} />
          </div>
          <textarea className={inp} rows={3} placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
          <input className={inp} placeholder="Sign-up link (e.g. /back-to-school or https://...)" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
          <button onClick={submit} disabled={busy} className="w-full bg-[#1a2d5a] hover:bg-[#142347] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">{busy ? "Saving..." : special ? "Save changes" : "Create special"}</button>
        </div>
      </div>
    </div>
  );
}
