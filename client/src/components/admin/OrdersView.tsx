import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShoppingBag, Phone, Mail, Receipt } from "lucide-react";

/**
 * Orders view — pro-shop and seasonal sale purchases (recordType 'order').
 * These are customers who bought something, NOT prospects to chase, so they get
 * their own home here instead of polluting the leads pipeline / call board.
 * Data comes from the leads table, filtered to recordType 'order'.
 */

type LeadRow = {
  id: number;
  parentName: string;
  kidName: string;
  programInterest: string;
  email: string;
  phone: string;
  additionalNotes: string | null;
  tags?: string[] | null;
  recordType?: string;
  createdAt: string | Date;
};

const ONE_OFF_LABEL: Record<string, string> = {
  afterschool_supply_fee: "Supply fee",
  camp_field_trip: "Field trip",
};

function orderKind(l: LeadRow): { label: string; cls: string } {
  const tags = l.tags ?? [];
  if (tags.includes("christmas_july_2026")) return { label: "Christmas in July", cls: "bg-red-100 text-red-800 border-red-200" };
  if (tags.includes("proshop_order")) return { label: "Pro Shop", cls: "bg-amber-100 text-amber-900 border-amber-300" };
  return { label: l.programInterest || "Order", cls: "bg-gray-100 text-gray-700 border-gray-200" };
}

// Pulls "$123.45" out of the order note if present, else null.
function amountFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/\$([0-9]+(?:\.[0-9]{2})?)/);
  return m ? `$${m[1]}` : null;
}

export default function OrdersView() {
  const { data, isLoading } = trpc.leads.getAll.useQuery();
  const oneOff = trpc.payments.listOneOff.useQuery();

  const orders = useMemo(
    () => ((data ?? []) as unknown as LeadRow[])
      .filter(l => (l.recordType ?? "prospect") === "order")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading orders...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1a2d5a]">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pro-shop and seasonal sale purchases. These are customers, not leads, so they stay out of the call list.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="text-center py-16 text-gray-400">No orders yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="font-semibold text-gray-600 px-4 py-3">Customer</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Type</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Order details</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Amount</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Contact</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const kind = orderKind(o);
                    const amt = amountFromNotes(o.additionalNotes);
                    return (
                      <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{o.parentName}</div>
                          {o.kidName && o.kidName !== o.parentName && (
                            <div className="text-xs text-gray-500">{o.kidName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full border font-medium ${kind.cls}`}>{kind.label}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[320px]">
                          <div className="whitespace-pre-wrap text-xs leading-relaxed">{o.additionalNotes || "—"}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums">{amt ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 text-xs">
                            {o.phone && <a href={`tel:${o.phone}`} className="inline-flex items-center gap-1 text-[#1a2d5a] hover:underline"><Phone className="w-3 h-3" />{o.phone}</a>}
                            {o.email && !o.email.endsWith("@no-email.tma") && <a href={`mailto:${o.email}`} className="inline-flex items-center gap-1 text-[#1a2d5a] hover:underline"><Mail className="w-3 h-3" />{o.email}</a>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* One-off payments (supply fee, field trip). Previously invisible: the only
          record was Stripe + a Telegram alert. Now reconcilable here. */}
      <div className="flex items-start gap-3 pt-2">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Receipt className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#1a2d5a]">One-off payments</h2>
          <p className="text-sm text-gray-500 mt-0.5">Supply fees and field-trip payments. Reconcile these against Stripe.</p>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {oneOff.isLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (oneOff.data ?? []).length === 0 ? (
            <div className="text-center py-12 text-gray-400">No one-off payments yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="font-semibold text-gray-600 px-4 py-3">Payer</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Type</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Details</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Amount</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Contact</th>
                    <th className="font-semibold text-gray-600 px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(oneOff.data ?? []).map(p => (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{p.payerName}</div>
                        {p.studentName && <div className="text-xs text-gray-500">{p.studentName}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full border font-medium bg-emerald-100 text-emerald-800 border-emerald-200">
                          {ONE_OFF_LABEL[p.product] ?? p.product}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[280px]">{p.detail || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums">${(p.amountCents / 100).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 text-xs text-[#1a2d5a] hover:underline"><Mail className="w-3 h-3" />{p.email}</a>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
