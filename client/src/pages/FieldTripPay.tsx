import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Minus, Plus } from "lucide-react";

/**
 * Standalone camp field-trip payment page. Families self-serve: they enter
 * their info, choose how many field trips ($25 each), and pay. Staff can also
 * pre-fill via URL params (/field-trip?name=..&email=..&detail=..&slots=..),
 * which the form reads in as defaults.
 *
 * The amount is recomputed server-side from `slots` (fieldTrip.createIntent),
 * so the URL cannot set the price. On success the server sends a branded
 * confirmation email (in addition to Stripe's receipt).
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
      return;
    }
    try { await confirm.mutateAsync({ paymentIntentId }); } catch (err) { console.error(err); }
    onSuccess();
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
      <p className="text-center text-xs text-gray-400">Secured by Stripe. Top Martial Arts Suwanee.</p>
    </form>
  );
}

export default function FieldTripPay() {
  const sp = new URLSearchParams(window.location.search);
  const [payerName, setPayerName] = useState(sp.get("name") ?? "");
  const [email, setEmail]         = useState(sp.get("email") ?? "");
  const [camperNames, setCamperNames] = useState(sp.get("campers") ?? "");
  const [detail]                  = useState(sp.get("detail") ?? "Summer camp field trip");
  const [slots, setSlots]         = useState(Math.max(1, Math.min(20, parseInt(sp.get("slots") ?? "1", 10) || 1)));

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [paid, setPaid] = useState(false);
  const startedRef = useRef(false);

  const createIntent = trpc.fieldTrip.createIntent.useMutation();

  const total = `$${((slots * FIELD_TRIP_CENTS) / 100).toFixed(2)}`;

  function setSlotCount(delta: number) {
    setSlots(prev => Math.max(1, Math.min(20, prev + delta)));
  }

  async function startCheckout() {
    if (!payerName.trim()) { toast.error("Please enter your name."); return; }
    if (!email.trim()) { toast.error("Please enter your email so we can send your confirmation."); return; }
    if (startedRef.current) return;
    startedRef.current = true;
    setIsStarting(true);
    try {
      const detailText = camperNames.trim()
        ? `${detail} — ${camperNames.trim()}`
        : detail;
      const r = await createIntent.mutateAsync({
        payerName: payerName.trim(),
        email: email.trim(),
        detail: detailText,
        slots,
      });
      setClientSecret(r.clientSecret ?? null);
      setPaymentIntentId(r.paymentIntentId);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      toast.error("Could not start checkout. Please refresh or contact the school.");
      startedRef.current = false;
    } finally {
      setIsStarting(false);
    }
  }

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
                A confirmation and a receipt have been emailed to {email}.
              </p>
            </div>
          ) : clientSecret && paymentIntentId ? (
            <div className="p-6 sm:p-8">
              <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Paying as</p>
                <p className="font-semibold text-[#1a2d5a] mb-2">{payerName}</p>
                <div className="flex justify-between items-baseline pt-3 border-t border-gray-200">
                  <span className="text-sm text-gray-600">$25 &times; {slots} field trip{slots > 1 ? "s" : ""}</span>
                  <span className="text-2xl font-extrabold text-[#1a2d5a]">{total}</span>
                </div>
              </div>
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
                <PaymentForm paymentIntentId={paymentIntentId} total={total} onSuccess={() => setPaid(true)} />
              </Elements>
            </div>
          ) : (
            <div className="p-6 sm:p-8 space-y-5">
              <p className="text-sm text-gray-600">
                Pay for your camper's summer camp field trips. Each field trip is <strong>$25</strong>
                {" "}(one per child, per field-trip week).
              </p>

              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Your name <span className="text-[#c41e3a]">*</span></Label>
                <Input value={payerName} onChange={e => setPayerName(e.target.value)} placeholder="Parent / guardian name" className="text-base" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-[#c41e3a]">*</span></Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="text-base" />
                <p className="text-xs text-gray-400 mt-1">We'll email your confirmation and receipt here.</p>
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Camper name(s) <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input value={camperNames} onChange={e => setCamperNames(e.target.value)} placeholder="So we can match the payment" className="text-base" />
              </div>

              <div>
                <Label className="text-gray-700 font-medium mb-2 block">Number of field trips</Label>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" className="h-11 w-11 p-0" onClick={() => setSlotCount(-1)} disabled={slots <= 1}>
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-12 text-center text-xl font-bold text-[#1a2d5a]">{slots}</span>
                  <Button type="button" variant="outline" className="h-11 w-11 p-0" onClick={() => setSlotCount(1)} disabled={slots >= 20}>
                    <Plus className="w-4 h-4" />
                  </Button>
                  <span className="ml-auto text-sm text-gray-500">$25 each</span>
                </div>
              </div>

              <div className="flex justify-between items-baseline pt-3 border-t border-gray-200">
                <span className="text-sm text-gray-600">Total</span>
                <span className="text-2xl font-extrabold text-[#1a2d5a]">{total}</span>
              </div>

              <Button
                type="button"
                onClick={startCheckout}
                disabled={isStarting}
                className="w-full bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold"
              >
                {isStarting ? "Starting checkout..." : `Continue to payment · ${total}`}
              </Button>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-gray-400 mt-4">Secured by Stripe. Top Martial Arts Suwanee.</p>
      </div>
    </div>
  );
}
