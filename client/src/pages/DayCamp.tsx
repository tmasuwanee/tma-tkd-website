import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Sun, Plus, X } from "lucide-react";
import { DAY_CAMP_PRICE_CENTS } from "@shared/dayCamp";

/**
 * Day-camp signup ($60/day). Morning care on digital-learning days / school-out
 * holidays. Parent picks the day(s) and pays. /day-camp
 */
const stripePromise = loadStripe(import.meta.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY);
const perDay = `$${(DAY_CAMP_PRICE_CENTS / 100).toFixed(0)}`;
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function PaymentForm({ paymentIntentId, total, onSuccess }: { paymentIntentId: string; total: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const confirm = trpc.dayCamp.confirm.useMutation();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    const { error } = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/day-camp` }, redirect: "if_required" });
    if (error) { toast.error(error.message ?? "Payment failed."); setProcessing(false); return; }
    try { await confirm.mutateAsync({ paymentIntentId }); } catch (err) { console.error(err); }
    onSuccess();
  };
  return (
    <form onSubmit={submit} className="space-y-6">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || processing} className="w-full bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold">
        {processing ? "Processing..." : `Pay ${total}`}
      </Button>
      <p className="text-center text-xs text-gray-400">Secured by Stripe. Top Martial Arts Suwanee.</p>
    </form>
  );
}

export default function DayCamp() {
  const [childName, setChildName] = useState("");
  const [parentName, setParentName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [paid, setPaid] = useState(false);
  const startedRef = useRef(false);
  const createIntent = trpc.dayCamp.createIntent.useMutation();

  const total = `$${((DAY_CAMP_PRICE_CENTS * dates.length) / 100).toFixed(2)}`;
  const addDate = () => {
    if (!pick) return;
    if (!dates.includes(pick)) setDates([...dates, pick].sort());
    setPick("");
  };

  async function start() {
    if (!childName.trim() || !parentName.trim()) { toast.error("Please enter the child's and parent's names."); return; }
    if (!email.trim()) { toast.error("Please enter your email for the receipt."); return; }
    if (dates.length === 0) { toast.error("Please add at least one day."); return; }
    if (startedRef.current) return;
    startedRef.current = true; setStarting(true);
    try {
      const r = await createIntent.mutateAsync({ childName: childName.trim(), parentName: parentName.trim(), email: email.trim(), phone: phone.trim() || undefined, dates });
      setClientSecret(r.clientSecret ?? null); setPaymentIntentId(r.paymentIntentId); window.scrollTo(0, 0);
    } catch (err) { console.error(err); toast.error("Could not start checkout. Please retry or call the school."); startedRef.current = false; }
    finally { setStarting(false); }
  }

  const inp = "text-base";
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-[#1a2d5a]">Top Martial Arts Suwanee</h1>
          <p className="text-sm font-semibold text-[#c41e3a] tracking-wide uppercase mt-1">Day Camp Signup</p>
        </div>
        <Card className="bg-white shadow-xl border border-gray-200">
          {paid ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5"><CheckCircle2 className="w-9 h-9 text-green-600" /></div>
              <h2 className="text-xl font-bold text-[#1a2d5a] mb-2">You're signed up!</h2>
              <p className="text-gray-600 text-sm">Thanks{parentName ? `, ${parentName}` : ""}. {childName || "Your child"} is set for {dates.length} day{dates.length > 1 ? "s" : ""} of camp. A receipt is on its way to {email}. Morning drop-off.</p>
            </div>
          ) : clientSecret && paymentIntentId ? (
            <div className="p-6 sm:p-8">
              <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Signing up</p>
                <p className="font-semibold text-[#1a2d5a]">{childName}</p>
                <p className="text-xs text-gray-500 mt-1">{dates.map(fmtDate).join(" · ")}</p>
                <div className="flex justify-between items-baseline pt-3 mt-2 border-t border-gray-200">
                  <span className="text-sm text-gray-600">{dates.length} day{dates.length > 1 ? "s" : ""} × {perDay}</span>
                  <span className="text-2xl font-extrabold text-[#1a2d5a]">{total}</span>
                </div>
              </div>
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
                <PaymentForm paymentIntentId={paymentIntentId} total={total} onSuccess={() => setPaid(true)} />
              </Elements>
            </div>
          ) : (
            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex gap-3 rounded-lg bg-[#1a2d5a]/5 border border-[#1a2d5a]/15 p-4">
                <Sun className="w-6 h-6 text-[#c41e3a] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-700 leading-relaxed">
                  <p className="font-semibold text-[#1a2d5a] mb-1">Day camp, {perDay}/day</p>
                  <p>Morning care on digital-learning days and school-out holidays. Pick the day(s) you need below.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-gray-700 font-medium mb-1.5 block">Child's name <span className="text-[#c41e3a]">*</span></Label><Input value={childName} onChange={e => setChildName(e.target.value)} className={inp} /></div>
                <div><Label className="text-gray-700 font-medium mb-1.5 block">Parent name <span className="text-[#c41e3a]">*</span></Label><Input value={parentName} onChange={e => setParentName(e.target.value)} className={inp} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-[#c41e3a]">*</span></Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inp} /></div>
                <div><Label className="text-gray-700 font-medium mb-1.5 block">Phone</Label><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inp} /></div>
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Which day(s)? <span className="text-[#c41e3a]">*</span></Label>
                <div className="flex gap-2">
                  <Input type="date" value={pick} onChange={e => setPick(e.target.value)} className={inp} />
                  <Button type="button" variant="outline" onClick={addDate} className="shrink-0"><Plus className="w-4 h-4 mr-1" /> Add</Button>
                </div>
                {dates.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {dates.map(d => (
                      <span key={d} className="inline-flex items-center gap-1 text-xs bg-[#1a2d5a]/10 text-[#1a2d5a] rounded-full px-2.5 py-1">
                        {fmtDate(d)}<button onClick={() => setDates(dates.filter(x => x !== d))} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-between items-baseline pt-3 border-t border-gray-200">
                <span className="text-sm text-gray-600">{dates.length} day{dates.length === 1 ? "" : "s"} × {perDay}</span>
                <span className="text-2xl font-extrabold text-[#1a2d5a]">{total}</span>
              </div>
              <Button type="button" onClick={start} disabled={starting} className="w-full bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold">
                {starting ? "Starting checkout..." : `Continue to payment · ${total}`}
              </Button>
            </div>
          )}
        </Card>
        <p className="text-center text-xs text-gray-400 mt-4">Questions? Call or text (770) 277-3009.</p>
      </div>
    </div>
  );
}
