import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2,
  Gift,
  Minus,
  Plus,
  Snowflake,
  Sparkles,
  Sun,
} from "lucide-react";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";
import { useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import {
  PRODUCTS,
  MARTIAL_ARTS_PROGRAMS,
  AFTERSCHOOL_PROGRAMS,
  DURATIONS,
  ADDITIONAL_KID_MONTHLY_DISCOUNT,
  MAX_ADDITIONAL_KIDS,
  formatMoney,
  roundMoney,
  productSalePrice,
  clampQuantity,
  getPackageSelection,
  getAdditionalKidSelection,
  type Product,
  type Program,
} from "../../../shared/christmasPricing";

const stripePromise = loadStripe(import.meta.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY);

// ─── Sale window ─────────────────────────────────────────────────────────────
const SALE_OPENS_AT = new Date("2026-07-13T00:00:00-04:00"); // July 13 midnight ET
const SALE_CLOSES_AT = new Date("2026-07-19T00:00:00-04:00"); // July 18 end ET

function useSaleCountdown() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const saleOpen = now >= SALE_OPENS_AT && now < SALE_CLOSES_AT;
  const saleEnded = now >= SALE_CLOSES_AT;
  const msUntilOpen = Math.max(0, SALE_OPENS_AT.getTime() - now.getTime());
  const days = Math.floor(msUntilOpen / 86400000);
  const hours = Math.floor((msUntilOpen % 86400000) / 3600000);
  const minutes = Math.floor((msUntilOpen % 3600000) / 60000);
  const seconds = Math.floor((msUntilOpen % 60000) / 1000);
  return { saleOpen, saleEnded, days, hours, minutes, seconds };
}

