// v2 — coupon code support added
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronRight, ChevronLeft, Users, User, Calendar, CreditCard, FileText } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

const stripePromise = loadStripe(import.meta.env.VITE_TMA_STRIPE_PUBLISHABLE_KEY);

// Valid coupon codes
const COUPON_CODES: Record<string, { label: string; prices?: { "3day": number; "5day": number } }> = {
  EARLYBIRD2026: { label: "Registration Discount" },
  TMAEARLYBIRD: { label: "Registration Discount" },
  AS2026: { label: "$20/wk Discount", prices: { "3day": 179_00, "5day": 219_00 } },
};

// Pricing constants
const PRICING = {
  regular: {
    "3day": 199_00,   // $199 per camper per week
    "5day": 239_00,   // $239 per camper per week
    "daily": 70_00,   // $70 per day per camper
  },
  fieldTrip: 25_00,
  extendedCare: 25_00,  // Early drop-off + late pickup bundled together
};

function getProgramPrice(programType: "3day" | "5day" | "daily", couponApplied = false, couponCode = "") {
  if (couponApplied && programType !== "daily") {
    const coupon = COUPON_CODES[couponCode.toUpperCase()];
    if (coupon?.prices) return coupon.prices[programType as "3day" | "5day"];
  }
  return PRICING.regular[programType];
}

const CAMP_WEEKS_2026 = [
  "Week 1: May 26 – May 29 (Tue–Fri)",
  "Week 2: June 1 – June 5",
  "Week 3: June 8 – June 12",
  "Week 4: June 15 – June 19",
  "Week 5: June 22 – June 26",
  "Week 6: June 29 – July 3",
  "Week 7: July 6 – July 10",
  "Week 8: July 13 – July 17",
  "Week 9: July 20 – July 24",
  "Week 10: July 27 – July 31",
  "Week 11: August 3 – August 7",
];

interface CamperInfo {
  name: string;
  dob: string;
  age: string;
  sex: string;
}

interface FormData {
  campers: CamperInfo[];
  parentFirstName: string;
  parentLastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  howDidYouHear: string;
  programType: "3day" | "5day" | "daily";
  addFieldTrip: boolean;
  addExtendedCare: boolean;
  selectedWeeks: string[];
  futureWeeks: string[];
  agreedToTerms: boolean;
  couponCode: string;
  couponApplied: boolean;
  // 2026-06-08: CTIA-compliant SMS consent (Twilio toll-free verification).
  // Captured on Step 2 next to the phone field; gated on Next.
  smsConsent: boolean;
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function calculateTotal(data: FormData): number {
  const numCampers = data.campers.filter(c => c.name.trim()).length || 1;
  const numWeeks = data.programType === "daily" ? 1 : Math.max(data.selectedWeeks.length, 1);
  let base = getProgramPrice(data.programType, data.couponApplied, data.couponCode) * numCampers * numWeeks;
  if (data.addFieldTrip) base += PRICING.fieldTrip * numCampers * numWeeks;
  if (data.addExtendedCare) base += PRICING.extendedCare * numWeeks;
  return base;
}

function calculateRegularTotal(data: FormData): number {
  const numCampers = data.campers.filter(c => c.name.trim()).length || 1;
  const numWeeks = data.programType === "daily" ? 1 : Math.max(data.selectedWeeks.length, 1);
  let base = PRICING.regular[data.programType] * numCampers * numWeeks;
  if (data.addFieldTrip) base += PRICING.fieldTrip * numCampers * numWeeks;
  if (data.addExtendedCare) base += PRICING.extendedCare * numWeeks;
  return base;
}

// Step indicator component
function StepIndicator({ step, currentStep }: { step: number; currentStep: number }) {
  const steps = [
    { label: "Campers", icon: Users },
    { label: "Parent Info", icon: User },
    { label: "Program", icon: Calendar },
    { label: "Payment", icon: CreditCard },
    { label: "Waiver", icon: FileText },
  ];
  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const isActive = i + 1 === currentStep;
        const isComplete = i + 1 < currentStep;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                isComplete ? "bg-green-600 border-green-600 text-white" :
                isActive ? "bg-[#1a2d5a] border-[#1a2d5a] text-white" :
                "bg-white border-gray-300 text-gray-400"
              }`}>
                {isComplete ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-xs mt-1 font-medium ${isActive ? "text-[#1a2d5a]" : isComplete ? "text-green-600" : "text-gray-400"}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-12 sm:w-20 h-0.5 mx-1 mb-4 ${isComplete ? "bg-green-600" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Step 1: Camper Information
function Step1({ data, onChange, onNext }: { data: FormData; onChange: (d: FormData) => void; onNext: () => void }) {
  const updateCamper = (idx: number, field: keyof CamperInfo, value: string) => {
    const campers = [...data.campers];
    campers[idx] = { ...campers[idx], [field]: value };
    onChange({ ...data, campers });
  };

  const canProceed = data.campers[0].name && data.campers[0].dob && data.campers[0].age && data.campers[0].sex;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1a2d5a] mb-1">Camper Information</h2>
        <p className="text-gray-500 text-sm">You can register up to 3 campers at once.</p>
      </div>

      {data.campers.map((camper, idx) => (
        <Card key={idx} className={`border-2 ${idx === 0 ? "border-[#1a2d5a]" : "border-gray-200"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? "bg-[#1a2d5a]" : "bg-gray-400"}`}>{idx + 1}</span>
              {idx === 0 ? "Camper 1 (Required)" : `Camper ${idx + 1} (Optional)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Full Name {idx === 0 && <span className="text-red-500">*</span>}</Label>
              <Input
                value={camper.name}
                onChange={e => updateCamper(idx, "name", e.target.value)}
                placeholder="First and last name"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Date of Birth {idx === 0 && <span className="text-red-500">*</span>}</Label>
              <Input
                type="date"
                value={camper.dob}
                onChange={e => updateCamper(idx, "dob", e.target.value)}
                className="mt-1"
                disabled={idx > 0 && !data.campers[idx - 1].name}
              />
            </div>
            <div>
              <Label>Age {idx === 0 && <span className="text-red-500">*</span>}</Label>
              <Input
                type="number"
                min="4"
                max="17"
                value={camper.age}
                onChange={e => updateCamper(idx, "age", e.target.value)}
                placeholder="Age"
                className="mt-1"
                disabled={idx > 0 && !data.campers[idx - 1].name}
              />
            </div>
            <div>
              <Label>Sex {idx === 0 && <span className="text-red-500">*</span>}</Label>
              <Select
                value={camper.sex}
                onValueChange={v => updateCamper(idx, "sex", v)}
                disabled={idx > 0 && !data.campers[idx - 1].name}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 text-white px-8"
        >
          Next: Parent Info <ChevronRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Step 2: Parent Information
function Step2({ data, onChange, onNext, onBack }: { data: FormData; onChange: (d: FormData) => void; onNext: () => void; onBack: () => void }) {
  const update = (field: keyof FormData, value: string) => onChange({ ...data, [field]: value });
  const updateBool = (field: keyof FormData, value: boolean) => onChange({ ...data, [field]: value });

  const canProceed = data.parentFirstName && data.parentLastName && data.email && data.phone && data.address && data.city && data.state && data.zip && data.smsConsent;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1a2d5a] mb-1">Parent / Guardian Information</h2>
        <p className="text-gray-500 text-sm">All fields marked * are required.</p>
      </div>

