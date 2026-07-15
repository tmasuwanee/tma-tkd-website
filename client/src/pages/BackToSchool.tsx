import { useState, useMemo, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, CalendarCheck, ShieldCheck, Trophy, Zap, Loader2, ChevronLeft } from "lucide-react";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

const stripePromise = loadStripe(import.meta.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY);

const PROGRAMS = [
  { key: "taekwondo",     label: "Taekwondo" },
  { key: "kickboxing",    label: "Kickboxing" },
  { key: "bjj",           label: "Brazilian Jiu-Jitsu" },
  { key: "little_tigers", label: "Little Tigers (4-5)" },
];

const PROGRAM_TO_INTEREST: Record<string, string> = {
  taekwondo:     "Taekwondo",
  kickboxing:    "Kickboxing",
  bjj:           "BJJ",
  little_tigers: "Little Tigers",
};

function getUtmParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    utmSource:   p.get("utm_source")   ?? undefined,
    utmMedium:   p.get("utm_medium")   ?? undefined,
    utmCampaign: p.get("utm_campaign") ?? undefined,
    utmContent:  p.get("utm_content")  ?? undefined,
  };
}

function PaymentForm({ paymentIntentId, onSuccess }: { paymentIntentId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const confirm = trpc.backToSchool.confirm.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/back-to-school` },
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />
      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white h-12 text-base font-semibold rounded-xl"
      >
        {isProcessing ? "Processing..." : "Pay $49"}
      </Button>
    </form>
  );
}

export default function BackToSchool() {
  const [step, setStep] = useState<1 | 2>(1);
  const [program,    setProgram]    = useState("taekwondo");
  const [parentName, setParentName] = useState("");
  const [kidName,    setKidName]    = useState("");
  const [age,        setAge]        = useState("");
  const [phone,      setPhone]      = useState("");
  const [email,      setEmail]      = useState("");
  const [smsConsent, setSmsConsent] = useState(false);

  const [clientSecret,   setClientSecret]   = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [paid, setPaid] = useState(false);
  const startedRef = useRef(false);

  const createIntent = trpc.backToSchool.createIntent.useMutation();
  const utm = useMemo(() => getUtmParams(), []);

  async function startCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!parentName.trim() || !kidName.trim() || !phone.trim()) {
      toast.error("Please fill in name, student name, and phone.");
      return;
    }
    if (!smsConsent) {
      toast.error("Please agree to receive SMS updates so we can confirm your start date.");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    setIsStarting(true);
    try {
      const r = await createIntent.mutateAsync({
        program:        PROGRAM_TO_INTEREST[program] || "Taekwondo",
        parentName:     parentName.trim(),
        kidName:        kidName.trim(),
        kidAge:         age.trim() || null,
        phone:          phone.trim(),
        email:          email.trim() || null,
        smsConsentText: SMS_CONSENT_TEXT,
        ...utm,
      });
      setClientSecret(r.clientSecret ?? null);
      setPaymentIntentId(r.paymentIntentId);
      setStep(2);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      toast.error("Could not start checkout. Please try again.");
      startedRef.current = false;
    } finally {
      setIsStarting(false);
    }
  }

  // Success screen
  if (paid) {
    return (
      <div className="min-h-screen bg-[#1a2d5a] flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 bg-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-11 h-11 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">You're in!</h1>
        <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 mt-2 mb-6 w-full max-w-sm">
          <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Paid</p>
          <p className="text-white font-bold text-xl leading-tight">2 weeks of {PROGRAM_TO_INTEREST[program]}</p>
          <p className="text-white/80 text-lg mt-0.5">$49</p>
        </div>
        <p className="text-white/60 text-sm max-w-xs">
          Payment received. We will call you within 1 business day to lock in your start date.
          A receipt has been emailed by Stripe. Welcome to the TMA family.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1a2d5a] sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">TMA</span>
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">Top Martial Arts Suwanee</p>
              <p className="text-white/60 text-xs">Back to School Special</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full transition-colors ${step >= 1 ? "bg-white" : "bg-white/30"}`} />
            <div className={`w-2 h-2 rounded-full transition-colors ${step >= 2 ? "bg-white" : "bg-white/30"}`} />
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-[#1a2d5a] pb-8 px-4 pt-5">
        <div className="max-w-lg mx-auto">
          <div className="inline-flex items-center gap-1.5 bg-[#c41e3a] text-white rounded-lg px-3 py-1.5 text-xs font-bold mb-4">
            <Zap className="w-3.5 h-3.5" /> Back to School Special
          </div>
          <h1 className="text-white text-3xl font-bold leading-tight">
            2 weeks of any program for <span className="text-[#f5b301]">$49</span>
          </h1>
          <p className="text-white/70 text-sm mt-3">
            Start the school year with focus, discipline, and confidence. Pick Taekwondo,
            Kickboxing, Jiu-Jitsu, or Little Tigers and train for two full weeks. No long-term
            commitment. Pay $49 online and you're set.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mt-5">
            {[
              { icon: CalendarCheck, text: "2 full weeks of classes" },
              { icon: Trophy,        text: "Any program you choose" },
              { icon: ShieldCheck,   text: "No long-term commitment" },
              { icon: Zap,           text: "Just $49, paid online" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2">
                <Icon className="w-4 h-4 text-white/70 shrink-0" />
                <span className="text-white text-xs font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step 1: info */}
      {step === 1 && (
        <form onSubmit={startCheckout} className="max-w-lg mx-auto px-4 py-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-[#1a2d5a]">Claim the special</h2>
            <p className="text-gray-500 text-sm mt-1">Pick a program and tell us who's joining. Then pay $49 to lock it in.</p>
          </div>

          {/* Program picker */}
          <div>
            <Label className="text-gray-700 font-semibold mb-2.5 block">Program <span className="text-[#c41e3a]">*</span></Label>
            <div className="grid grid-cols-2 gap-2.5">
              {PROGRAMS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setProgram(p.key)}
                  className={`p-3.5 rounded-xl border-2 text-left transition-colors text-sm ${
                    program === p.key
                      ? "border-[#1a2d5a] bg-[#1a2d5a]/5 text-[#1a2d5a] font-semibold"
                      : "border-gray-200 text-gray-600 bg-white hover:border-gray-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Parent / guardian name <span className="text-[#c41e3a]">*</span></Label>
              <Input value={parentName} onChange={e => setParentName(e.target.value)} placeholder="Your full name" className="text-base" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Student name <span className="text-[#c41e3a]">*</span></Label>
                <Input value={kidName} onChange={e => setKidName(e.target.value)} placeholder="Student's name" className="text-base" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Age <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 8" className="text-base" />
              </div>
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Phone <span className="text-[#c41e3a]">*</span></Label>
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(770) 555-1234" className="text-base" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-gray-400 font-normal">(for your receipt)</span></Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="text-base" />
            </div>
          </div>

          {/* SMS consent */}
          <label className="flex items-start gap-3 p-3.5 bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl cursor-pointer hover:bg-[#1a2d5a]/10 transition-colors">
            <Checkbox
              checked={smsConsent}
              onCheckedChange={v => setSmsConsent(v === true)}
              className="mt-0.5 h-5 w-5 border-2 border-[#1a2d5a]/50 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0"
            />
            <span className="text-xs text-gray-700 leading-relaxed">
              <span className="font-semibold block mb-0.5 text-sm">Text me my start date and class updates <span className="text-[#c41e3a]">*</span></span>
              {SMS_CONSENT_TEXT}
            </span>
          </label>

          <Button
            type="submit"
            disabled={isStarting}
            className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl"
          >
            {isStarting ? "Starting checkout..." : "Continue to payment"}
          </Button>

          <p className="text-center text-xs text-gray-400">
            New students only. One special per student.
          </p>
        </form>
      )}

      {/* Step 2: payment */}
      {step === 2 && (
        <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex items-center gap-1 text-sm text-[#1a2d5a] hover:underline"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <div className="bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl px-4 py-3.5">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Your special</p>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-bold text-[#1a2d5a] leading-tight">2 weeks of {PROGRAM_TO_INTEREST[program]}</p>
                <p className="text-sm text-gray-600 mt-0.5">{kidName}</p>
              </div>
              <p className="text-2xl font-extrabold text-[#1a2d5a]">$49</p>
            </div>
          </div>

          {clientSecret && paymentIntentId ? (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
              <PaymentForm paymentIntentId={paymentIntentId} onSuccess={() => { setPaid(true); window.scrollTo(0, 0); }} />
            </Elements>
          ) : (
            <div className="flex items-center justify-center py-10 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading secure checkout...
            </div>
          )}

          <p className="text-center text-xs text-gray-400">Secured by Stripe. Top Martial Arts Suwanee.</p>
        </div>
      )}
    </div>
  );
}
