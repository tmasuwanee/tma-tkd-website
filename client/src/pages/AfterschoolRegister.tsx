import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ChevronRight, Clock, BookOpen, Users, Award, Star } from "lucide-react";
import { useLocation } from "wouter";

/**
 * After School Care Registration Page
 * /afterschool-register
 *
 * Families fill out a short form, choose their plan, and pay the one-time
 * fees (registration $99 + optional uniform $50 + supply fee $65) via Stripe.
 *
 * Early-bird: register by July 31 → 50% off first month's tuition (noted on
 * the page; the discount on monthly tuition is handled separately by staff).
 */

const stripePromise = loadStripe(import.meta.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY);

const EARLY_BIRD_DEADLINE = new Date("2026-07-31T23:59:59");

function isEarlyBirdActive() {
  return new Date() <= EARLY_BIRD_DEADLINE;
}

// ─── Pricing constants (mirrors server) ──────────────────────────────────────
const REGISTRATION = 99;
const UNIFORM = 50;
const SUPPLY_FEE = 65;

const PLANS = {
  "4_5_day": {
    label: "4–5 Day/Week",
    weekly: 125,
    monthly: 500,
    desc: "$100 After School Care + $25 TKD/Kickboxing",
  },
  "2_3_day": {
    label: "2–3 Day/Week",
    weekly: 100,
    monthly: 400,
    desc: "$75 After School Care + $25 TKD",
  },
} as const;

type Plan = keyof typeof PLANS;

function getEarlyBirdDiscount(plan: Plan): number {
  return PLANS[plan].monthly / 2; // 50% off first month
}

