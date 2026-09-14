import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { formatCents } from "../../../shared/bakeSaleProducts";

/**
 * Bake-sale confirmation screen (/bake-sale/success?session_id=...).
 *
 * The URL proves nothing, so this page displays nothing until the server has
 * retrieved the Checkout Session from Stripe and confirmed payment_status is
 * "paid". The three states are deliberately impossible to confuse at a glance
 * from across a table: checking is gray, paid is a full green screen, not
 * verified is a full red screen.
 *
 * Whoever is working the table reads the green screen and the order number,
 * then hands over the items.
 */
export default function BakeSaleSuccess() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id") ?? "";

  const verify = trpc.bakeSale.verifySession.useQuery(
    { sessionId },
    { enabled: sessionId.length > 0, retry: 1 },
  );

  // Payment is done, so the saved cart must not follow them to the next scan.
  useEffect(() => {
    if (verify.data?.paid) {
      try { sessionStorage.removeItem("tma_bake_sale_cart"); } catch { /* private mode */ }
    }
  }, [verify.data?.paid]);

  // ── Checking ──────────────────────────────────────────────────────────────
  if (!sessionId || verify.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-gray-400" />
          <p className="mt-4 text-lg font-medium text-gray-600">Checking your payment</p>
          <p className="mt-1 text-sm text-gray-500">Do not close this screen.</p>
        </div>
      </div>
    );
  }

  // ── Not verified ──────────────────────────────────────────────────────────
  if (verify.isError || !verify.data?.paid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#7f1d1d] p-6">
        <Card className="w-full max-w-md border-0 bg-white p-8 text-center">
          <XCircle className="mx-auto h-16 w-16 text-[#c41e3a]" />
          <h1 className="mt-4 text-2xl font-extrabold text-[#c41e3a]">Payment not verified</h1>
          <p className="mt-3 text-base text-gray-700">Please ask for assistance at the table.</p>
          <p className="mt-4 text-sm text-gray-500">
            Do not hand over any items for this screen. Nothing may have been charged.
          </p>
          <a href="/bake-sale" className="mt-6 inline-block text-sm font-semibold text-[#1a2d5a] underline">
            Back to the menu
          </a>
        </Card>
      </div>
    );
  }

  // ── Paid ──────────────────────────────────────────────────────────────────
  const d = verify.data;
  const paidAt = new Date(d.paidAt);

  return (
    <div className="min-h-screen bg-[#15803d] px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white">
            <CheckCircle2 className="h-16 w-16 text-[#15803d]" />
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white">PAYMENT SUCCESSFUL</h1>
          <p className="mt-2 text-lg font-semibold text-white/90">Please show this screen at the table.</p>
        </div>

        <Card className="border-0 bg-white p-6">
          <div className="border-b border-gray-200 pb-4 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-gray-500">Total paid</p>
            <p className="text-5xl font-extrabold text-[#15803d]">{formatCents(d.amountTotal)}</p>
          </div>

          <div className="flex items-baseline justify-between border-b border-gray-200 py-4">
            <span className="text-sm text-gray-500">Order number</span>
            <span className="font-mono text-2xl font-extrabold tracking-widest text-[#1a2d5a]">{d.orderId}</span>
          </div>

          <ul className="divide-y divide-gray-100 py-2">
            {d.items.map((item, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-base text-gray-800">
                  <span className="font-bold text-[#1a2d5a]">{item.quantity}&times;</span> {item.name}
                </span>
                <span className="shrink-0 text-base font-semibold text-gray-700">{formatCents(item.amount)}</span>
              </li>
            ))}
          </ul>

          <p className="border-t border-gray-200 pt-4 text-center text-sm text-gray-500">
            Paid {paidAt.toLocaleString(undefined, {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            })}
          </p>
        </Card>

        <p className="mt-5 text-center text-sm text-white/80">
          Thank you for supporting {d.eventName}.
        </p>
      </div>
    </div>
  );
}
