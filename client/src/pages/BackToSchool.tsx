import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, CalendarCheck, ShieldCheck, Trophy, Zap } from "lucide-react";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

const PROGRAMS = [
  { key: "taekwondo",    label: "Taekwondo" },
  { key: "kickboxing",   label: "Kickboxing" },
  { key: "bjj",          label: "Brazilian Jiu-Jitsu" },
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

export default function BackToSchool() {
  const [program,    setProgram]    = useState("taekwondo");
  const [parentName, setParentName] = useState("");
  const [kidName,    setKidName]    = useState("");
  const [age,        setAge]        = useState("");
  const [phone,      setPhone]      = useState("");
  const [email,      setEmail]      = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = trpc.leads.submit.useMutation();
  const utm = useMemo(() => getUtmParams(), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parentName.trim() || !kidName.trim() || !phone.trim()) {
      toast.error("Please fill in name, student name, and phone.");
      return;
    }
    if (!smsConsent) {
      toast.error("Please agree to receive SMS updates so we can confirm your start date.");
      return;
    }

    setIsSubmitting(true);
    try {
      await submit.mutateAsync({
        parentName:      parentName.trim(),
        kidName:         kidName.trim(),
        kidAge:          age.trim() || "",
        programInterest: PROGRAM_TO_INTEREST[program] || "Taekwondo",
        email:           email.trim() || "",
        phone:           phone.trim(),
        additionalNotes: `Back to School Special: 2 weeks of ${PROGRAM_TO_INTEREST[program]} for $49. We will call to confirm the start date and collect the $49 on the first visit.`,
        tags:            ["back_to_school_2026"],
        smsConsent:      true,
        smsConsentText:  SMS_CONSENT_TEXT,
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
        <h1 className="text-3xl font-bold text-white mb-2">You're in!</h1>
        <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 mt-2 mb-6 w-full max-w-sm">
          <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Your special</p>
          <p className="text-white font-bold text-xl leading-tight">2 weeks of {PROGRAM_TO_INTEREST[program]}</p>
          <p className="text-white/80 text-lg mt-0.5">$49</p>
        </div>
        <p className="text-white/60 text-sm max-w-xs">
          We will call you within 1 business day to lock in your start date. Bring the $49 on your first visit. Welcome to the TMA family.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1a2d5a] sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">TMA</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Top Martial Arts Suwanee</p>
            <p className="text-white/60 text-xs">Back to School Special</p>
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
            commitment. Just show up and see why families stay.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mt-5">
            {[
              { icon: CalendarCheck, text: "2 full weeks of classes" },
              { icon: Trophy,        text: "Any program you choose" },
              { icon: ShieldCheck,   text: "No long-term commitment" },
              { icon: Zap,           text: "Just $49 to start" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2">
                <Icon className="w-4 h-4 text-white/70 shrink-0" />
                <span className="text-white text-xs font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-[#1a2d5a]">Claim the special</h2>
          <p className="text-gray-500 text-sm mt-1">Pick a program and tell us who's joining. We'll call to confirm your start date.</p>
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
            <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-gray-400 font-normal">(optional)</span></Label>
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
          disabled={isSubmitting}
          className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl"
        >
          {isSubmitting ? "Submitting..." : "Claim my $49 special"}
        </Button>

        <p className="text-center text-xs text-gray-400">
          Pay the $49 on your first visit. New students only. One special per student.
        </p>
      </form>
    </div>
  );
}
