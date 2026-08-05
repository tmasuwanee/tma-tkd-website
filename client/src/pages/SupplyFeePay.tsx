import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Backpack } from "lucide-react";

/**
 * Private After-School supply-fee payment page ($65). For families who finished
 * registration without the annual supply fee. Staff send the link (optionally
 * pre-filled: /supply-fee?name=..&email=..&student=..). Amount is fixed
 * server-side (supplyFee.createIntent) so the URL cannot change the price.
 */
const stripePromise = loadStripe(import.meta.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY);
const AMOUNT = "$65.00";

function PaymentForm({ paymentIntentId, onSuccess }: { paymentIntentId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const confirm = trpc.supplyFee.confirm.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/supply-fee` },
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
      <Button type="submit" disabled={!stripe || isProcessing}
        className="w-full bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold">
        {isProcessing ? "Processing..." : `Pay ${AMOUNT}`}
      </Button>
      <p className="text-center text-xs text-gray-400">Secured by Stripe. Top Martial Arts Suwanee.</p>
    </form>
  );
}

export default function SupplyFeePay() {
  const sp = new URLSearchParams(window.location.search);
  const [payerName, setPayerName] = useState(sp.get("name") ?? "");
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [studentName, setStudentName] = useState(sp.get("student") ?? "");

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [paid, setPaid] = useState(false);
  const startedRef = useRef(false);

  const createIntent = trpc.supplyFee.createIntent.useMutation();

  async function startCheckout() {
    if (!payerName.trim()) { toast.error("Please enter your name."); return; }
    if (!email.trim()) { toast.error("Please enter your email so we can send your receipt."); return; }
    if (startedRef.current) return;
    startedRef.current = true;
    setIsStarting(true);
    try {
      const r = await createIntent.mutateAsync({
        payerName: payerName.trim(),
        email: email.trim(),
        studentName: studentName.trim() || undefined,
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
          <p className="text-sm font-semibold text-[#c41e3a] tracking-wide uppercase mt-1">After-School Supply Fee</p>
        </div>

        <Card className="bg-white shadow-xl border border-gray-200">
          {paid ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-[#1a2d5a] mb-2">Payment received</h2>
              <p className="text-gray-600 text-sm">
                Thank you{payerName ? `, ${payerName}` : ""}. Your {AMOUNT} supply fee is paid and your after-school
                enrollment is now complete. A receipt has been emailed to {email}.
              </p>
            </div>
          ) : clientSecret && paymentIntentId ? (
            <div className="p-6 sm:p-8">
              <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Paying as</p>
                <p className="font-semibold text-[#1a2d5a] mb-2">{payerName}{studentName ? ` (for ${studentName})` : ""}</p>
                <div className="flex justify-between items-baseline pt-3 border-t border-gray-200">
                  <span className="text-sm text-gray-600">Annual supply fee</span>
                  <span className="text-2xl font-extrabold text-[#1a2d5a]">{AMOUNT}</span>
                </div>
              </div>
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
                <PaymentForm paymentIntentId={paymentIntentId} onSuccess={() => setPaid(true)} />
              </Elements>
            </div>
          ) : (
            <div className="p-6 sm:p-8 space-y-5">
              {/* Explanation for the parent */}
              <div className="flex gap-3 rounded-lg bg-[#1a2d5a]/5 border border-[#1a2d5a]/15 p-4">
                <Backpack className="w-6 h-6 text-[#c41e3a] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-700 leading-relaxed">
                  <p className="font-semibold text-[#1a2d5a] mb-1">One more step to finish enrollment</p>
                  <p>
                    Your after-school registration went through, but it did not include the <strong>annual supply
                    fee of $65</strong>. This one-time yearly fee covers your child's program supplies and materials.
                    Please complete it below to finalize enrollment. Thank you!
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Your name <span className="text-[#c41e3a]">*</span></Label>
                <Input value={payerName} onChange={e => setPayerName(e.target.value)} placeholder="Parent / guardian name" className="text-base" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-[#c41e3a]">*</span></Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="text-base" />
                <p className="text-xs text-gray-400 mt-1">We'll email your receipt here.</p>
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Child's name <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="So we can match the payment" className="text-base" />
              </div>

              <div className="flex justify-between items-baseline pt-3 border-t border-gray-200">
                <span className="text-sm text-gray-600">Annual supply fee</span>
                <span className="text-2xl font-extrabold text-[#1a2d5a]">{AMOUNT}</span>
              </div>

              <Button type="button" onClick={startCheckout} disabled={isStarting}
                className="w-full bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold">
                {isStarting ? "Starting checkout..." : `Continue to payment · ${AMOUNT}`}
              </Button>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-gray-400 mt-4">Questions? Call or text (770) 277-3009.</p>
      </div>
    </div>
  );
}