      <Card className="border-2 border-[#1a2d5a]">
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>First Name <span className="text-red-500">*</span></Label>
            <Input value={data.parentFirstName} onChange={e => update("parentFirstName", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Last Name <span className="text-red-500">*</span></Label>
            <Input value={data.parentLastName} onChange={e => update("parentLastName", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Email <span className="text-red-500">*</span></Label>
            <Input type="email" value={data.email} onChange={e => update("email", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Phone <span className="text-red-500">*</span></Label>
            <Input type="tel" value={data.phone} onChange={e => update("phone", e.target.value)} placeholder="(770) 555-1234" className="mt-1" />
          </div>
          {/* 2026-06-08: Twilio CTIA-compliant SMS consent. Required before Next. */}
          <div className="sm:col-span-2 flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded">
            <Checkbox
              id="smsConsentCamp"
              checked={data.smsConsent}
              onCheckedChange={v => updateBool("smsConsent", v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="smsConsentCamp" className="text-xs text-gray-700 leading-relaxed cursor-pointer font-normal">
              <span className="text-red-500">*</span> I agree to receive recurring SMS text messages from Top
              Martial Arts Suwanee (TMA) at the phone number above, including registration confirmations,
              camp updates, schedule changes, and reminders. Frequency: up to 10 messages per month.
              Message and data rates may apply. Reply <strong>STOP</strong> to unsubscribe or <strong>HELP</strong> for
              help. Consent is not a condition of purchase. See{" "}
              <a href="/sms-terms" target="_blank" className="underline text-[#1a2d5a]">SMS Terms</a>{" "}
              and{" "}
              <a href="/privacy-policy" target="_blank" className="underline text-[#1a2d5a]">Privacy Policy</a>.
            </Label>
          </div>
          <div className="sm:col-span-2">
            <Label>Street Address <span className="text-red-500">*</span></Label>
            <Input value={data.address} onChange={e => update("address", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>City <span className="text-red-500">*</span></Label>
            <Input value={data.city} onChange={e => update("city", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>State <span className="text-red-500">*</span></Label>
            <Select value={data.state} onValueChange={v => update("state", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select state..." /></SelectTrigger>
              <SelectContent>
                {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>ZIP Code <span className="text-red-500">*</span></Label>
            <Input value={data.zip} onChange={e => update("zip", e.target.value)} className="mt-1" maxLength={10} />
          </div>
          <div>
            <Label>How did you hear about us?</Label>
            <Select value={data.howDidYouHear} onValueChange={v => update("howDidYouHear", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Google">Google</SelectItem>
                <SelectItem value="Facebook">Facebook</SelectItem>
                <SelectItem value="Instagram">Instagram</SelectItem>
                <SelectItem value="Friend/Family">Friend or Family</SelectItem>
                <SelectItem value="Current Student">Current Student</SelectItem>
                <SelectItem value="Flyer">Flyer</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="px-8">
          <ChevronLeft className="mr-2 w-4 h-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 text-white px-8">
          Next: Program <ChevronRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Step 3: Program Selection
function Step3({ data, onChange, onNext, onBack }: { data: FormData; onChange: (d: FormData) => void; onNext: () => void; onBack: () => void }) {
  const numCampers = data.campers.filter(c => c.name.trim()).length || 1;
  const total = calculateTotal(data);
  const regularTotal = calculateRegularTotal(data);
  const [couponInput, setCouponInput] = useState(data.couponCode);
  const [couponError, setCouponError] = useState("");

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (COUPON_CODES[code]) {
      onChange({ ...data, couponCode: code, couponApplied: true });
      setCouponError("");
    } else {
      setCouponError("Invalid coupon code. Please try again.");
      onChange({ ...data, couponCode: "", couponApplied: false });
    }
  };

  const removeCoupon = () => {
    setCouponInput("");
    setCouponError("");
    onChange({ ...data, couponCode: "", couponApplied: false });
  };

  const toggleWeek = (week: string) => {
    const weeks = data.selectedWeeks.includes(week)
      ? data.selectedWeeks.filter(w => w !== week)
      : [...data.selectedWeeks, week];
    onChange({ ...data, selectedWeeks: weeks });
  };

  const toggleFutureWeek = (week: string) => {
    // Can't select a week in future that's already in selectedWeeks
    const weeks = data.futureWeeks.includes(week)
      ? data.futureWeeks.filter(w => w !== week)
      : [...data.futureWeeks, week];
    onChange({ ...data, futureWeeks: weeks });
  };

  const numWeeks = data.programType === "daily" ? 1 : Math.max(data.selectedWeeks.length, 1);
  const canProceed = data.programType && (data.programType === "daily" || data.selectedWeeks.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1a2d5a] mb-1">Program Selection</h2>
        <p className="text-gray-500 text-sm">Choose your program and add-ons. Camp hours: 9:00 AM – 4:00 PM.</p>
      </div>

      {/* Program Type */}
      <Card className="border-2 border-[#1a2d5a]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Program Type <span className="text-red-500">*</span></CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { value: "5day", label: "Full Week (5 Days)", price: "$239/camper/week", desc: "Mon–Fri" },
            { value: "3day", label: "3-Day Week", price: "$199/camper/week", desc: "Mon, Wed, Fri" },
            { value: "daily", label: "Daily Drop-In", price: "$70/camper/day", desc: "Any single day" },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange({ ...data, programType: opt.value })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                data.programType === opt.value
                  ? "border-[#1a2d5a] bg-[#1a2d5a]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="font-semibold text-sm text-[#1a2d5a]">{opt.label}</div>
              <div className="text-lg font-bold text-[#c41e3a] mt-1">{opt.price}</div>
              <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Add-ons */}
      <Card className="border-2 border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add-Ons (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "addFieldTrip" as const, label: "Field Trip Fee", price: "$25/week per camper", desc: "Includes all field trip activities" },
            { key: "addExtendedCare" as const, label: "Early Drop-Off & Late Pick-Up", price: "$25/week", desc: "7:30 AM drop-off + 2:00–6:00 PM pickup — bundled together" },
          ].map(addon => (
            <div key={addon.key} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
              <Checkbox
                id={addon.key}
                checked={data[addon.key]}
                onCheckedChange={v => onChange({ ...data, [addon.key]: !!v })}
                className="mt-0.5"
              />
              <label htmlFor={addon.key} className="flex-1 cursor-pointer">
                <div className="font-medium text-sm">{addon.label} <span className="text-[#c41e3a] font-bold">{addon.price}</span></div>
                <div className="text-xs text-gray-500">{addon.desc}</div>
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Week Selection */}
      {data.programType !== "daily" && (
        <Card className="border-2 border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Weeks Attending <span className="text-red-500">*</span></CardTitle>
            <p className="text-xs text-gray-500 mt-1">Select all weeks your camper(s) will attend. Price multiplies per week selected.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CAMP_WEEKS_2026.map(week => {
                const isSelected = data.selectedWeeks.includes(week);
                return (
                  <div
                    key={week}
                    onClick={() => toggleWeek(week)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all select-none ${
                      isSelected
                        ? "border-[#1a2d5a] bg-[#1a2d5a] text-white shadow-md"
                        : "border-gray-200 bg-white hover:border-[#1a2d5a]/50 hover:bg-gray-50"
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected ? "bg-white border-white" : "border-gray-400 bg-white"
                    }`}>
                      {isSelected && <Check className="w-4 h-4 text-[#1a2d5a] stroke-[3]" />}
                    </div>
                    <span className={`text-sm font-medium leading-tight ${
                      isSelected ? "text-white" : "text-gray-800"
                    }`}>{week}</span>
                  </div>
                );
              })}
            </div>
            {data.selectedWeeks.length > 0 && (
              <p className="mt-3 text-sm font-semibold text-[#1a2d5a]">{data.selectedWeeks.length} week{data.selectedWeeks.length > 1 ? "s" : ""} selected</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Future Weeks - Pay Later */}
      {data.programType !== "daily" && (
        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-amber-800">Additional Weeks (Pay Later)</CardTitle>
            <p className="text-xs text-amber-700 mt-1">
              Select any additional weeks you plan to register for in the future. These are <strong>not charged today</strong> — you will pay separately for each.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CAMP_WEEKS_2026
                .filter(week => !data.selectedWeeks.includes(week))
                .map(week => {
                  const isSelected = data.futureWeeks.includes(week);
                  return (
                    <div
                      key={`future-${week}`}
                      onClick={() => toggleFutureWeek(week)}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all select-none ${
                        isSelected
                          ? "border-amber-500 bg-amber-500 text-white shadow-md"
                          : "border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected ? "bg-white border-white" : "border-amber-400 bg-white"
                      }`}>
                        {isSelected && <Check className="w-4 h-4 text-amber-600 stroke-[3]" />}
                      </div>
                      <span className={`text-sm font-medium leading-tight ${
                        isSelected ? "text-white" : "text-amber-900"
                      }`}>{week}</span>
                    </div>
                  );
                })}
            </div>
            {data.futureWeeks.length > 0 && (
              <p className="mt-3 text-sm font-semibold text-amber-800">{data.futureWeeks.length} additional week{data.futureWeeks.length > 1 ? "s" : ""} noted for future payment</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Coupon Code */}
      <Card className="border-2 border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coupon Code (Optional)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.couponApplied ? (
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">{data.couponCode}</span>
                <span className="text-sm">— {COUPON_CODES[data.couponCode]?.label} applied!</span>
              </div>
              <button onClick={removeCoupon} className="text-sm text-gray-500 hover:text-red-600 underline">Remove</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Enter coupon code"
                value={couponInput}
                onChange={e => { setCouponInput(e.target.value); setCouponError(""); }}
                onKeyDown={e => e.key === "Enter" && applyCoupon()}
                className="uppercase placeholder:normal-case"
              />
              <Button onClick={applyCoupon} variant="outline" className="shrink-0 bg-[#1a2d5a] text-white hover:bg-[#1a2d5a]/90 border-[#1a2d5a]">
                Apply
              </Button>
            </div>
          )}
          {couponError && <p className="text-red-600 text-sm mt-2">{couponError}</p>}
        </CardContent>
      </Card>

      {/* Price Summary */}
      <Card className="border-2 border-[#c41e3a] bg-[#c41e3a]/5">
        <CardContent className="pt-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>
                {data.programType === "3day" ? "3-Day" : data.programType === "5day" ? "5-Day" : "Daily"} Program
                {data.programType !== "daily" && ` × ${numCampers} camper${numCampers > 1 ? "s" : ""} × ${numWeeks} week${numWeeks > 1 ? "s" : ""}`}
                {data.programType === "daily" && ` × ${numCampers} camper${numCampers > 1 ? "s" : ""}`}
              </span>
              <span>{formatCurrency(getProgramPrice(data.programType, data.couponApplied, data.couponCode) * numCampers * (data.programType === "daily" ? 1 : numWeeks))}</span>
            </div>
            {data.addFieldTrip && <div className="flex justify-between"><span>Field Trip Fee × {numCampers}{data.programType !== "daily" && numWeeks > 1 ? ` × ${numWeeks} wks` : ""}</span><span>{formatCurrency(PRICING.fieldTrip * numCampers * (data.programType === "daily" ? 1 : numWeeks))}</span></div>}
            {data.addExtendedCare && <div className="flex justify-between"><span>Early Drop-Off &amp; Late Pick-Up{data.programType !== "daily" && numWeeks > 1 ? ` × ${numWeeks} wks` : ""}</span><span>{formatCurrency(PRICING.extendedCare * (data.programType === "daily" ? 1 : numWeeks))}</span></div>}
            {data.couponApplied && regularTotal !== total && (
              <div className="flex justify-between text-green-700 font-medium">
                <span>🎉 Coupon: Discount Applied</span>
                <span className="text-green-700">-{formatCurrency(regularTotal - total)}</span>
              </div>
            )}
            {data.couponApplied && regularTotal !== total && (
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Original price</span>
                <span className="line-through">{formatCurrency(regularTotal)}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between font-bold text-base">
              <span>Total Due Today</span>
              <span className="text-[#c41e3a]">{formatCurrency(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="px-8">
          <ChevronLeft className="mr-2 w-4 h-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 text-white px-8">
          Next: Payment <ChevronRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Step 4: Payment
function PaymentForm({ clientSecret, paymentIntentId, onSuccess }: { clientSecret: string; paymentIntentId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const confirmPaymentMutation = trpc.camp.confirmPayment.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/camp-registration`,
      },
      redirect: "if_required",
    });

    if (error) {
      toast.error(error.message ?? "Payment failed. Please try again.");
      setIsProcessing(false);
    } else {
      // Update payment status in database
      try {
        await confirmPaymentMutation.mutateAsync({ paymentIntentId });
      } catch (err) {
        console.error("Failed to update payment status:", err);
      }
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
        {isProcessing ? "Processing..." : "Complete Registration & Pay"}
      </Button>
    </form>
  );
}

function Step4({ data, onBack, onPaymentSuccess }: { data: FormData; onBack: () => void; onPaymentSuccess: (registrationId?: number) => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [registrationId, setRegistrationId] = useState<number | undefined>(undefined);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const numCampers = data.campers.filter(c => c.name.trim()).length || 1;
  const total = calculateTotal(data);

  const createRegistration = trpc.camp.createRegistration.useMutation({
    onSuccess: (result) => {
      if (result.clientSecret) setClientSecret(result.clientSecret);
      if (result.paymentIntentId) setPaymentIntentId(result.paymentIntentId);
      if (result.registrationId) setRegistrationId(result.registrationId);
    },
    onError: (err) => {
      toast.error("Failed to create registration: " + err.message);
    },
  });

  useEffect(() => {
    // Create registration and payment intent when step 4 loads
    const camper1 = data.campers[0];
    const camper2 = data.campers[1];
    const camper3 = data.campers[2];

    createRegistration.mutate({
      camper1Name: camper1.name,
      camper1Dob: camper1.dob,
      camper1Age: camper1.age,
      camper1Sex: camper1.sex,
      camper2Name: camper2?.name || undefined,
      camper2Dob: camper2?.dob || undefined,
      camper2Age: camper2?.age || undefined,
      camper2Sex: camper2?.sex || undefined,
      camper3Name: camper3?.name || undefined,
      camper3Dob: camper3?.dob || undefined,
      camper3Age: camper3?.age || undefined,
      camper3Sex: camper3?.sex || undefined,
      parentFirstName: data.parentFirstName,
      parentLastName: data.parentLastName,
      email: data.email,
      phone: data.phone,
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      howDidYouHear: data.howDidYouHear || undefined,
      programType: data.programType,
      numCampers,
      addFieldTrip: data.addFieldTrip,
      addExtendedCare: data.addExtendedCare,
      selectedWeeks: data.selectedWeeks ?? [],
      futureWeeks: data.futureWeeks ?? [],
      amountCents: total,
      couponCode: data.couponCode || undefined,
      agreedToTerms: data.agreedToTerms,
      smsConsent: true,
      smsConsentText: SMS_CONSENT_TEXT,
    });
  }, []);

  if (paymentSuccess) {
    // Redirect to Step 5 waiver form
    onPaymentSuccess(registrationId);
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1a2d5a] mb-1">Payment</h2>
        <p className="text-gray-500 text-sm">Secure payment powered by Stripe. Your information is encrypted.</p>
      </div>

      {/* Order Summary */}
      <Card className="border-2 border-gray-200 bg-gray-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span>Camper(s):</span><span className="font-medium">{data.campers.filter(c => c.name).map(c => c.name).join(", ")}</span></div>
          <div className="flex justify-between"><span>Program:</span><span className="font-medium">{data.programType === "3day" ? "3-Day Week" : data.programType === "5day" ? "Full Week (5-Day)" : "Daily Drop-In"}</span></div>
          {data.selectedWeeks.length > 0 && (
            <div className="flex justify-between"><span>Weeks:</span><span className="font-medium text-right max-w-[60%]">{data.selectedWeeks.length} week{data.selectedWeeks.length > 1 ? "s" : ""} selected</span></div>
          )}
          <div className="border-t mt-2 pt-2 flex justify-between font-bold text-base">
            <span>Total</span><span className="text-[#c41e3a]">{formatCurrency(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Terms */}
      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border">
        <Checkbox
          id="terms"
          checked={agreedToTerms}
          onCheckedChange={v => setAgreedToTerms(!!v)}
          className="mt-0.5"
        />
        <label htmlFor="terms" className="text-sm text-gray-600">
          I agree to the <a href="#" className="text-[#1a2d5a] underline">Terms & Conditions</a> and <a href="#" className="text-[#1a2d5a] underline">Refund Policy</a>. I understand that camp fees are non-refundable within 7 days of the camp start date.
        </label>
      </div>

      {createRegistration.isPending && (
        <div className="text-center py-4 text-gray-500">Setting up your registration...</div>
      )}

      {clientSecret && !agreedToTerms && (
        <p className="text-sm text-red-600 font-medium">Please agree to the Terms & Conditions above to continue.</p>
      )}

      <div className="flex justify-start">
        <Button variant="outline" onClick={onBack} className="px-8">
          <ChevronLeft className="mr-2 w-4 h-4" /> Back
        </Button>
      </div>

      {/* Always render Elements once clientSecret is ready to prevent remounting on agreedToTerms toggle */}
      {clientSecret && paymentIntentId && (
        <div className={agreedToTerms ? "block" : "hidden"}>
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
            <PaymentForm clientSecret={clientSecret} paymentIntentId={paymentIntentId} onSuccess={() => setPaymentSuccess(true)} />
          </Elements>
        </div>
      )}
    </div>
  );
}

// Step 5: Digital Waiver
interface WaiverFormData {
  camperNames: string;
  camperDobs: string;
  campWeeks: string;
  parentName: string;
  homeAddress: string;
  cellPhone: string;
  email: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyPhone: string;
  authorizedPickup1: string;
  authorizedPickup2: string;
  allergies: string;
  medications: string;
  medicalConditions: string;
  initialsMaritalArts: string;
  initialsFieldTrips: string;
  noPhotoConsent: boolean;
  signedName: string;
  agreedToTerms: boolean;
}

function Step5({ registrationId, prefill, onComplete }: {
  registrationId?: number;
  prefill: { parentName: string; email: string; phone: string; camperNames: string; camperDobs: string; campWeeks: string };
  onComplete: () => void;
}) {
  const [form, setForm] = useState<WaiverFormData>({
    camperNames: prefill.camperNames,
    camperDobs: prefill.camperDobs,
    campWeeks: prefill.campWeeks,
    parentName: prefill.parentName,
    homeAddress: "",
    cellPhone: prefill.phone,
    email: prefill.email,
    emergencyContactName: "",
    emergencyContactRelationship: "",
    emergencyPhone: "",
    authorizedPickup1: "",
    authorizedPickup2: "",
    allergies: "",
    medications: "",
    medicalConditions: "",
    initialsMaritalArts: "",
    initialsFieldTrips: "",
    noPhotoConsent: false,
    signedName: "",
    agreedToTerms: false,
  });

  const submitWaiver = trpc.camp.submitWaiver.useMutation({
    onSuccess: () => {
      toast.success("Waiver submitted successfully!");
      onComplete();
    },
    onError: (err) => {
      toast.error("Failed to submit waiver: " + err.message);
    },
  });

  const set = (field: keyof WaiverFormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agreedToTerms) {
      toast.error("Please check the agreement box to submit.");
      return;
    }
    if (!form.signedName.trim()) {
      toast.error("Please enter your full legal name as your electronic signature.");
      return;
    }
    submitWaiver.mutate({
      registrationId: registrationId,
      camperNames: form.camperNames,
      camperDobs: form.camperDobs || undefined,
      campWeeks: form.campWeeks || undefined,
      parentName: form.parentName,
      homeAddress: form.homeAddress || undefined,
      cellPhone: form.cellPhone || undefined,
      email: form.email || undefined,
      emergencyContactName: form.emergencyContactName,
      emergencyContactRelationship: form.emergencyContactRelationship || undefined,
      emergencyPhone: form.emergencyPhone,
      authorizedPickup1: form.authorizedPickup1 || undefined,
      authorizedPickup2: form.authorizedPickup2 || undefined,
      allergies: form.allergies || undefined,
      medications: form.medications || undefined,
      medicalConditions: form.medicalConditions || undefined,
      initialsMaritalArts: form.initialsMaritalArts,
      initialsFieldTrips: form.initialsFieldTrips,
      noPhotoConsent: form.noPhotoConsent,
      signedName: form.signedName,
      agreedToTerms: form.agreedToTerms,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#1a2d5a] mb-1">Summer Camp Waiver</h2>
        <p className="text-gray-500 text-sm">Please complete and sign the waiver below. All fields marked * are required.</p>
      </div>

      {/* Section 1: Camper & Parent Info */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#1a2d5a] border-b pb-2">Camper &amp; Parent Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Camper Name(s) *</Label>
            <Input value={form.camperNames} onChange={e => set("camperNames", e.target.value)} required />
          </div>
          <div>
            <Label>Date(s) of Birth</Label>
            <Input value={form.camperDobs} onChange={e => set("camperDobs", e.target.value)} placeholder="MM/DD/YYYY" />
          </div>
          <div>
            <Label>Camp Week(s)</Label>
            <Input value={form.campWeeks} onChange={e => set("campWeeks", e.target.value)} placeholder="e.g. Week 1, Week 2" />
          </div>
          <div>
            <Label>Parent / Guardian Name *</Label>
            <Input value={form.parentName} onChange={e => set("parentName", e.target.value)} required />
          </div>
          <div>
            <Label>Cell Phone *</Label>
            <Input value={form.cellPhone} onChange={e => set("cellPhone", e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <Label>Home Address</Label>
            <Input value={form.homeAddress} onChange={e => set("homeAddress", e.target.value)} placeholder="Street, City, State, ZIP" />
          </div>
          <div className="sm:col-span-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Section 2: Emergency Contact & Authorized Pickup */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#1a2d5a] border-b pb-2">Emergency Contact &amp; Authorized Pickup</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Emergency Contact Name *</Label>
            <Input value={form.emergencyContactName} onChange={e => set("emergencyContactName", e.target.value)} required />
          </div>
          <div>
            <Label>Relationship</Label>
            <Input value={form.emergencyContactRelationship} onChange={e => set("emergencyContactRelationship", e.target.value)} placeholder="e.g. Spouse, Grandparent" />
          </div>
          <div>
            <Label>Emergency Phone *</Label>
            <Input value={form.emergencyPhone} onChange={e => set("emergencyPhone", e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Authorized Pickup 1 (Name -- Relationship)</Label>
            <Input value={form.authorizedPickup1} onChange={e => set("authorizedPickup1", e.target.value)} placeholder="e.g. John Smith -- Uncle" />
          </div>
          <div>
            <Label>Authorized Pickup 2 (optional)</Label>
            <Input value={form.authorizedPickup2} onChange={e => set("authorizedPickup2", e.target.value)} placeholder="e.g. Jane Doe -- Aunt" />
          </div>
        </div>
      </div>

      {/* Section 3: Medical Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#1a2d5a] border-b pb-2">Medical Information</h3>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label>Allergies (food, environmental, medications)</Label>
            <Input value={form.allergies} onChange={e => set("allergies", e.target.value)} placeholder="None" />
          </div>
          <div>
            <Label>Current Medications</Label>
            <Input value={form.medications} onChange={e => set("medications", e.target.value)} placeholder="None" />
          </div>
          <div>
            <Label>Medical Conditions / Special Needs</Label>
            <Input value={form.medicalConditions} onChange={e => set("medicalConditions", e.target.value)} placeholder="None" />
          </div>
        </div>
      </div>

      {/* Section 4: Agreement & Initials */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-[#1a2d5a] border-b pb-2">Waiver Agreement</h3>

        {/* Martial Arts Training */}
        <div className="bg-gray-50 rounded-lg p-4 border space-y-3">
          <p className="text-sm text-gray-700 font-medium">Martial Arts Training Release</p>
          <p className="text-sm text-gray-600">
            I understand that martial arts training involves physical contact and inherent risks including, but not limited to, bruises, sprains, and other injuries. I voluntarily allow my child to participate and release Top Martial Arts Suwanee, its instructors, and staff from any liability for injuries sustained during training activities.
          </p>
          <div className="flex items-center gap-3">
            <Label className="text-sm font-semibold w-24 shrink-0">Initials *</Label>
            <Input
              className="w-32"
              value={form.initialsMaritalArts}
              onChange={e => set("initialsMaritalArts", e.target.value)}
              placeholder="e.g. J.S."
              required
            />
          </div>
        </div>

        {/* Field Trips */}
        <div className="bg-gray-50 rounded-lg p-4 border space-y-3">
          <p className="text-sm text-gray-700 font-medium">Field Trip Release</p>
          <p className="text-sm text-gray-600">
            I give permission for my child to participate in off-site field trips organized by TMA Summer Camp. I understand that transportation will be provided and that all reasonable safety precautions will be taken. I release Top Martial Arts Suwanee from liability for any incidents that may occur during field trips.
          </p>
          <div className="flex items-center gap-3">
            <Label className="text-sm font-semibold w-24 shrink-0">Initials *</Label>
            <Input
              className="w-32"
              value={form.initialsFieldTrips}
              onChange={e => set("initialsFieldTrips", e.target.value)}
              placeholder="e.g. J.S."
              required
            />
          </div>
        </div>

        {/* Photo Consent */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border">
          <Checkbox
            id="noPhoto"
            checked={form.noPhotoConsent}
            onCheckedChange={v => set("noPhotoConsent", !!v)}
            className="mt-0.5 shrink-0"
          />
          <label htmlFor="noPhoto" className="text-sm text-gray-600 min-w-0">
            <span className="font-semibold">Opt out of photo/video consent:</span> Check this box if you do NOT want photos or videos of your child used in TMA marketing materials, social media, or website. (By default, we may use photos/videos for promotional purposes.)
          </label>
        </div>

        {/* Electronic Signature */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Electronic Signature (Full Legal Name) *</Label>
          <p className="text-xs text-gray-500">By typing your full legal name below, you agree that this constitutes your electronic signature and that you have read and agree to all terms above.</p>
          <Input
            value={form.signedName}
            onChange={e => set("signedName", e.target.value)}
            placeholder="Type your full legal name"
            required
          />
        </div>

        {/* Agreement Checkbox */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <Checkbox
            id="waiverAgree"
            checked={form.agreedToTerms}
            onCheckedChange={v => set("agreedToTerms", !!v)}
            className="mt-0.5 shrink-0"
          />
          <label htmlFor="waiverAgree" className="text-sm text-gray-700 min-w-0">
            I have read and agree to all terms of this waiver. I understand this is a legally binding document.
          </label>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full bg-[#1a2d5a] hover:bg-[#1a2d5a]/90 text-white py-3 text-lg font-semibold"
        disabled={submitWaiver.isPending}
      >
        {submitWaiver.isPending ? "Submitting..." : "Submit Waiver"}
      </Button>
    </form>
  );
}

export default function CampRegistration() {
  const [step, setStep] = useState(1);
  const [registrationId, setRegistrationId] = useState<number | undefined>(undefined);
  const [formData, setFormData] = useState<FormData>({
    campers: [
      { name: "", dob: "", age: "", sex: "" },
      { name: "", dob: "", age: "", sex: "" },
      { name: "", dob: "", age: "", sex: "" },
    ],
    parentFirstName: "",
    parentLastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    howDidYouHear: "",
    programType: "5day",
    addFieldTrip: false,
    addExtendedCare: false,
    selectedWeeks: [],
    futureWeeks: [],
    agreedToTerms: false,
    couponCode: "",
    couponApplied: false,
    smsConsent: false,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a2d5a] text-white py-8">
        <div className="container max-w-3xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <a href="/summer-camps" className="text-white/70 hover:text-white text-sm">← Summer Camps</a>
          </div>
          <h1 className="text-3xl font-bold">Summer Camp Registration 2026</h1>
          <p className="text-white/80 mt-1">Top Martial Arts Suwanee • 9:00 AM – 4:00 PM</p>
        </div>
      </div>

      <div className="container max-w-3xl mx-auto px-4 py-8">
        <StepIndicator step={step} currentStep={step} />

        <Card className="shadow-lg border-0">
          <CardContent className="p-6 sm:p-8">
            {step === 1 && <Step1 data={formData} onChange={setFormData} onNext={() => setStep(2)} />}
            {step === 2 && <Step2 data={formData} onChange={setFormData} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
            {step === 3 && <Step3 data={formData} onChange={setFormData} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
            {step === 4 && <Step4 data={formData} onBack={() => setStep(3)} onPaymentSuccess={(regId) => { setRegistrationId(regId); setStep(5); }} />}
            {step === 5 && (
              <Step5
                registrationId={registrationId}
                prefill={{
                  parentName: `${formData.parentFirstName} ${formData.parentLastName}`.trim(),
                  email: formData.email,
                  phone: formData.phone,
                  camperNames: formData.campers.filter(c => c.name.trim()).map(c => c.name).join(", "),
                  camperDobs: formData.campers.filter(c => c.name.trim()).map(c => c.dob).join(", "),
                  campWeeks: formData.selectedWeeks.join(", "),
                }}
                onComplete={() => setStep(6)}
              />
            )}
            {step === 6 && (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-3xl font-bold text-[#1a2d5a] mb-3">All Done!</h2>
                <p className="text-gray-600 mb-2">Registration and waiver complete. Thank you for registering for TMA Summer Camp 2026!</p>
                <p className="text-gray-500 text-sm mb-6">A confirmation email has been sent to <strong>{formData.email}</strong>.</p>
                <p className="text-gray-500 text-sm">Questions? Call us at <a href="tel:+17702773009" className="text-[#1a2d5a] font-semibold">(770) 277-3009</a></p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          Questions? Call <a href="tel:+17702773009" className="text-[#1a2d5a]">((770) 277-3009</a> or email <a href="mailto:tmasuwanee@gmail.com" className="text-[#1a2d5a]">tmasuwanee@gmail.com</a>
        </p>
      </div>
    </div>
  );
}