// ─── Payment form (mounted inside Stripe Elements) ────────────────────────────
function PaymentForm({
  paymentIntentId,
  total,
  onSuccess,
}: {
  paymentIntentId: string;
  total: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const confirm = trpc.afterschool.confirm.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/afterschool-register` },
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
        {isProcessing ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing…</>
        ) : (
          `Pay ${total} — Complete Registration`
        )}
      </Button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AfterschoolRegister() {
  const [, navigate] = useLocation();
  const earlyBird = isEarlyBirdActive();

  // Form state
  const [parentName, setParentName] = useState("");
  const [studentName, setStudentName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<Plan>("4_5_day");
  const [includeUniform, setIncludeUniform] = useState(true);
  const [includeSupplyFee, setIncludeSupplyFee] = useState(true);
  const [startDate, setStartDate] = useState("");

  // Checkout state
  const [step, setStep] = useState<"form" | "payment" | "done">("form");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const initRef = useRef(false);

  const createIntent = trpc.afterschool.createIntent.useMutation();

  // Computed total (includes discounted first month when early bird is active)
  const earlyBirdDiscount = earlyBird ? getEarlyBirdDiscount(plan) : 0;
  const totalCents =
    REGISTRATION * 100 +
    (includeUniform ? UNIFORM * 100 : 0) +
    (includeSupplyFee ? SUPPLY_FEE * 100 : 0) +
    (earlyBird ? earlyBirdDiscount * 100 : 0);
  const totalDisplay = `$${(totalCents / 100).toFixed(2)}`;

  // Handle Stripe redirect return (payment already completed)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const piId = sp.get("payment_intent");
    const status = sp.get("redirect_status");
    if (piId && status === "succeeded") {
      setStep("done");
    }
  }, []);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parentName.trim() || !studentName.trim() || !phone.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (initRef.current) return;
    initRef.current = true;

    createIntent.mutate(
      {
        parentName: parentName.trim(),
        studentName: studentName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
        plan,
        includeUniform,
        includeSupplyFee,
        earlyBird,
        startDate: startDate || undefined,
      },
      {
        onSuccess: (r) => {
          setClientSecret(r.clientSecret ?? null);
          setPaymentIntentId(r.paymentIntentId);
          setStep("payment");
        },
        onError: () => {
          setFailed(true);
          initRef.current = false;
          toast.error("Could not start checkout. Please refresh or contact the school.");
        },
      }
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-9 h-9 bg-[#1a2d5a] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TMA</span>
            </div>
            <div className="hidden sm:block">
              <p className="text-base font-bold text-[#1a2d5a] leading-tight">Top Martial Arts</p>
              <p className="text-xs text-gray-500">Suwanee</p>
            </div>
          </button>
          <button onClick={() => navigate("/afterschool")} className="text-sm text-[#1a2d5a] hover:text-[#c41e3a] transition font-medium">
            ← Back to Program Info
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-[#1a2d5a] text-white py-12 px-4 text-center">
        <div className="inline-block mb-3 px-4 py-1.5 bg-[#c41e3a]/20 rounded-full">
          <span className="text-[#c41e3a] font-semibold text-sm tracking-wide uppercase">After School Care</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold mb-3">Enroll Your Child Today</h1>
        <p className="text-white/80 max-w-xl mx-auto text-base">
          Safe pick-up from school, supervised homework, and daily martial arts training. 3:00 PM – 6:30 PM.
        </p>
        {earlyBird && (
          <div className="mt-4 inline-flex items-center gap-2 bg-yellow-400/20 border border-yellow-400/40 rounded-full px-4 py-2">
            <Star className="w-4 h-4 text-yellow-300 fill-yellow-300" />
            <span className="text-yellow-200 font-semibold text-sm">Early Bird: Register by July 31 → 50% off first month!</span>
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 grid md:grid-cols-[1fr_360px] gap-8">

        {/* Left: Form / Payment */}
        <div>
          {step === "done" ? (
            <Card className="bg-white shadow-lg border border-gray-200 p-10 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#1a2d5a] mb-2">Registration Complete!</h2>
              <p className="text-gray-600 mb-6">
                Welcome to TMA After School Care{studentName ? `, ${studentName}` : ""}! A receipt has been sent to your email.
                Our staff will reach out shortly to confirm your start date and pick-up details.
              </p>
              {earlyBird && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-yellow-800">
                  🎉 <strong>Early Bird bonus applied!</strong> Your first month's tuition will be 50% off.
                </div>
              )}
              <Button onClick={() => navigate("/")} className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 text-white">
                Return to Home
              </Button>
            </Card>
          ) : step === "payment" ? (
            <Card className="bg-white shadow-lg border border-gray-200 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1a2d5a] mb-1">Secure Checkout</h2>
              <p className="text-sm text-gray-500 mb-6">One-time enrollment fees — monthly tuition is billed separately.</p>

              {/* Order summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Registration fee</span>
                  <span className="font-medium">${REGISTRATION}</span>
                </div>
                {includeUniform && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Uniform</span>
                    <span className="font-medium">${UNIFORM}</span>
                  </div>
                )}
                {includeSupplyFee && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Supply fee (annual)</span>
                    <span className="font-medium">${SUPPLY_FEE}</span>
                  </div>
                )}
                {earlyBird && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        1st month tuition
                        <span className="ml-1 text-xs text-gray-400 line-through">${PLANS[plan].monthly}</span>
                      </span>
                      <span className="font-medium text-green-700">${earlyBirdDiscount}</span>
                    </div>
                    <div className="text-xs text-green-700 font-medium">🎉 Early Bird 50% off — saves ${earlyBirdDiscount}!</div>
                  </>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200 font-bold text-base">
                  <span>Total due today</span>
                  <span className="text-[#1a2d5a]">{totalDisplay}</span>
                </div>
              </div>

              {failed ? (
                <p className="text-center text-sm text-red-600 py-6">
                  Could not start checkout. Please refresh the page or contact the school.
                </p>
              ) : clientSecret && paymentIntentId ? (
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
                  <PaymentForm paymentIntentId={paymentIntentId} total={totalDisplay} onSuccess={() => setStep("done")} />
                </Elements>
              ) : (
                <div className="flex items-center justify-center py-10 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading secure checkout…
                </div>
              )}

              <p className="text-center text-xs text-gray-400 mt-4">Secured by Stripe · Top Martial Arts Suwanee</p>
            </Card>
          ) : (
            /* Registration Form */
            <Card className="bg-white shadow-lg border border-gray-200 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1a2d5a] mb-1">Registration Form</h2>
              <p className="text-sm text-gray-500 mb-6">Fill in your details and choose your plan below.</p>

              <form onSubmit={handleFormSubmit} className="space-y-5">
                {/* Parent / Guardian */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Parent / Guardian Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={parentName}
                    onChange={e => setParentName(e.target.value)}
                    required
                    placeholder="Jane Smith"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30"
                  />
                </div>

                {/* Student Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Student Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                    required
                    placeholder="Alex Smith"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30"
                  />
                  <p className="text-xs text-gray-400 mt-1">We'll send your receipt here.</p>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required
                    placeholder="(770) 555-0100"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30"
                  />
                </div>

                {/* Plan selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Choose Your Plan <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.entries(PLANS) as [Plan, typeof PLANS[Plan]][]).map(([key, p]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPlan(key)}
                        className={`text-left rounded-xl border-2 p-4 transition ${
                          plan === key
                            ? "border-[#c41e3a] bg-[#c41e3a]/5"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-[#1a2d5a] text-sm">{p.label}</span>
                          {plan === key && <CheckCircle2 className="w-4 h-4 text-[#c41e3a]" />}
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{p.desc}</p>
                        <div className="flex gap-3 text-xs">
                          <span className="font-semibold text-[#1a2d5a]">${p.weekly}/wk</span>
                          <span className="text-gray-400">·</span>
                          <span className="font-semibold text-[#1a2d5a]">${p.monthly}/mo</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start date */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Anticipated Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30"
                  />
                </div>

                {/* Add-ons */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">One-Time Fees (paid today)</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeUniform}
                        onChange={e => setIncludeUniform(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-[#c41e3a] focus:ring-[#c41e3a]"
                      />
                      <span className="text-sm text-gray-700">Uniform — <strong>$50</strong></span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSupplyFee}
                        onChange={e => setIncludeSupplyFee(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-[#c41e3a] focus:ring-[#c41e3a]"
                      />
                      <span className="text-sm text-gray-700">Supply Fee (once/year) — <strong>$65</strong></span>
                    </label>
                  </div>
                </div>

                {/* Total */}
                <div className="bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-lg p-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Registration fee</span>
                    <span className="font-medium">${REGISTRATION}</span>
                  </div>
                  {includeUniform && (
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Uniform</span>
                      <span className="font-medium">${UNIFORM}</span>
                    </div>
                  )}
                  {includeSupplyFee && (
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Supply fee</span>
                      <span className="font-medium">${SUPPLY_FEE}</span>
                    </div>
                  )}
                  {earlyBird && (
                    <>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">
                          1st month tuition
                          <span className="ml-1 text-xs text-gray-400 line-through">${PLANS[plan].monthly}</span>
                        </span>
                        <span className="font-medium text-green-700">${earlyBirdDiscount}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-green-700 font-medium mb-1">
                        <span>🎉</span>
                        <span>Early Bird 50% off — saves ${earlyBirdDiscount}!</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-bold text-base pt-2 border-t border-[#1a2d5a]/20 mt-2">
                    <span className="text-[#1a2d5a]">Due today</span>
                    <span className="text-[#1a2d5a]">{totalDisplay}</span>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={createIntent.isPending}
                  className="w-full bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold"
                >
                  {createIntent.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading checkout…</>
                  ) : (
                    <>Continue to Payment <ChevronRight className="w-4 h-4 ml-1" /></>
                  )}
                </Button>
              </form>
            </Card>
          )}
        </div>

        {/* Right: Info sidebar */}
        <div className="space-y-5">
          {/* Program highlights */}
          <Card className="bg-white border border-gray-200 shadow-sm p-5">
            <h3 className="font-bold text-[#1a2d5a] mb-4 text-base">What's Included</h3>
            <div className="space-y-3">
              {[
                { icon: <Clock className="w-4 h-4 text-[#c41e3a]" />, text: "Pick-up from school (transportation provided)" },
                { icon: <BookOpen className="w-4 h-4 text-[#c41e3a]" />, text: "Supervised homework completion" },
                { icon: <Award className="w-4 h-4 text-[#c41e3a]" />, text: "Daily TKD / Kickboxing training" },
                { icon: <Users className="w-4 h-4 text-[#c41e3a]" />, text: "Self-discipline, respect & leadership" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                  <p className="text-sm text-gray-700">{item.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600">
              <strong>Hours:</strong> 3:00 PM – 6:30 PM<br />
              <strong>Late pick-up:</strong> $25/week after 6:30 PM
            </div>
          </Card>

          {/* Monthly tuition reminder */}
          <Card className="bg-[#1a2d5a] text-white border-0 shadow-sm p-5">
            <h3 className="font-bold mb-3 text-base">Monthly Tuition</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/80">4–5 Day/Week</span>
                <span className="font-bold">$500/mo · $125/wk</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/80">2–3 Day/Week</span>
                <span className="font-bold">$400/mo · $100/wk</span>
              </div>
            </div>
            <p className="text-white/60 text-xs mt-3">Monthly tuition is billed separately after enrollment.</p>
            {earlyBird && (
              <div className="mt-3 bg-yellow-400/20 border border-yellow-400/30 rounded-lg p-3">
                <p className="text-yellow-200 text-xs font-semibold">
                  ⭐ Register by July 31 → 50% off your first month!
                </p>
              </div>
            )}
          </Card>

          {/* Questions */}
          <Card className="bg-white border border-gray-200 shadow-sm p-5">
            <h3 className="font-bold text-[#1a2d5a] mb-2 text-base">Questions?</h3>
            <p className="text-sm text-gray-600 mb-3">Call or text us — we're happy to help.</p>
            <a href="tel:+17706896412" className="block text-[#c41e3a] font-semibold text-sm hover:underline">(770) 689-6412</a>
            <button
              onClick={() => navigate("/afterschooltour")}
              className="mt-3 text-sm text-[#1a2d5a] hover:text-[#c41e3a] transition font-medium underline underline-offset-2"
            >
              Schedule a tour instead →
            </button>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#1a2d5a] text-white py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
          <p className="text-white/70">© 2026 Top Martial Arts Suwanee. All rights reserved.</p>
          <div className="flex gap-4">
            <button onClick={() => navigate("/")} className="text-white/70 hover:text-white transition">Home</button>
            <button onClick={() => navigate("/afterschool")} className="text-white/70 hover:text-white transition">After School</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
