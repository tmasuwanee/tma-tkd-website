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

type Product = {
  key: string;
  name: string;
  price: number;
};

type Program = {
  key: string;
  name: string;
  monthlyPrice: number;
};

type DurationOption = {
  months: 3 | 6;
  label: string;
  discount: number;
};

const PRODUCTS: Product[] = [
  { key: "uniform", name: "Taekwondo Uniform", price: 65 },
  { key: "kicking-paddle", name: "Kicking Paddle", price: 28 },
  { key: "nunchucks", name: "Nunchucks", price: 22 },
  { key: "belt-rack", name: "Belt Rack", price: 35 },
];

const MARTIAL_ARTS_PROGRAMS: Program[] = [
  { key: "tkd-2x", name: "Taekwondo 2x/week", monthlyPrice: 179 },
  { key: "tkd-3x", name: "Taekwondo 3x/week", monthlyPrice: 199 },
  { key: "kickboxing", name: "Kickboxing", monthlyPrice: 159 },
  { key: "bjj", name: "Brazilian Jiu-Jitsu (BJJ)", monthlyPrice: 159 },
];

const AFTERSCHOOL_PROGRAMS: Program[] = [
  { key: "afterschool-5", name: "Afterschool 5 days/week", monthlyPrice: 540 },
  { key: "afterschool-3", name: "Afterschool 3 days/week", monthlyPrice: 500 },
];

const DURATIONS: DurationOption[] = [
  { months: 3, label: "3-Month Package", discount: 0.05 },
  { months: 6, label: "6-Month Package", discount: 0.1 },
];

function getUtmParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    utmSource: p.get("utm_source") ?? undefined,
    utmMedium: p.get("utm_medium") ?? undefined,
    utmCampaign: p.get("utm_campaign") ?? undefined,
    utmContent: p.get("utm_content") ?? undefined,
  };
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function salePrice(price: number) {
  return roundMoney(price * 0.8);
}

function clampQuantity(value: number) {
  return Math.max(0, Math.min(5, value));
}

function getPackageSelection(
  programs: Program[],
  programKey: string,
  months: 3 | 6 | null
) {
  const program = programs.find(item => item.key === programKey);
  const duration = DURATIONS.find(item => item.months === months);

  if (!program || !duration) return null;

  const regularTotal = roundMoney(program.monthlyPrice * duration.months);
  const saleTotal = roundMoney(regularTotal * (1 - duration.discount));
  const savings = roundMoney(regularTotal - saleTotal);

  return { program, duration, regularTotal, saleTotal, savings };
}

export default function ChristmasInJuly() {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [maProgram, setMaProgram] = useState("");
  const [maDuration, setMaDuration] = useState<3 | 6 | null>(null);
  const [afterschoolProgram, setAfterschoolProgram] = useState("");
  const [afterschoolDuration, setAfterschoolDuration] = useState<3 | 6 | null>(
    null
  );
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

  const submit = trpc.leads.submit.useMutation();
  const utm = useMemo(() => getUtmParams(), []);

  const proShopSelections = useMemo(
    () =>
      PRODUCTS.map(product => {
        const quantity = quantities[product.key] ?? 0;
        const discountedPrice = salePrice(product.price);
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

  const orderTotal = useMemo(() => {
    const proShopTotal = proShopSelections.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    );
    const maTotal = maSelection?.saleTotal ?? 0;
    const afterschoolTotal = afterschoolSelection?.saleTotal ?? 0;
    const privateLessonTotal = privateLessons ? 250 : 0;
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

    if (privateLessons) {
      lines.push(
        "Private lessons bundle: Bundle of 5 Private Lessons, regular $300.00, sale $250.00, save $50.00"
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

  function getProgramInterest() {
    if (maSelection && afterschoolSelection) return "Multiple";
    if (maSelection) return maSelection.program.name;
    if (afterschoolSelection) return "Afterschool";
    if (proShopSelections.length > 0) return "Pro Shop";
    return "Christmas in July Sale";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

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

    setIsSubmitting(true);

    try {
      await submit.mutateAsync({
        parentName: parentName.trim(),
        kidName: studentName.trim(),
        kidAge: "",
        programInterest: getProgramInterest(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        additionalNotes: buildOrderSummaryText(),
        tags: ["christmas_july_2026"],
        smsConsent: true,
        smsConsentText: SMS_CONSENT_TEXT,
        ...utm,
      });

      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
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
          Your order is reserved!
        </h1>
        <p className="text-white/75 max-w-sm">
          We'll contact you within 24 hours to confirm and process payment.
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

        <form
          onSubmit={handleSubmit}
          className="max-w-6xl mx-auto px-4 py-8 sm:py-12 space-y-10"
        >
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
                const discountedPrice = salePrice(product.price);

                return (
                  <article
                    key={product.key}
                    className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden"
                  >
                    <div className="h-36 bg-slate-200 flex items-center justify-center px-4 text-center">
                      <span className="text-slate-500 font-semibold text-sm">
                        {product.name}
                      </span>
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
              subtitle="Subject to change"
              programs={AFTERSCHOOL_PROGRAMS}
              selectedProgram={afterschoolProgram}
              selectedDuration={afterschoolDuration}
              onProgramChange={setAfterschoolProgram}
              onDurationChange={setAfterschoolDuration}
              selection={afterschoolSelection}
            />
          </section>

          <section className="grid lg:grid-cols-2 gap-4">
            <BundleToggleCard
              title="Bundle of 5 Private Lessons"
              detail="Regular: $60.00/lesson x 5 = $300.00"
              sale="Sale price: $250.00"
              savings="You save: $50.00"
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
                    <span className="text-xs text-slate-700 leading-relaxed">
                      <span className="font-semibold block mb-1 text-sm">
                        Text me order confirmation and updates{" "}
                        <span className="text-[#c41e3a]">*</span>
                      </span>
                      {SMS_CONSENT_TEXT}
                    </span>
                  </label>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-lg"
                  >
                    {isSubmitting
                      ? "Submitting..."
                      : "Claim My Christmas in July Deal"}
                  </Button>
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
              privateLessons={privateLessons}
              beltTesting={beltTesting}
              orderTotal={orderTotal}
            />
          </section>
        </form>
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
}: {
  title: string;
  subtitle?: string;
  programs: Program[];
  selectedProgram: string;
  selectedDuration: 3 | 6 | null;
  onProgramChange: (program: string) => void;
  onDurationChange: (months: 3 | 6) => void;
  selection: ReturnType<typeof getPackageSelection>;
}) {
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

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        {selection ? (
          <div className="grid sm:grid-cols-3 gap-3">
            <TotalStat
              label="Regular total"
              value={formatMoney(selection.regularTotal)}
            />
            <TotalStat
              label="Sale total"
              value={formatMoney(selection.saleTotal)}
              highlight
            />
            <TotalStat
              label="You save"
              value={formatMoney(selection.savings)}
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Select a program and package duration to see your savings.
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
  privateLessons,
  beltTesting,
  orderTotal,
}: {
  proShopSelections: Array<
    Product & { quantity: number; salePrice: number; lineTotal: number }
  >;
  maSelection: ReturnType<typeof getPackageSelection>;
  afterschoolSelection: ReturnType<typeof getPackageSelection>;
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

        {privateLessons && (
          <SummaryRow
            title="Bundle of 5 Private Lessons"
            detail="Save $50.00"
            amount="$250.00"
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
            Staff will confirm availability and payment.
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
