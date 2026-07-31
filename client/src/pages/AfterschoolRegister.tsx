import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ChevronRight, ChevronLeft, Clock, BookOpen, Users, Award, Star, Bus } from "lucide-react";
import { useLocation } from "wouter";
import SignaturePad from "@/components/SignaturePad";
import { AFTERSCHOOL_WAIVER_SECTIONS } from "@shared/afterschoolWaiver";

/**
 * After School Care Registration — full intake wizard.
 * /afterschool-register
 *
 * Collects child + parent identification, pick-up authorization, a short
 * "about your child" section, plan selection, and the signed enrollment waiver
 * (an initial per policy section + a drawn signature). On submit the signed PDF
 * is generated, stored, and emailed BEFORE payment, so the legal record exists
 * even if the family drops off at checkout. Then one-time fees are collected via
 * Stripe. After submit the parent is offered the optional GCPS transportation
 * form (/transportation).
 */

const stripePromise = loadStripe(import.meta.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY);

const EARLY_BIRD_DEADLINE = new Date("2026-07-31T23:59:59");
function isEarlyBirdActive() {
  return new Date() <= EARLY_BIRD_DEADLINE;
}

const REGISTRATION = 99;
const UNIFORM = 50;
const SUPPLY_FEE = 65;

const PLANS = {
  "4_5_day": { label: "4–5 Day/Week", weekly: 125, monthly: 500, desc: "$100 After School Care + $25 TKD/Kickboxing" },
  "2_3_day": { label: "2–3 Day/Week", weekly: 100, monthly: 400, desc: "$75 After School Care + $25 TKD" },
} as const;
type Plan = keyof typeof PLANS;
function getEarlyBirdDiscount(plan: Plan): number {
  return PLANS[plan].monthly / 2;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const STEP_LABELS = ["Children", "Parents", "Pick-up", "About", "Plan", "Sign & Agree"];

// Draft autosave: everything the parent types is stashed in localStorage so a
// refresh, an accidental back, or a detour to the tour page never loses it.
// The drawn signature is intentionally NOT persisted (it can't visually restore
// onto a fresh canvas). Cleared once registration completes.
const SAVE_KEY = "tma_afterschool_intake_v1";
// Compact snapshot handed to the tour page so "Schedule a tour instead" carries
// over the name/child/phone/email the parent already entered.
const TOUR_PREFILL_KEY = "tma_afterschool_prefill";

function loadSaved(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; } catch { return {}; }
}

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30";

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Payment form (mounted inside Stripe Elements) ────────────────────────────
function PaymentForm({ paymentIntentId, total, onSuccess }: { paymentIntentId: string; total: string; onSuccess: () => void }) {
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
      <Button type="submit" disabled={!stripe || isProcessing}
        className="w-full bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold">
        {isProcessing ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing…</>) : `Pay ${total} — Complete Registration`}
      </Button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AfterschoolRegister() {
  const [, navigate] = useLocation();
  const earlyBird = isEarlyBirdActive();

  const todayIso = new Date().toISOString().slice(0, 10);

  // Restore any saved draft once, then seed each field from it.
  const saved = useMemo(loadSaved, []);

  // Wizard position: form step 0..5, then payment, then done.
  const [phase, setPhase] = useState<"form" | "payment" | "done">("form");
  const [step, setStep] = useState<number>(saved.step ?? 0);

  // ── Intake state ──
  const [children, setChildren] = useState<{ name: string; dob: string; gender: string }[]>(
    saved.children ?? [{ name: "", dob: "", gender: "" }],
  );
  const [twoChildren, setTwoChildren] = useState<boolean>(saved.twoChildren ?? false);
  const [childrenAddress, setChildrenAddress] = useState<string>(saved.childrenAddress ?? "");

  const [parentEmail, setParentEmail] = useState<string>(saved.parentEmail ?? "");
  const [primaryPhone, setPrimaryPhone] = useState<string>(saved.primaryPhone ?? "");
  const [legalCustody, setLegalCustody] = useState<string>(saved.legalCustody ?? "");
  const [mother, setMother] = useState<{ name: string; phone: string; address: string; workPhone: string; cellPhone: string }>(
    saved.mother ?? { name: "", phone: "", address: "", workPhone: "", cellPhone: "" });
  const [father, setFather] = useState<{ name: string; phone: string; address: string; cellPhone: string }>(
    saved.father ?? { name: "", phone: "", address: "", cellPhone: "" });

  const [pickupAuth, setPickupAuth] = useState<{ name: string; phone: string }[]>(
    saved.pickupAuth ?? [{ name: "", phone: "" }, { name: "", phone: "" }, { name: "", phone: "" }],
  );
  const [custodialGuardianName, setCustodialGuardianName] = useState<string>(saved.custodialGuardianName ?? "");

  const [specialNeeds, setSpecialNeeds] = useState<string>(saved.specialNeeds ?? "");
  const [hadSeizures, setHadSeizures] = useState<boolean | null>(saved.hadSeizures ?? null);
  const [hasTantrums, setHasTantrums] = useState<boolean | null>(saved.hasTantrums ?? null);
  const [tantrumHandling, setTantrumHandling] = useState<string>(saved.tantrumHandling ?? "");

  const [plan, setPlan] = useState<Plan>(saved.plan ?? "4_5_day");
  const [includeUniform, setIncludeUniform] = useState<boolean>(saved.includeUniform ?? true);
  const [includeSupplyFee, setIncludeSupplyFee] = useState<boolean>(saved.includeSupplyFee ?? true);
  const [startDate, setStartDate] = useState<string>(saved.startDate ?? "");
  const [pickupDays, setPickupDays] = useState<string[]>(saved.pickupDays ?? []);

  const [waiverInitials, setWaiverInitials] = useState<Record<string, string>>(saved.waiverInitials ?? {});
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [signedName, setSignedName] = useState<string>(saved.signedName ?? "");
  const [signedRelationship, setSignedRelationship] = useState<string>(saved.signedRelationship ?? "");
  const [agreed, setAgreed] = useState(false);

  // Persist the draft on every change (signature + agree checkbox excluded).
  useEffect(() => {
    if (phase !== "form") return;
    const blob = {
      step, children, twoChildren, childrenAddress, parentEmail, primaryPhone, legalCustody,
      mother, father, pickupAuth, custodialGuardianName, specialNeeds, hadSeizures, hasTantrums,
      tantrumHandling, plan, includeUniform, includeSupplyFee, startDate, pickupDays,
      waiverInitials, signedName, signedRelationship,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(blob)); } catch { /* quota / private mode */ }
  }, [phase, step, children, twoChildren, childrenAddress, parentEmail, primaryPhone, legalCustody,
    mother, father, pickupAuth, custodialGuardianName, specialNeeds, hadSeizures, hasTantrums,
    tantrumHandling, plan, includeUniform, includeSupplyFee, startDate, pickupDays,
    waiverInitials, signedName, signedRelationship]);

  // Clear the saved draft once registration is complete.
  useEffect(() => {
    if (phase === "done") { try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ } }
  }, [phase]);

  // ── Checkout state ──
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const submitting = useRef(false);
  const submitIntake = trpc.afterschool.submitIntake.useMutation();

  // Handle Stripe redirect return (payment already completed)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("payment_intent") && sp.get("redirect_status") === "succeeded") setPhase("done");
  }, []);

  const earlyBirdDiscount = earlyBird ? getEarlyBirdDiscount(plan) : 0;
  const totalCents =
    REGISTRATION * 100 +
    (includeUniform ? UNIFORM * 100 : 0) +
    (includeSupplyFee ? SUPPLY_FEE * 100 : 0) +
    (earlyBird ? earlyBirdDiscount * 100 : 0);
  const totalDisplay = `$${(totalCents / 100).toFixed(2)}`;
  const primaryChildName = children[0]?.name?.trim() || "";

  function toggleDay(d: string) {
    setPickupDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));
  }

  // Hand what they've already typed to the tour page so it pre-fills there.
  function goToTour() {
    try {
      localStorage.setItem(TOUR_PREFILL_KEY, JSON.stringify({
        parentName: signedName || mother.name || father.name || "",
        kidName: children[0]?.name || "",
        phone: primaryPhone,
        email: parentEmail,
      }));
    } catch { /* noop */ }
    navigate("/afterschooltour");
  }

  // ── Per-step validation ──
  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!children[0].name.trim()) return "Please enter your child's full legal name.";
      if (!childrenAddress.trim()) return "Please enter the children's home address.";
      if (twoChildren && !children[1]?.name.trim()) return "Please enter the second child's name or remove them.";
    }
    if (s === 1) {
      if (!parentEmail.trim()) return "Please enter a parent email.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parentEmail.trim())) return "Please enter a valid email.";
      if (!primaryPhone.trim()) return "Please enter a primary phone number.";
    }
    if (s === 2) {
      if (!custodialGuardianName.trim()) return "Please enter the custodial parent or legal guardian.";
    }
    if (s === 3) {
      if (hadSeizures === null || hasTantrums === null) return "Please answer both yes/no questions.";
    }
    if (s === 4) {
      if (pickupDays.length === 0) return "Please choose at least one pick-up day.";
    }
    if (s === 5) {
      for (const sec of AFTERSCHOOL_WAIVER_SECTIONS) {
        if (!(waiverInitials[sec.key] || "").trim()) return "Please initial every policy section.";
      }
      if (!signedName.trim()) return "Please type the name of the signing parent/guardian.";
      if (!signaturePng) return "Please draw your signature.";
      if (!agreed) return "Please check the agreement box.";
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }
    if (step < 5) { setStep(step + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else handleSubmit();
  }
  function back() {
    if (step > 0) { setStep(step - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }

  function handleSubmit() {
    if (submitting.current) return;
    submitting.current = true;

    const cleanChildren = children
      .slice(0, twoChildren ? 2 : 1)
      .filter(c => c.name.trim())
      .map(c => ({ name: c.name.trim(), dob: c.dob || undefined, gender: c.gender || undefined }));

    const motherHas = Object.values(mother).some(v => v.trim());
    const fatherHas = Object.values(father).some(v => v.trim());
    const pickup = pickupAuth.filter(p => p.name.trim()).map(p => ({ name: p.name.trim(), phone: p.phone.trim() || undefined }));

    submitIntake.mutate(
      {
        children: cleanChildren,
        childrenAddress: childrenAddress.trim() || undefined,
        parentEmail: parentEmail.trim(),
        primaryPhone: primaryPhone.trim(),
        legalCustody: legalCustody.trim() || undefined,
        mother: motherHas ? {
          name: mother.name.trim() || undefined, phone: mother.phone.trim() || undefined,
          address: mother.address.trim() || undefined, workPhone: mother.workPhone.trim() || undefined,
          cellPhone: mother.cellPhone.trim() || undefined,
        } : undefined,
        father: fatherHas ? {
          name: father.name.trim() || undefined, phone: father.phone.trim() || undefined,
          address: father.address.trim() || undefined, cellPhone: father.cellPhone.trim() || undefined,
        } : undefined,
        pickupAuth: pickup,
        custodialGuardianName: custodialGuardianName.trim(),
        specialNeeds: specialNeeds.trim() || undefined,
        hadSeizures: !!hadSeizures,
        hasTantrums: !!hasTantrums,
        tantrumHandling: hasTantrums ? (tantrumHandling.trim() || undefined) : undefined,
        pickupDays,
        plan,
        includeUniform,
        includeSupplyFee,
        earlyBird,
        startDate: startDate || undefined,
        waiverInitials,
        signedName: signedName.trim(),
        signedRelationship: signedRelationship.trim() || undefined,
        signedDate: todayIso,
        signaturePngDataUrl: signaturePng!,
      },
      {
        onSuccess: (r) => {
          setClientSecret(r.clientSecret ?? null);
          setPaymentIntentId(r.paymentIntentId);
          setPhase("payment");
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: (e) => {
          submitting.current = false;
          toast.error(e.message || "Could not submit. Please try again or call the school.");
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
      <div className="bg-[#1a2d5a] text-white py-10 px-4 text-center">
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

      <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-[1fr_340px] gap-8">
        {/* Left column */}
        <div>
          {phase === "done" ? (
            <Card className="bg-white shadow-lg border border-gray-200 p-8 sm:p-10 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#1a2d5a] mb-2">Registration Complete!</h2>
              <p className="text-gray-600 mb-6">
                Welcome to TMA After School Care{primaryChildName ? `, ${primaryChildName}` : ""}! A copy of your signed
                enrollment and a payment receipt have been emailed to you. Our staff will reach out to confirm your start
                date and pick-up details.
              </p>

              {/* Optional GCPS transportation form */}
              <div className="bg-[#1a2d5a]/5 border border-[#1a2d5a]/15 rounded-xl p-5 text-left mb-6">
                <div className="flex items-start gap-3">
                  <Bus className="w-6 h-6 text-[#c41e3a] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[#1a2d5a]">Need us to pick up from school?</p>
                    <p className="text-sm text-gray-600 mt-1">
                      If your child rides the bus to TMA from a Gwinnett County school, complete the county
                      transportation authorization (optional). It only takes a minute and can be signed on your phone.
                    </p>
                    <Button onClick={() => navigate("/transportation")} className="mt-3 bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white">
                      Complete transportation form <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>

              <Button onClick={() => navigate("/")} variant="outline" className="border-gray-300">Return to Home</Button>
            </Card>
          ) : phase === "payment" ? (
            <Card className="bg-white shadow-lg border border-gray-200 p-6 sm:p-8">
              <div className="mb-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4" /> Enrollment + waiver signed and saved. Last step: one-time fees.
              </div>
              <h2 className="text-xl font-bold text-[#1a2d5a] mb-1">Secure Checkout</h2>
              <p className="text-sm text-gray-500 mb-6">One-time enrollment fees — monthly tuition is billed separately.</p>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Registration fee</span><span className="font-medium">${REGISTRATION}</span></div>
                {includeUniform && <div className="flex justify-between"><span className="text-gray-600">Uniform</span><span className="font-medium">${UNIFORM}</span></div>}
                {includeSupplyFee && <div className="flex justify-between"><span className="text-gray-600">Supply fee (annual)</span><span className="font-medium">${SUPPLY_FEE}</span></div>}
                {earlyBird && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">1st month tuition<span className="ml-1 text-xs text-gray-400 line-through">${PLANS[plan].monthly}</span></span>
                      <span className="font-medium text-green-700">${earlyBirdDiscount}</span>
                    </div>
                    <div className="text-xs text-green-700 font-medium">🎉 Early Bird 50% off — saves ${earlyBirdDiscount}!</div>
                  </>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200 font-bold text-base"><span>Total due today</span><span className="text-[#1a2d5a]">{totalDisplay}</span></div>
              </div>

              {clientSecret && paymentIntentId ? (
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
                  <PaymentForm paymentIntentId={paymentIntentId} total={totalDisplay} onSuccess={() => setPhase("done")} />
                </Elements>
              ) : (
                <div className="flex items-center justify-center py-10 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading secure checkout…</div>
              )}

              <p className="text-center text-xs text-gray-400 mt-4">
                Your signed enrollment is already saved. If you close this page, you can pay later or in person.
              </p>
            </Card>
          ) : (
            /* ── Multi-step form ── */
            <Card className="bg-white shadow-lg border border-gray-200 p-6 sm:p-8">
              {/* Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Step {step + 1} of 6</p>
                  <p className="text-xs font-semibold text-[#c41e3a]">{STEP_LABELS[step]}</p>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#c41e3a] transition-all" style={{ width: `${((step + 1) / 6) * 100}%` }} />
                </div>
              </div>

              {/* Step 0 — Children */}
              {step === 0 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-bold text-[#1a2d5a]">Child / Student Information</h2>
                  {children.slice(0, twoChildren ? 2 : 1).map((c, i) => (
                    <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-4">
                      <p className="text-sm font-bold text-[#1a2d5a]">Child {i + 1}</p>
                      <Field label="Full legal name" required={i === 0}>
                        <input className={inputCls} value={c.name} placeholder="Alex Smith"
                          onChange={e => setChildren(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Date of birth">
                          <input type="date" className={inputCls} value={c.dob}
                            onChange={e => setChildren(prev => prev.map((x, j) => j === i ? { ...x, dob: e.target.value } : x))} />
                        </Field>
                        <Field label="Gender">
                          <select className={inputCls} value={c.gender}
                            onChange={e => setChildren(prev => prev.map((x, j) => j === i ? { ...x, gender: e.target.value } : x))}>
                            <option value="">Select…</option>
                            <option>Male</option><option>Female</option><option>Other</option>
                          </select>
                        </Field>
                      </div>
                    </div>
                  ))}
                  {!twoChildren ? (
                    <button type="button" onClick={() => { setTwoChildren(true); setChildren(prev => prev.length < 2 ? [...prev, { name: "", dob: "", gender: "" }] : prev); }}
                      className="text-sm font-medium text-[#1a2d5a] hover:text-[#c41e3a]">+ Add a second child</button>
                  ) : (
                    <button type="button" onClick={() => setTwoChildren(false)} className="text-sm font-medium text-gray-400 hover:text-gray-700">Remove second child</button>
                  )}
                  <Field label="Children's home address" required>
                    <input className={inputCls} value={childrenAddress} placeholder="123 Main St, Suwanee, GA 30024" onChange={e => setChildrenAddress(e.target.value)} />
                  </Field>
                </div>
              )}

              {/* Step 1 — Parents */}
              {step === 1 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-bold text-[#1a2d5a]">Parent / Guardian Contacts</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Parent email" required hint="Receipt + signed copy go here.">
                      <input type="email" className={inputCls} value={parentEmail} placeholder="jane@example.com" onChange={e => setParentEmail(e.target.value)} />
                    </Field>
                    <Field label="Primary phone" required>
                      <input type="tel" className={inputCls} value={primaryPhone} placeholder="(770) 555-0100" onChange={e => setPrimaryPhone(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Who has legal custody?">
                    <input className={inputCls} value={legalCustody} placeholder="e.g. Both parents / Mother / Father" onChange={e => setLegalCustody(e.target.value)} />
                  </Field>

                  <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <p className="text-sm font-bold text-[#1a2d5a]">Mother</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input className={inputCls} value={mother.name} placeholder="Name" onChange={e => setMother({ ...mother, name: e.target.value })} />
                      <input className={inputCls} value={mother.phone} placeholder="Phone" onChange={e => setMother({ ...mother, phone: e.target.value })} />
                      <input className={inputCls} value={mother.address} placeholder="Home address" onChange={e => setMother({ ...mother, address: e.target.value })} />
                      <input className={inputCls} value={mother.cellPhone} placeholder="Cell phone" onChange={e => setMother({ ...mother, cellPhone: e.target.value })} />
                      <input className={inputCls} value={mother.workPhone} placeholder="Work phone" onChange={e => setMother({ ...mother, workPhone: e.target.value })} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <p className="text-sm font-bold text-[#1a2d5a]">Father</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input className={inputCls} value={father.name} placeholder="Name" onChange={e => setFather({ ...father, name: e.target.value })} />
                      <input className={inputCls} value={father.phone} placeholder="Phone" onChange={e => setFather({ ...father, phone: e.target.value })} />
                      <input className={inputCls} value={father.address} placeholder="Home address" onChange={e => setFather({ ...father, address: e.target.value })} />
                      <input className={inputCls} value={father.cellPhone} placeholder="Cell phone" onChange={e => setFather({ ...father, cellPhone: e.target.value })} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">Fill in whichever guardians apply. Leave a section blank if it does not.</p>
                </div>
              )}

              {/* Step 2 — Pickup authorization */}
              {step === 2 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-bold text-[#1a2d5a]">Pick-Up Authorization</h2>
                  <p className="text-sm text-gray-600">
                    Your child will be released only to people you authorize here. These are the people allowed to pick up
                    your child if you cannot be reached.
                  </p>
                  {pickupAuth.map((p, i) => (
                    <div key={i} className="grid sm:grid-cols-2 gap-3">
                      <input className={inputCls} value={p.name} placeholder={`Authorized person ${i + 1} — full name`}
                        onChange={e => setPickupAuth(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <input className={inputCls} value={p.phone} placeholder="Phone #"
                        onChange={e => setPickupAuth(prev => prev.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} />
                    </div>
                  ))}
                  <Field label="Custodial parent or legal guardian" required>
                    <input className={inputCls} value={custodialGuardianName} placeholder="Full name" onChange={e => setCustodialGuardianName(e.target.value)} />
                  </Field>
                </div>
              )}

              {/* Step 3 — About the child */}
              {step === 3 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-bold text-[#1a2d5a]">Getting to Know Your Child</h2>
                  <Field label="Does your child have any special needs? (medications, allergies, physical limitations, etc.)">
                    <textarea className={inputCls} rows={3} value={specialNeeds} onChange={e => setSpecialNeeds(e.target.value)} />
                  </Field>
                  <YesNo label="Have you ever suspected or has your child ever had seizures?" value={hadSeizures} onChange={setHadSeizures} />
                  <YesNo label="Does your child have temper tantrums?" value={hasTantrums} onChange={setHasTantrums} />
                  {hasTantrums && (
                    <Field label="If yes, how are their temper tantrums handled?">
                      <textarea className={inputCls} rows={2} value={tantrumHandling} onChange={e => setTantrumHandling(e.target.value)} />
                    </Field>
                  )}
                </div>
              )}

              {/* Step 4 — Plan */}
              {step === 4 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-bold text-[#1a2d5a]">Plan & Schedule</h2>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Choose your plan <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(Object.entries(PLANS) as [Plan, typeof PLANS[Plan]][]).map(([key, p]) => (
                        <button key={key} type="button" onClick={() => setPlan(key)}
                          className={`text-left rounded-xl border-2 p-4 transition ${plan === key ? "border-[#c41e3a] bg-[#c41e3a]/5" : "border-gray-200 hover:border-gray-300"}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-[#1a2d5a] text-sm">{p.label}</span>
                            {plan === key && <CheckCircle2 className="w-4 h-4 text-[#c41e3a]" />}
                          </div>
                          <p className="text-xs text-gray-500 mb-2">{p.desc}</p>
                          <div className="flex gap-3 text-xs"><span className="font-semibold text-[#1a2d5a]">${p.weekly}/wk</span><span className="text-gray-400">·</span><span className="font-semibold text-[#1a2d5a]">${p.monthly}/mo</span></div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Which days will your child attend? <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map(d => (
                        <button key={d} type="button" onClick={() => toggleDay(d)}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${pickupDays.includes(d) ? "border-[#1a2d5a] bg-[#1a2d5a] text-white" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}>
                          {d.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Field label="Anticipated start date">
                    <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </Field>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">One-time fees (paid at the end)</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={includeUniform} onChange={e => setIncludeUniform(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-[#c41e3a] focus:ring-[#c41e3a]" />
                        <span className="text-sm text-gray-700">Uniform — <strong>$50</strong></span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={includeSupplyFee} onChange={e => setIncludeSupplyFee(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-[#c41e3a] focus:ring-[#c41e3a]" />
                        <span className="text-sm text-gray-700">Supply Fee (once/year) — <strong>$65</strong></span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5 — Waiver + signature */}
              {step === 5 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-bold text-[#1a2d5a]">Enrollment Agreement</h2>
                  <p className="text-sm text-gray-600">Please read each section and enter your initials to acknowledge it.</p>

                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2 border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                    {AFTERSCHOOL_WAIVER_SECTIONS.map(sec => (
                      <div key={sec.key} className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="font-bold text-[#1a2d5a] text-sm">{sec.title}</p>
                          <input
                            value={waiverInitials[sec.key] || ""}
                            onChange={e => setWaiverInitials(prev => ({ ...prev, [sec.key]: e.target.value.toUpperCase().slice(0, 5) }))}
                            placeholder="Initials"
                            className="w-20 shrink-0 border border-gray-300 rounded-md px-2 py-1.5 text-sm text-center uppercase focus:outline-none focus:ring-2 focus:ring-[#c41e3a]/40"
                          />
                        </div>
                        {sec.body.map((para, i) => (
                          <p key={i} className="text-xs text-gray-600 leading-relaxed mb-1.5">{para}</p>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Parent / guardian name" required>
                      <input className={inputCls} value={signedName} placeholder="Jane Smith" onChange={e => setSignedName(e.target.value)} />
                    </Field>
                    <Field label="Relationship to child">
                      <input className={inputCls} value={signedRelationship} placeholder="e.g. Mother" onChange={e => setSignedRelationship(e.target.value)} />
                    </Field>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Signature <span className="text-red-500">*</span></label>
                    <SignaturePad onChange={setSignaturePng} />
                  </div>

                  <p className="text-xs text-gray-400">Date: {todayIso}</p>

                  <label className="flex items-start gap-3 cursor-pointer bg-[#1a2d5a]/5 border border-[#1a2d5a]/15 rounded-lg p-3">
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#c41e3a] focus:ring-[#c41e3a]" />
                    <span className="text-sm text-gray-700">
                      I have read and agree to all policies above, and I understand that typing my initials and drawing my
                      signature has the same effect as signing on paper.
                    </span>
                  </label>
                </div>
              )}

              {/* Nav buttons */}
              <div className="flex items-center gap-3 mt-8">
                {step > 0 && (
                  <Button type="button" variant="outline" onClick={back} disabled={submitIntake.isPending} className="border-gray-300">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                )}
                <Button type="button" onClick={next} disabled={submitIntake.isPending}
                  className="flex-1 bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold">
                  {submitIntake.isPending ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Submitting…</>)
                    : step < 5 ? (<>Continue <ChevronRight className="w-4 h-4 ml-1" /></>)
                    : (<>Submit & Continue to Payment <ChevronRight className="w-4 h-4 ml-1" /></>)}
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Right: Info sidebar */}
        <div className="space-y-5">
          <Card className="bg-white border border-gray-200 shadow-sm p-5">
            <h3 className="font-bold text-[#1a2d5a] mb-4 text-base">What's Included</h3>
            <div className="space-y-3">
              {[
                { icon: <Clock className="w-4 h-4 text-[#c41e3a]" />, text: "Pick-up from school (transportation provided)" },
                { icon: <BookOpen className="w-4 h-4 text-[#c41e3a]" />, text: "Supervised homework completion" },
                { icon: <Award className="w-4 h-4 text-[#c41e3a]" />, text: "Daily TKD / Kickboxing training" },
                { icon: <Users className="w-4 h-4 text-[#c41e3a]" />, text: "Self-discipline, respect & leadership" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3"><div className="mt-0.5 flex-shrink-0">{item.icon}</div><p className="text-sm text-gray-700">{item.text}</p></div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600">
              <strong>Hours:</strong> 3:00 PM – 6:30 PM<br /><strong>Late pick-up:</strong> $5 per 5 min after 6:30 PM
            </div>
          </Card>

          {/* Live total */}
          <Card className="bg-[#1a2d5a] text-white border-0 shadow-sm p-5">
            <h3 className="font-bold mb-3 text-base">Due at Checkout</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-white/80">Registration</span><span className="font-semibold">${REGISTRATION}</span></div>
              {includeUniform && <div className="flex justify-between"><span className="text-white/80">Uniform</span><span className="font-semibold">${UNIFORM}</span></div>}
              {includeSupplyFee && <div className="flex justify-between"><span className="text-white/80">Supply fee</span><span className="font-semibold">${SUPPLY_FEE}</span></div>}
              {earlyBird && <div className="flex justify-between"><span className="text-yellow-200">1st month (50% off)</span><span className="font-semibold text-yellow-200">${earlyBirdDiscount}</span></div>}
              <div className="flex justify-between pt-2 mt-1 border-t border-white/20 text-base font-bold"><span>Total</span><span>{totalDisplay}</span></div>
            </div>
            <p className="text-white/60 text-xs mt-3">Monthly tuition is billed separately after enrollment.</p>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm p-5">
            <h3 className="font-bold text-[#1a2d5a] mb-2 text-base">Questions?</h3>
            <p className="text-sm text-gray-600 mb-3">Call or text us — we're happy to help.</p>
            <a href="tel:+17702773009" className="block text-[#c41e3a] font-semibold text-sm hover:underline">(770) 277-3009</a>
            <button onClick={goToTour} className="mt-3 text-sm text-[#1a2d5a] hover:text-[#c41e3a] transition font-medium underline underline-offset-2">Schedule a tour instead →</button>
          </Card>
        </div>
      </div>

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

// Yes/No radio pair
function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">{label} <span className="text-red-500">*</span></label>
      <div className="flex gap-3">
        {[{ v: true, t: "Yes" }, { v: false, t: "No" }].map(o => (
          <button key={o.t} type="button" onClick={() => onChange(o.v)}
            className={`px-5 py-2 rounded-lg border text-sm font-medium transition ${value === o.v ? "border-[#1a2d5a] bg-[#1a2d5a] text-white" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}>
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}
