import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileText, Search, Plus, Trash2, Loader2, Download } from "lucide-react";

/**
 * Invoice Generator. Search a customer's TMA Stripe payments (auto line items),
 * then edit / add rows for payments made another way (ZenPlanner, cash, etc.),
 * and generate the branded PDF. Same format as the standard TMA invoice.
 */

type Row = { date: string; description: string; ref: string; amount: string }; // amount = dollars string

const todayHuman = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const defaultInvoiceNo = `TMA-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`;

function downloadBase64Pdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

export default function InvoicesView() {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [billTo, setBillTo] = useState("");
  const [email, setEmail] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [invoiceNo, setInvoiceNo] = useState(defaultInvoiceNo);
  const [invoiceDate, setInvoiceDate] = useState(todayHuman);
  const [rows, setRows] = useState<Row[]>([]);
  const generate = trpc.invoices.generate.useMutation();

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  async function pull() {
    if (query.trim().length < 2) { toast.error("Enter a name or email to search."); return; }
    setSearching(true);
    try {
      const res = await utils.invoices.searchPayments.fetch({ query: query.trim() });
      if (res.items.length === 0) {
        toast.message("No Stripe payments found for that search. You can still add line items manually.");
      } else {
        setRows(res.items.map(i => ({ date: i.date, description: i.description, ref: i.ref ?? "Card", amount: (i.amountCents / 100).toFixed(2) })));
        if (res.suggestedBillTo) setBillTo(res.suggestedBillTo);
        if (res.suggestedEmail) setEmail(res.suggestedEmail);
        toast.success(`Pulled ${res.items.length} payment${res.items.length > 1 ? "s" : ""} from Stripe.`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not search payments.");
    } finally {
      setSearching(false);
    }
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows(prev => prev.map((r, j) => j === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(prev => [...prev, { date: "", description: "", ref: "", amount: "" }]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, j) => j !== i));

  async function makePdf() {
    if (!billTo.trim()) { toast.error("Enter who the invoice is for (Bill To)."); return; }
    const items = rows
      .filter(r => r.description.trim() && r.amount.trim())
      .map(r => ({ date: r.date.trim(), description: r.description.trim(), ref: r.ref.trim() || undefined, amountCents: Math.round((parseFloat(r.amount) || 0) * 100) }));
    if (items.length === 0) { toast.error("Add at least one line item with a description and amount."); return; }
    try {
      const res = await generate.mutateAsync({
        billTo: billTo.trim(),
        subtitle: subtitle.trim() || undefined,
        invoiceNo: invoiceNo.trim() || undefined,
        invoiceDate: invoiceDate.trim() || undefined,
        items,
      });
      downloadBase64Pdf(res.base64, res.filename);
      toast.success("Invoice PDF downloaded.");
    } catch (e: any) {
      toast.error(e.message ?? "Could not generate the invoice.");
    }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1a2d5a]/10 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-[#1a2d5a]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1a2d5a]">Invoice Generator</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Search a customer's card payments, add anything they paid another way, and generate the TMA invoice PDF.
          </p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <label className="text-sm font-semibold text-gray-700">1. Pull payments from Stripe</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Customer name or email (e.g. Osukoya)"
                className="pl-9" onKeyDown={e => { if (e.key === "Enter") pull(); }} />
            </div>
            <Button onClick={pull} disabled={searching} className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Pull payments</>}
            </Button>
          </div>
          <p className="text-xs text-gray-400">Searches card payments only. Payments made in ZenPlanner or cash: add them as line items below.</p>
        </CardContent>
      </Card>

      {/* Details + items */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <label className="text-sm font-semibold text-gray-700">2. Invoice details</label>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Bill to</p>
              <Input value={billTo} onChange={e => setBillTo(e.target.value)} placeholder="Customer full name" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Subtitle (optional)</p>
              <Input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="e.g. Summer Camp 2026" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Invoice #</p>
              <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Date</p>
              <Input value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
          </div>
          {email && <p className="text-xs text-gray-400">Email on file: <span className="font-mono">{email}</span></p>}

          {/* Line items */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">3. Line items</p>
              <Button size="sm" variant="outline" onClick={addRow} className="h-8 text-xs"><Plus className="w-3.5 h-3.5 mr-1" /> Add line</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="font-semibold pb-1.5 pr-2 w-[130px]">Date</th>
                    <th className="font-semibold pb-1.5 pr-2">Description</th>
                    <th className="font-semibold pb-1.5 pr-2 w-[110px]">Ref</th>
                    <th className="font-semibold pb-1.5 pr-2 w-[110px] text-right">Amount</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-gray-400 py-6 text-xs">No line items yet. Pull from Stripe above, or click "Add line."</td></tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="pr-2 py-1"><Input value={r.date} onChange={e => setRow(i, { date: e.target.value })} placeholder="Jul 3, 2026" className="h-8 text-xs" /></td>
                      <td className="pr-2 py-1"><Input value={r.description} onChange={e => setRow(i, { description: e.target.value })} placeholder="Summer Camp - Week 7" className="h-8 text-xs" /></td>
                      <td className="pr-2 py-1"><Input value={r.ref} onChange={e => setRow(i, { ref: e.target.value })} placeholder="Card / #30999" className="h-8 text-xs" /></td>
                      <td className="pr-2 py-1">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                          <Input value={r.amount} onChange={e => setRow(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0.00" className="h-8 text-xs pl-5 text-right" inputMode="decimal" />
                        </div>
                      </td>
                      <td className="py-1 text-right">
                        <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-500" title="Remove"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-gray-100">
              <span className="text-sm text-gray-500">Master total</span>
              <span className="text-xl font-bold text-[#1a2d5a] tabular-nums">${total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={makePdf} disabled={generate.isPending} className="bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white">
              {generate.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</> : <><Download className="w-4 h-4 mr-2" /> Generate invoice PDF</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
