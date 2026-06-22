import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

/**
 * Standalone field-trip payment page. A camp family opens a link like
 *   /field-trip?name=Brian%20Ford&email=bford08@gmail.com&detail=...&slots=3
 * and pays the $25-per-slot field-trip fee. The amount is recomputed server-side
 * from `slots` (see fieldTrip.createIntent), so the URL cannot set the price.
 */
const stripePromise = loadStripe(import.meta.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY);
const FIELD_TRIP_CENTS = 2500;

function PaymentForm({ paymentIntentId, total, onSuccess }: { paymentIntentId: string; total: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const confirm = trpc.fieldTrip.confirm.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/field-trip` },
      redirect: "if_required",
    });
    if (error) {
      toast.error(error.message ?? "Payment failed. Please try again.");
      setIsProcessing(false);
    } else {
      try { await confirm.mutateAsync({ paymentIntentId }); } catch (err) { console.error(err); }
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold"
      >
        {isProcessing ? "Processing..." : `Pay ${total}`}
      </Button>
    </form>
  );
}

export default function FieldTripPay() {
  const sp = new URLSearchParams(window.location.search);
  const payerName = sp.get("name") ?? "";
  const email = sp.get("email") ?? "";
  const detail = sp.get("detail") ?? "Summer camp field trip";
  const slots = Math.max(1, Math.min(50, parseInt(sp.get("slots") ?? "1", 10) || 1));
  const total = `$${((slots * FIELD_TRIP_CENTS) / 100).toFixed(2)}`;

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [failed, setFailed] = useState(false);
  const initRef = useRef(false);

  const createIntent = trpc.fieldTrip.createIntent.useMutation();

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    createIntent.mutate(
      { payerName: payerName || "Camp family", email: email || undefined, detail, slots },
      {
        onSuccess: (r) => {
          setClientSecret(r.clientSecret ?? null);
          setPaymentIntentId(r.paymentIntentId);
        },
        onError: () => { setFailed(true); toast.error("Could not start checkout. Please refresh or contact the school."); },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-[#1a2d5a]">Top Martial Arts Suwanee</h1>
          <p className="text-sm font-semibold text-[#c41e3a] tracking-wide uppercase mt-1">Summer Camp Field Trip</p>
        </div>

        <Card className="bg-white shadow-xl border border-gray-200">
          {paid ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-[#1a2d5a] mb-2">Payment received</h2>
              <p className="text-gray-600 text-sm">
                Thank you{payerName ? `, ${payerName}` : ""}. Your {total} field-trip payment is confirmed.
                A receipt has been emailed by Stripe.
              </p>
            </div>
          ) : (
            <div className="p-6 sm:p-8">
              <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 p-4">
                {payerName && <p className="text-sm text-gray-500">Paying as</p>}
                {payerName && <p className="font-semibold text-[#1a2d5a] mb-2">{payerName}</p>}
                <p className="text-sm text-gray-700">{detail}</p>
                <div className="flex justify-between items-baseline mt-3 pt-3 border-t border-gray-200">
                  <span className="text-sm text-gray-600">$25 &times; {slots}</span>
                  <span className="text-2xl font-extrabold text-[#1a2d5a]">{total}</span>
                </div>
              </div>

              {failed ? (
                <p className="text-center text-sm text-red-600 py-6">
                  Could not start checkout. Please refresh the page, or contact the school.
                </p>
              ) : clientSecret && paymentIntentId ? (
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
                  <PaymentForm paymentIntentId={paymentIntentId} total={total} onSuccess={() => setPaid(true)} />
                </Elements>
              ) : (
                <div className="flex items-center justify-center py-10 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading secure checkout&hellip;
                </div>
              )}
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-gray-400 mt-4">Secured by Stripe. Top Martial Arts Suwanee.</p>
      </div>
    </div>
  );
}
