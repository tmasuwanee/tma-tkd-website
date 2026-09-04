import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Gift, ShieldCheck, Users } from "lucide-react";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

/**
 * One Month Free promotion landing page (/free-month). This is the QR target on
 * the TMA yard signs. A prospect claims the offer; every claim becomes a lead
 * tagged `one_month_free` (plus the program tag). This IS prospect marketing, so
 * SMS consent (CTIA-compliant) is required, same as the other lead-capture pages.
 *
 * ?program=taekwondo|kickboxing|bjj|afterschool pre-selects the program.
 */

const PROGRAMS = [
  { value: "Taekwondo", label: "Taekwondo" },
  { value: "Kickboxing", label: "Kickboxing" },
  { value: "Brazilian Jiu-Jitsu", label: "Brazilian Jiu-Jitsu" },
  { value: "Kids After School", label: "Kids After School" },
  { value: "Not sure yet", label: "Not sure yet" },
];

const PROGRAM_MAP: Record<string, string> = {
  taekwondo: "Taekwondo",
  tkd: "Taekwondo",
  kickboxing: "Kickboxing",
  bjj: "Brazilian Jiu-Jitsu",
  jiujitsu: "Brazilian Jiu-Jitsu",
  afterschool: "Kids After School",
  kids: "Kids After School",
};

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    program: PROGRAM_MAP[(p.get("program") ?? "").toLowerCase()] ?? "",
    utmSource: p.get("utm_source") ?? undefined,
    utmMedium: p.get("utm_medium") ?? undefined,
    utmCampaign: p.get("utm_campaign") ?? undefined,
    utmContent: p.get("utm_content") ?? undefined,
  };
}

export default function FreeMonth() {
  const params = useMemo(getParams, []);
  const [parentName, setParentName] = useState("");
  const [kidName, setKidName] = useState("");
  const [kidAge, setKidAge] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [program, setProgram] = useState(params.program || PROGRAMS[0].value);
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = trpc.leads.submit.useMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parentName.trim() || !phone.trim()) {
      toast.error("Please add your name and a phone number.");
      return;
    }
    if (!smsConsent) {
      toast.error("Please agree to text updates so we can set up your free month.");
      return;
    }
    setIsSubmitting(true);
    try {
      const notes =
        `One Month Free claim. Interested in: ${program}.` +
        (kidName.trim() ? ` Student: ${kidName.trim()}${kidAge.trim() ? `, age ${kidAge.trim()}` : ""}.` : "");
      await submit.mutateAsync({
        parentName: parentName.trim(),
        kidName: kidName.trim() || "N/A",
        kidAge: kidAge.trim() || "N/A",
        programInterest: program,
        email: email.trim() || "",
        phone: phone.trim(),
        additionalNotes: notes,
        tags: ["one_month_free"],
        smsConsent: true,
        smsConsentText: SMS_CONSENT_TEXT,
        utmSource: params.utmSource,
        utmMedium: params.utmMedium,
        utmCampaign: params.utmCampaign,
        utmContent: params.utmContent,
      });
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again or call (770) 277-3009.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#1a2d5a] flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 bg-green-400 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-11 h-11 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Your free month is reserved!</h1>
        <p className="text-white/80 max-w-sm mb-6">
          We'll text you shortly to get you scheduled for your first class. Welcome to the TMA family.
        </p>
        <p className="text-white/50 text-xs">Questions? Call or text (770) 277-3009.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-[#1a2d5a] px-4 pt-8 pb-10">
        <div className="max-w-lg mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#c41e3a]/20 rounded-full px-4 py-1.5 mb-4">
            <Gift className="w-4 h-4 text-[#c41e3a]" />
            <span className="text-[#c41e3a] font-semibold text-xs tracking-wide uppercase">Limited-Time Offer</span>
          </div>
          <h1 className="text-white text-4xl sm:text-5xl font-extrabold leading-tight">
            Your First Month <span className="text-[#c41e3a]">Free</span>
          </h1>
          <p className="text-white/80 mt-3">
            Try Top Martial Arts Suwanee for a full month, on us. Pick a program, claim your spot, and come train.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mt-6">
            {["Taekwondo", "Kickboxing", "Brazilian Jiu-Jitsu", "Kids After School"].map(p => (
              <div key={p} className="bg-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-semibold">
                {p}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#c41e3a]" />
          <h2 className="text-lg font-bold text-[#1a2d5a]">Claim your free month</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Your name <span className="text-[#c41e3a]">*</span></Label>
            <Input value={parentName} onChange={e => setParentName(e.target.value)} placeholder="Your full name" className="text-base" />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Which program?</Label>
            <select value={program} onChange={e => setProgram(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30">
              {PROGRAMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Student's name <span className="text-gray-400 font-normal">(if a child)</span></Label>
              <Input value={kidName} onChange={e => setKidName(e.target.value)} placeholder="Student's name" className="text-base" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Age <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input value={kidAge} onChange={e => setKidAge(e.target.value)} placeholder="e.g. 8" className="text-base" />
            </div>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Phone <span className="text-[#c41e3a]">*</span></Label>
            <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(770) 555-1234" className="text-base" />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="text-base" />
          </div>
        </div>

        {/* SMS consent */}
        <label className="flex items-start gap-3 p-3.5 bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl cursor-pointer hover:bg-[#1a2d5a]/10 transition-colors">
          <Checkbox checked={smsConsent} onCheckedChange={v => setSmsConsent(v === true)}
            className="mt-0.5 h-5 w-5 border-2 border-[#1a2d5a]/50 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0" />
          <span className="text-xs text-gray-700 leading-relaxed">
            <span className="font-semibold block mb-0.5 text-sm">Text me to set up my free month <span className="text-[#c41e3a]">*</span></span>
            {SMS_CONSENT_TEXT}
          </span>
        </label>

        <Button type="submit" disabled={isSubmitting}
          className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl">
          {isSubmitting ? "Reserving your free month..." : "Claim my free month"}
        </Button>
        <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> No obligation. All ages welcome.
        </p>
      </form>
    </div>
  );
}