const ADDITIONAL_KID_COUNT_OPTIONS = Array.from(
  { length: MAX_ADDITIONAL_KIDS + 1 },
  (_, index) => index
);

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
  const confirm = trpc.christmas.confirm.useMutation();

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/christmas-in-july` },
      redirect: "if_required",
    });
    if (error) {
      toast.error(error.message ?? "Payment failed. Please try again.");
      setIsProcessing(false);
      return;
    }
    // Card is charged at this point. Confirm records it; if this call fails the
    // lead still exists tagged with the pending note, so the order is never lost.
    try {
      await confirm.mutateAsync({ paymentIntentId });
    } catch (err) {
      console.error(err);
    }
    onSuccess();
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <PaymentElement />
      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-lg"
      >
        {isProcessing ? "Processing..." : `Pay ${total}`}
      </Button>
      <p className="text-center text-xs text-slate-400">Secured by Stripe. Top Martial Arts Suwanee.</p>
    </form>
  );
}

function getUtmParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    utmSource: p.get("utm_source") ?? undefined,
    utmMedium: p.get("utm_medium") ?? undefined,
    utmCampaign: p.get("utm_campaign") ?? undefined,
    utmContent: p.get("utm_content") ?? undefined,
  };
}


export default function ChristmasInJuly() {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [maProgram, setMaProgram] = useState("");
  const [maDuration, setMaDuration] = useState<3 | 6 | null>(null);
  const [afterschoolProgram, setAfterschoolProgram] = useState("");
  const [afterschoolDuration, setAfterschoolDuration] = useState<3 | 6 | null>(
    null
  );
  const [afterschoolAdditionalKids, setAfterschoolAdditionalKids] = useState(0);
  const [additionalKidNames, setAdditionalKidNames] = useState<string[]>([]);
  const [privateLessons, setPrivateLessons] = useState(false);
  const [beltTesting, setBeltTesting] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [parentName, setParentName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const startedRef = useRef(false);

  const createIntent = trpc.christmas.createIntent.useMutation();
  const utm = useMemo(() => getUtmParams(), []);
  const { saleOpen, saleEnded, days, hours, minutes, seconds } = useSaleCountdown();

  const proShopSelections = useMemo(
    () =>
      PRODUCTS.map(product => {
        const quantity = quantities[product.key] ?? 0;
        const discountedPrice = productSalePrice(product);
        return {
          ...product,
          quantity,
          salePrice: discountedPrice,
          lineTotal: roundMoney(discountedPrice * quantity),
        };
      }).filter(product => product.quantity > 0),
    [quantities]
  );

  const maSelection = useMemo(
    () => getPackageSelection(MARTIAL_ARTS_PROGRAMS, maProgram, maDuration),
    [maProgram, maDuration]
  );

  const afterschoolSelection = useMemo(
    () =>
      getPackageSelection(
        AFTERSCHOOL_PROGRAMS,
        afterschoolProgram,
        afterschoolDuration
      ),
    [afterschoolProgram, afterschoolDuration]
  );

  const afterschoolAdditionalKidSelection = useMemo(
    () =>
      afterschoolAdditionalKids > 0
        ? getAdditionalKidSelection(
            AFTERSCHOOL_PROGRAMS,
            afterschoolProgram,
            afterschoolDuration
          )
        : null,
    [afterschoolAdditionalKids, afterschoolProgram, afterschoolDuration]
  );

  function setAdditionalKidCount(count: number) {
    setAfterschoolAdditionalKids(count);
    setAdditionalKidNames(current => {
      const next = current.slice(0, count);
      while (next.length < count) next.push("");
      return next;
    });
  }

  function updateAdditionalKidName(index: number, name: string) {
    setAdditionalKidNames(current => {
      const next = [...current];
      next[index] = name;
      return next;
    });
  }

  const orderTotal = useMemo(() => {
    const proShopTotal = proShopSelections.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    );
    const maTotal = maSelection?.saleTotal ?? 0;
    const afterschoolTotal =
      (afterschoolSelection?.saleTotal ?? 0) +
      (afterschoolAdditionalKidSelection?.saleTotal ?? 0) * afterschoolAdditionalKids;
    const privateLessonTotal = privateLessons ? 200 : 0;
    const beltTestingTotal = beltTesting ? 250 : 0;
    return roundMoney(
      proShopTotal +
        maTotal +
        afterschoolTotal +
        privateLessonTotal +
        beltTestingTotal
    );
  }, [
    afterschoolSelection,
    afterschoolAdditionalKidSelection,
    afterschoolAdditionalKids,
    beltTesting,
    maSelection,
    privateLessons,
    proShopSelections,
  ]);

  const hasOrderItems =
    proShopSelections.length > 0 ||
    Boolean(maSelection) ||
    Boolean(afterschoolSelection) ||
    privateLessons ||
    beltTesting;

  function updateQuantity(productKey: string, delta: number) {
    setQuantities(current => ({
      ...current,
      [productKey]: clampQuantity((current[productKey] ?? 0) + delta),
    }));
  }

  function buildOrderSummaryText() {
    const lines = [
      "Christmas in July Sale order request",
      "Sale dates: July 13-17, 2026",
      "",
      "Selected items:",
    ];

    if (!hasOrderItems) {
      lines.push("No sale items selected.");
    }

    proShopSelections.forEach(item => {
      lines.push(
        `Pro shop: ${item.name} x ${item.quantity} at ${formatMoney(item.salePrice)} each = ${formatMoney(item.lineTotal)}`
      );
    });

    if (maSelection) {
      lines.push(
        `Martial arts package: ${maSelection.program.name}, ${maSelection.duration.label}, regular ${formatMoney(maSelection.regularTotal)}, sale ${formatMoney(maSelection.saleTotal)}, save ${formatMoney(maSelection.savings)}`
      );
    }

    if (afterschoolSelection) {
      lines.push(
        `Afterschool package: ${afterschoolSelection.program.name}, ${afterschoolSelection.duration.label}, regular ${formatMoney(afterschoolSelection.regularTotal)}, sale ${formatMoney(afterschoolSelection.saleTotal)}, save ${formatMoney(afterschoolSelection.savings)}`
      );
    }

    if (afterschoolAdditionalKidSelection && afterschoolAdditionalKids > 0) {
      const names = additionalKidNames
        .map((name, index) => name.trim() || `child ${index + 2}`)
        .join(", ");
      lines.push(
        `Afterschool additional children (${afterschoolAdditionalKids}: ${names}): ${afterschoolAdditionalKidSelection.program.name} at discounted rate ${formatMoney(afterschoolAdditionalKidSelection.monthlyPrice)}/mo each, ${afterschoolAdditionalKidSelection.duration.label}, regular ${formatMoney(afterschoolAdditionalKidSelection.regularTotal * afterschoolAdditionalKids)}, sale ${formatMoney(afterschoolAdditionalKidSelection.saleTotal * afterschoolAdditionalKids)}, save ${formatMoney(afterschoolAdditionalKidSelection.savings * afterschoolAdditionalKids)}`
      );
    }

    if (privateLessons) {
      lines.push(
        "Private lessons bundle: Bundle of 5 Private Lessons, regular $375.00, sale $200.00, save $175.00"
      );
    }

    if (beltTesting) {
      lines.push(
        "Belt testing bundle: Buy 5 Get 1 Free, 6 tests total, regular value $300.00, sale $250.00, save $50.00"
      );
    }

    lines.push("");
    lines.push(`Grand total: ${formatMoney(orderTotal)}`);

    if (notes.trim()) {
      lines.push("");
      lines.push(`Customer notes: ${notes.trim()}`);
    }

    return lines.join("\n");
  }

  /**
   * Start checkout. We send only the raw selections (no prices): the server
   * recomputes the amount from shared/christmasPricing and returns a Stripe
   * client secret. It also creates the lead up front (payment PENDING) so an
   * order is never invisible if the customer drops off mid-payment.
   */
  async function startCheckout() {
    if (!studentName.trim() || !parentName.trim() || !phone.trim()) {
      toast.error("Please fill in student name, parent name, and phone.");
      return;
    }

    if (!hasOrderItems) {
      toast.error("Please select at least one Christmas in July deal.");
      return;
    }

    if (!smsConsent) {
      toast.error(
        "Please agree to receive SMS updates so we can confirm your order."
      );
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;
    setIsSubmitting(true);

    try {
      const r = await createIntent.mutateAsync({
        selections: {
          quantities,
          maProgram: maProgram || null,
          maDuration: maDuration,
          afterschoolProgram: afterschoolProgram || null,
          afterschoolDuration: afterschoolDuration,
          afterschoolAdditionalKids: afterschoolAdditionalKids,
          additionalKidNames: additionalKidNames,
          privateLessons,
          beltTesting,
        },
        studentName: studentName.trim(),
        parentName: parentName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        notes: notes.trim() || undefined,
        smsConsentText: SMS_CONSENT_TEXT,
        ...utm,
      });

      setClientSecret(r.clientSecret ?? null);
      setPaymentIntentId(r.paymentIntentId);
      window.scrollTo(0, 0);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Could not start checkout. Please try again.");
      startedRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#1a2d5a] flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 bg-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-11 h-11 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">
          {saleOpen ? "Payment received! 🎄" : "You're on the list! 🎅"}
        </h1>
        <p className="text-white/75 max-w-sm">
          {saleOpen
            ? "Your order is paid and confirmed. Stripe emailed you a receipt. We'll contact you within 24 hours to arrange pickup of your items."
            : "The sale opens July 13. We'll reach out then to lock in your deal and take payment. No charge until the sale starts!"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="bg-[#1a2d5a] text-white">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center font-bold text-sm">
              TMA
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">
                Top Martial Arts Suwanee
              </p>
              <p className="text-xs text-white/65">Christmas in July Sale</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold bg-white/10 border border-white/15 px-3 py-2 rounded-lg">
            <Gift className="w-4 h-4" />
            July 13-17, 2026 Only
          </div>
        </div>
      </header>

      <main>
        <section className="bg-[#1a2d5a] text-white px-4 pt-8 pb-12 relative overflow-hidden">
          <div className="absolute right-4 top-6 hidden sm:flex gap-3 text-white/20">
            <Snowflake className="w-16 h-16" />
            <Sun className="w-16 h-16" />
          </div>
          <div className="max-w-6xl mx-auto relative">
            <div className="inline-flex items-center gap-2 bg-[#c41e3a] text-white rounded-lg px-3 py-2 text-sm font-bold mb-5">
              <Sparkles className="w-4 h-4" />
              Week of July 13-17, 2026
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight max-w-3xl">
              Christmas in July Sale
            </h1>
            <p className="text-xl sm:text-2xl text-white mt-3 font-semibold">
              July 13-17, 2026 Only
            </p>
            <p className="text-white/75 text-base sm:text-lg max-w-2xl mt-4 leading-relaxed">
              One week only. Pre-order pro shop items, lock in bulk tuition
              savings, and grab our exclusive bundles.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <div className="bg-white/10 border border-white/15 rounded-lg px-4 py-3 flex items-center gap-2">
                <Snowflake className="w-5 h-5 text-white" />
                <span className="text-sm font-semibold">Holiday savings</span>
              </div>
              <div className="bg-white/10 border border-white/15 rounded-lg px-4 py-3 flex items-center gap-2">
                <Sun className="w-5 h-5 text-white" />
                <span className="text-sm font-semibold">Summer timing</span>
              </div>
              <div className="bg-white/10 border border-white/15 rounded-lg px-4 py-3 flex items-center gap-2">
                <Gift className="w-5 h-5 text-white" />
                <span className="text-sm font-semibold">
                  Limited week deals
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 space-y-10">
          <section className="space-y-5">
            <div>
              <p className="text-sm font-bold text-[#c41e3a] uppercase tracking-wide">
                Pro Shop
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#1a2d5a] mt-1">
                20% Off
              </h2>
              <p className="text-slate-600 mt-2 max-w-3xl">
                20% off all pro shop items. Sparring gear excluded. Limited
                quantities, pre-order to lock in your deal.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PRODUCTS.map(product => {
                const quantity = quantities[product.key] ?? 0;
                const discountedPrice = productSalePrice(product);

                return (
                  <article
                    key={product.key}
                    className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden"
                  >
                    <div className="h-36 bg-white flex items-center justify-center px-4 text-center border-b border-slate-100">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          loading="lazy"
                          className="max-h-32 max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-slate-400 font-semibold text-sm">
                          {product.name}
                        </span>
                      )}
                    </div>
                    <div className="p-4 space-y-4">
                      <div>
                        <h3 className="font-bold text-[#1a2d5a]">
                          {product.name}
                        </h3>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-sm text-slate-500 line-through">
                            {formatMoney(product.price)}
                          </span>
                          <span className="text-lg font-bold text-[#c41e3a]">
                            {formatMoney(discountedPrice)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-lg"
                          onClick={() => updateQuantity(product.key, -1)}
                          disabled={quantity === 0}
                        >
                          <Minus className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                        <span className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-[#1a2d5a]">
                          {quantity}
                        </span>
                        <Button
                          type="button"
                          className="h-10 bg-[#1a2d5a] hover:bg-[#142449] text-white rounded-lg"
                          onClick={() => updateQuantity(product.key, 1)}
                          disabled={quantity === 5}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="space-y-6">
            <div>
              <p className="text-sm font-bold text-[#c41e3a] uppercase tracking-wide">
                Tuition Bulk Packages
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#1a2d5a] mt-1">
                Lock In Tuition Savings
              </h2>
            </div>

            <TuitionGroup
              title="Martial Arts Programs"
              programs={MARTIAL_ARTS_PROGRAMS}
              selectedProgram={maProgram}
              selectedDuration={maDuration}
              onProgramChange={setMaProgram}
              onDurationChange={setMaDuration}
              selection={maSelection}
            />

            <TuitionGroup
              title="Afterschool Program"
              subtitle="🎁 During the sale: registration fee waived, supply fee waived & free uniform included with enrollment!"
              programs={AFTERSCHOOL_PROGRAMS}
              selectedProgram={afterschoolProgram}
              selectedDuration={afterschoolDuration}
              onProgramChange={setAfterschoolProgram}
              onDurationChange={setAfterschoolDuration}
              selection={afterschoolSelection}
              allowAdditionalKids
              additionalKidCount={afterschoolAdditionalKids}
              onAdditionalKidCountChange={setAdditionalKidCount}
              additionalKidSelection={afterschoolAdditionalKidSelection}
              additionalKidNames={additionalKidNames}
              onAdditionalKidNameChange={updateAdditionalKidName}
            />
          </section>

          <section className="grid lg:grid-cols-2 gap-4">
            <BundleToggleCard
              title="Bundle of 5 Private Lessons"
              detail="4 private lessons + 1 free lesson. Regular: $75.00/lesson x 5 = $375.00"
              sale="Sale price: $200.00"
              savings="You save: $175.00"
              checked={privateLessons}
              onChange={setPrivateLessons}
            />

            <BundleToggleCard
              title="Belt Testing Bundle, Buy 5 Get 1 Free"
              detail="6 belt tests total, pay for 5. $50.00 per test x 5 = $250.00 total."
              sale="Value: $300.00 for 6 tests"
              savings="Save $50.00"
              checked={beltTesting}
              onChange={setBeltTesting}
            />
          </section>

          <section className="grid lg:grid-cols-[1fr_420px] gap-6 items-start">
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 sm:p-6 space-y-5">
              <div>
                <p className="text-sm font-bold text-[#c41e3a] uppercase tracking-wide">
                  Claim Your Deal
                </p>
                <h2 className="text-2xl font-bold text-[#1a2d5a] mt-1">
                  Contact Form
                </h2>
              </div>

              {hasOrderItems ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-700 font-medium mb-1.5 block">
                        Student name <span className="text-[#c41e3a]">*</span>
                      </Label>
                      <Input
                        value={studentName}
                        onChange={e => setStudentName(e.target.value)}
                        placeholder="Student full name"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700 font-medium mb-1.5 block">
                        Parent/guardian name{" "}
                        <span className="text-[#c41e3a]">*</span>
                      </Label>
                      <Input
                        value={parentName}
                        onChange={e => setParentName(e.target.value)}
                        placeholder="Parent or guardian"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700 font-medium mb-1.5 block">
                        Phone <span className="text-[#c41e3a]">*</span>
                      </Label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="(770) 555-1234"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700 font-medium mb-1.5 block">
                        Email (optional)
                      </Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@email.com"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-slate-700 font-medium mb-1.5 block">
                      Notes (optional)
                    </Label>
                    <Textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Anything the staff should know before confirming your order?"
                      className="min-h-24"
                    />
                  </div>

                  <label className="flex items-start gap-3 p-4 bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-lg cursor-pointer hover:bg-[#1a2d5a]/10 transition-colors">
                    <Checkbox
                      checked={smsConsent}
                      onCheckedChange={v => setSmsConsent(v === true)}
                      className="mt-0.5 h-5 w-5 border-2 border-[#1a2d5a]/50 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0"
                    />
                    <span className="text-xs text-slate-700 leading-relaxed min-w-0 break-words">
                      <span className="font-semibold block mb-1 text-sm">
                        Text me order confirmation and updates{" "}
                        <span className="text-[#c41e3a]">*</span>
                      </span>
                      {SMS_CONSENT_TEXT}
                    </span>
                  </label>

                  {!saleOpen && !saleEnded && (
                    <div className="rounded-lg bg-[#1a2d5a] text-white p-4 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-1">Sale opens in</p>
                      <div className="flex justify-center gap-3 text-2xl font-bold tabular-nums">
                        <span>{String(days).padStart(2,"0")}d</span>
                        <span>{String(hours).padStart(2,"0")}h</span>
                        <span>{String(minutes).padStart(2,"0")}m</span>
                        <span>{String(seconds).padStart(2,"0")}s</span>
                      </div>
                      <p className="text-xs text-white/50 mt-1">July 13, 2026 at midnight ET</p>
                    </div>
                  )}
                  {saleEnded && (
                    <div className="rounded-lg bg-slate-200 text-slate-500 p-4 text-center text-sm font-semibold">
                      This sale has ended. See you next time! 🎄
                    </div>
                  )}
                  {clientSecret && paymentIntentId ? (
                    <div className="rounded-lg border-2 border-[#c41e3a]/30 bg-white p-4 space-y-4">
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-bold text-[#1a2d5a]">Payment</p>
                        <p className="text-2xl font-extrabold text-[#1a2d5a]">{formatMoney(orderTotal)}</p>
                      </div>
                      <Elements
                        stripe={stripePromise}
                        options={{ clientSecret, appearance: { theme: "stripe" } }}
                      >
                        <PaymentForm
                          paymentIntentId={paymentIntentId}
                          total={formatMoney(orderTotal)}
                          onSuccess={() => { setSubmitted(true); window.scrollTo(0, 0); }}
                        />
                      </Elements>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={startCheckout}
                      disabled={isSubmitting || saleEnded}
                      className={`w-full text-white text-base font-semibold h-12 rounded-lg transition ${
                        saleOpen
                          ? "bg-[#c41e3a] hover:bg-[#a81830]"
                          : "bg-slate-400 cursor-not-allowed"
                      }`}
                    >
                      {isSubmitting
                        ? "Starting checkout..."
                        : saleEnded
                        ? "Sale Ended"
                        : saleOpen
                        ? `Continue to payment · ${formatMoney(orderTotal)}`
                        : "Pre-Register, Locked Until July 13"}
                    </Button>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                  Select at least one Christmas in July deal above to open the
                  contact form.
                </div>
              )}
            </div>

            <OrderSummary
              proShopSelections={proShopSelections}
              maSelection={maSelection}
              afterschoolSelection={afterschoolSelection}
              afterschoolAdditionalKidSelection={afterschoolAdditionalKidSelection}
              afterschoolAdditionalKids={afterschoolAdditionalKids}
              additionalKidNames={additionalKidNames}
              privateLessons={privateLessons}
              beltTesting={beltTesting}
              orderTotal={orderTotal}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

function TuitionGroup({
  title,
  subtitle,
  programs,
  selectedProgram,
  selectedDuration,
  onProgramChange,
  onDurationChange,
  selection,
  allowAdditionalKids = false,
  additionalKidCount = 0,
  onAdditionalKidCountChange,
  additionalKidSelection = null,
  additionalKidNames = [],
  onAdditionalKidNameChange,
}: {
  title: string;
  subtitle?: string;
  programs: Program[];
  selectedProgram: string;
  selectedDuration: 3 | 6 | null;
  onProgramChange: (program: string) => void;
  onDurationChange: (months: 3 | 6) => void;
  selection: ReturnType<typeof getPackageSelection>;
  allowAdditionalKids?: boolean;
  additionalKidCount?: number;
  onAdditionalKidCountChange?: (count: number) => void;
  additionalKidSelection?: ReturnType<typeof getAdditionalKidSelection>;
  additionalKidNames?: string[];
  onAdditionalKidNameChange?: (index: number, name: string) => void;
}) {
  const showAdditionalKidTotals = Boolean(additionalKidCount > 0 && additionalKidSelection);
  const combinedRegularTotal = selection
    ? selection.regularTotal + (showAdditionalKidTotals ? additionalKidSelection!.regularTotal * additionalKidCount : 0)
    : null;
  const combinedSaleTotal = selection
    ? selection.saleTotal + (showAdditionalKidTotals ? additionalKidSelection!.saleTotal * additionalKidCount : 0)
    : null;
  const combinedSavings = selection
    ? selection.savings + (showAdditionalKidTotals ? additionalKidSelection!.savings * additionalKidCount : 0)
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-[#1a2d5a]">{title}</h3>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">
          Select a program
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {programs.map(program => {
            const active = selectedProgram === program.key;

            return (
              <label
                key={program.key}
                className={`border-2 rounded-lg p-4 transition-colors ${
                  active
                    ? "border-[#1a2d5a] bg-[#1a2d5a]/5"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name={`${title}-program`}
                  value={program.key}
                  checked={active}
                  onChange={() => onProgramChange(program.key)}
                  className="sr-only"
                />
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-semibold text-slate-950">
                      {program.name}
                    </span>
                    <span className="block text-sm text-slate-500 mt-1">
                      {formatMoney(program.monthlyPrice)}/mo
                    </span>
                  </span>
                  <span
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      active ? "border-[#1a2d5a]" : "border-slate-300"
                    }`}
                  >
                    {active && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1a2d5a]" />
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">
          Select package duration
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {DURATIONS.map(duration => {
            const active = selectedDuration === duration.months;

            return (
              <label
                key={duration.months}
                className={`border-2 rounded-lg p-4 transition-colors ${
                  active
                    ? "border-[#c41e3a] bg-[#c41e3a]/5"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name={`${title}-duration`}
                  value={duration.months}
                  checked={active}
                  onChange={() => onDurationChange(duration.months)}
                  className="sr-only"
                />
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-semibold text-slate-950">
                      {duration.label}
                    </span>
                    <span className="block text-sm text-slate-500 mt-1">
                      {Math.round(duration.discount * 100)}% off total
                    </span>
                  </span>
                  <span
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      active ? "border-[#c41e3a]" : "border-slate-300"
                    }`}
                  >
                    {active && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#c41e3a]" />
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {allowAdditionalKids && selection && (
        <div className="border-t border-slate-200 pt-5">
          <Label className="text-slate-700 font-medium mb-1.5 block">
            Additional children enrolling on this same program
          </Label>
          <p className="text-sm text-slate-500 mb-3">
            Each additional child gets ${ADDITIONAL_KID_MONTHLY_DISCOUNT}/month off the original tuition, then the{" "}
            {Math.round((DURATIONS.find(d => d.months === selectedDuration)?.discount ?? 0) * 100)}% package discount
            applies on top of that discounted rate for every additional child.
          </p>
          <select
            value={additionalKidCount}
            onChange={e => onAdditionalKidCountChange?.(Number(e.target.value))}
            className="w-full sm:w-56 border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-950 focus:outline-none focus:border-[#1a2d5a]"
          >
            {ADDITIONAL_KID_COUNT_OPTIONS.map(count => (
              <option key={count} value={count}>
                {count === 0 ? "No additional children" : `+${count} additional ${count === 1 ? "child" : "children"}`}
              </option>
            ))}
          </select>

          {additionalKidCount > 0 && (
            <div className="mt-4 space-y-3">
              {additionalKidSelection && (
                <p className="text-sm text-slate-600">
                  Each additional child's discounted monthly rate:{" "}
                  <span className="font-semibold text-[#1a2d5a]">
                    {formatMoney(additionalKidSelection.monthlyPrice)}/mo
                  </span>{" "}
                  (${ADDITIONAL_KID_MONTHLY_DISCOUNT} off {formatMoney(selection.program.monthlyPrice)}/mo)
                </p>
              )}
              {Array.from({ length: additionalKidCount }, (_, index) => (
                <div key={index}>
                  <Label className="text-slate-700 font-medium mb-1.5 block">
                    Additional child #{index + 1} name
                  </Label>
                  <Input
                    value={additionalKidNames[index] ?? ""}
                    onChange={e => onAdditionalKidNameChange?.(index, e.target.value)}
                    placeholder="Child's full name"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        {selection ? (
          <div className="grid sm:grid-cols-3 gap-3">
            <TotalStat
              label="Regular total"
              value={formatMoney(combinedRegularTotal ?? selection.regularTotal)}
            />
            <TotalStat
              label="Sale total"
              value={formatMoney(combinedSaleTotal ?? selection.saleTotal)}
              highlight
            />
            <TotalStat
              label="You save"
              value={formatMoney(combinedSavings ?? selection.savings)}
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Select a program and package duration to see your savings.
          </p>
        )}
        {showAdditionalKidTotals && (
          <p className="text-xs text-slate-500 mt-3">
            Includes 1st child at {formatMoney(selection!.saleTotal)} + {additionalKidCount}{" "}
            additional {additionalKidCount === 1 ? "child" : "children"} at{" "}
            {formatMoney(additionalKidSelection!.saleTotal)} each (
            {formatMoney(additionalKidSelection!.saleTotal * additionalKidCount)} total).
          </p>
        )}
      </div>
    </div>
  );
}

function TotalStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">
        {label}
      </p>
      <p
        className={`text-xl font-bold mt-1 ${highlight ? "text-[#c41e3a]" : "text-[#1a2d5a]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function BundleToggleCard({
  title,
  detail,
  sale,
  savings,
  checked,
  onChange,
}: {
  title: string;
  detail: string;
  sale: string;
  savings: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <article
      className={`bg-white border-2 rounded-lg shadow-sm p-5 sm:p-6 ${checked ? "border-[#c41e3a]" : "border-slate-200"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-[#1a2d5a]">{title}</h3>
          <p className="text-sm text-slate-600 mt-3">{detail}</p>
          <p className="text-lg font-bold text-[#c41e3a] mt-2">{sale}</p>
          <p className="text-sm font-semibold text-slate-700 mt-1">{savings}</p>
        </div>
        <label className="flex flex-col items-center gap-2 text-xs font-semibold text-slate-600">
          <Checkbox
            checked={checked}
            onCheckedChange={v => onChange(v === true)}
            className="h-7 w-7 border-2 border-[#1a2d5a]/50 data-[state=checked]:bg-[#c41e3a] data-[state=checked]:border-[#c41e3a]"
          />
          Add
        </label>
      </div>
    </article>
  );
}

function OrderSummary({
  proShopSelections,
  maSelection,
  afterschoolSelection,
  afterschoolAdditionalKidSelection,
  afterschoolAdditionalKids,
  additionalKidNames,
  privateLessons,
  beltTesting,
  orderTotal,
}: {
  proShopSelections: Array<
    Product & { quantity: number; salePrice: number; lineTotal: number }
  >;
  maSelection: ReturnType<typeof getPackageSelection>;
  afterschoolSelection: ReturnType<typeof getPackageSelection>;
  afterschoolAdditionalKidSelection: ReturnType<typeof getAdditionalKidSelection>;
  afterschoolAdditionalKids: number;
  additionalKidNames: string[];
  privateLessons: boolean;
  beltTesting: boolean;
  orderTotal: number;
}) {
  const isEmpty =
    proShopSelections.length === 0 &&
    !maSelection &&
    !afterschoolSelection &&
    !privateLessons &&
    !beltTesting;

  return (
    <aside className="bg-[#1a2d5a] text-white rounded-lg shadow-sm p-5 sm:p-6 lg:sticky lg:top-6">
      <h2 className="text-2xl font-bold">Order Summary</h2>
      <p className="text-white/65 text-sm mt-1">Sale week: July 13-17, 2026</p>

      <div className="mt-5 space-y-4">
        {isEmpty && (
          <div className="border border-white/15 rounded-lg p-4 text-sm text-white/70">
            Your selected deals will appear here.
          </div>
        )}

        {proShopSelections.map(item => (
          <SummaryRow
            key={item.key}
            title={`${item.name} x ${item.quantity}`}
            detail={`${formatMoney(item.salePrice)} each`}
            amount={formatMoney(item.lineTotal)}
          />
        ))}

        {maSelection && (
          <SummaryRow
            title={maSelection.program.name}
            detail={`${maSelection.duration.label}, save ${formatMoney(maSelection.savings)}`}
            amount={formatMoney(maSelection.saleTotal)}
          />
        )}

        {afterschoolSelection && (
          <SummaryRow
            title="Afterschool Program"
            detail={`${afterschoolSelection.program.name}, ${afterschoolSelection.duration.label}`}
            amount={formatMoney(afterschoolSelection.saleTotal)}
          />
        )}

        {afterschoolAdditionalKidSelection && afterschoolAdditionalKids > 0 && (
          <SummaryRow
            title={`Afterschool, +${afterschoolAdditionalKids} additional ${afterschoolAdditionalKids === 1 ? "child" : "children"}`}
            detail={`${additionalKidNames.filter(n => n.trim()).join(", ") || "names not provided"} — ${afterschoolAdditionalKidSelection.program.name} at ${formatMoney(afterschoolAdditionalKidSelection.monthlyPrice)}/mo each, ${afterschoolAdditionalKidSelection.duration.label}`}
            amount={formatMoney(afterschoolAdditionalKidSelection.saleTotal * afterschoolAdditionalKids)}
          />
        )}

        {privateLessons && (
          <SummaryRow
            title="Bundle of 5 Private Lessons"
            detail="Save $175.00"
            amount="$200.00"
          />
        )}

        {beltTesting && (
          <SummaryRow
            title="Belt Testing Bundle"
            detail="Buy 5 Get 1 Free"
            amount="$250.00"
          />
        )}
      </div>

      <div className="border-t border-white/15 mt-5 pt-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-white/65">Grand total</p>
          <p className="text-xs text-white/45 mt-1">
            Paid securely online. Staff will confirm pickup.
          </p>
        </div>
        <p className="text-3xl font-bold">{formatMoney(orderTotal)}</p>
      </div>
    </aside>
  );
}

function SummaryRow({
  title,
  detail,
  amount,
}: {
  title: string;
  detail: string;
  amount: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border border-white/15 rounded-lg p-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-white/60 mt-1">{detail}</p>
      </div>
      <p className="font-bold text-right">{amount}</p>
    </div>
  );
}
