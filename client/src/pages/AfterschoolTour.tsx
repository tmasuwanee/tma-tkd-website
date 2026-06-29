import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Bus, BookOpen, Clock, Users } from "lucide-react";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function getUtmParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    utmSource:   p.get("utm_source")   ?? undefined,
    utmMedium:   p.get("utm_medium")   ?? undefined,
    utmCampaign: p.get("utm_campaign") ?? undefined,
    utmContent:  p.get("utm_content")  ?? undefined,
  };
}

export default function AfterschoolTour() {
  const [parentName, setParentName] = useState("");
  const [kidName,    setKidName]    = useState("");
  const [grade,      setGrade]      = useState("");
  const [phone,      setPhone]      = useState("");
  const [email,      setEmail]      = useState("");
  const [days,       setDays]       = useState<string[]>([]);
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = trpc.leads.submit.useMutation();

  const utm = useMemo(() => getUtmParams(), []);

  function toggleDay(day: string) {
    setDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parentName.trim() || !kidName.trim() || !grade.trim() || !phone.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (!smsConsent) {
      toast.error("Please agree to receive SMS updates so we can confirm your tour.");
      return;
    }

    const preferredDays = days.length > 0
      ? `Preferred tour days: ${days.join(", ")}.`
      : "No preferred days specified.";

    setIsSubmitting(true);
    try {
      await submit.mutateAsync({
        parentName:      parentName.trim(),
        kidName:         kidName.trim(),
        kidAge:          grade.trim(),
        programInterest: "Afterschool",
        email:           email.trim() || undefined,
        phone:           phone.trim(),
        additionalNotes: `Tour request - afterschool program. ${preferredDays} We will call to confirm tour time (M-F 2pm-4pm window, flexible upon speaking with staff).`,
        tags:            ["tour_request"],
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
        <h1 className="text-3xl font-bold text-white mb-3">Tour request received!</h1>
        <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 mt-2 mb-6 w-full max-w-sm">
          <p className="text-white/70 text-sm">We will call you within 1 business day to confirm your tour time.</p>
          <p className="text-white font-semibold text-sm mt-2">
            Tours available Monday - Friday, 2:00 PM - 4:00 PM.
          </p>
          <p className="text-white/60 text-xs mt-1">Times are flexible. We will work with your schedule.</p>
        </div>
        <p className="text-white/50 text-xs max-w-xs">
          Questions? Call us at (770) 963-9850 or stop by 4780 McGinnis Ferry Rd, Suwanee GA.
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
            <p className="text-white/60 text-xs">Afterschool Program Tour</p>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-[#1a2d5a] pb-8 px-4 pt-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-white text-2xl font-bold leading-tight mb-2">
            Schedule Your Afterschool Tour
          </h1>
          <p className="text-white/70 text-sm">
            Come see the program in action. We pick up from Jackson, Walnut Grove, and McKendree
            Elementary. Homework done. Taekwondo and kickboxing. Home by 6:30.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mt-5">
            {[
              { icon: Bus,     text: "Bus pickup from 3 schools" },
              { icon: BookOpen, text: "Homework done daily" },
              { icon: Clock,    text: "Done by 6:30 PM" },
              { icon: Users,    text: "K-5, 4 days a week" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2">
                <Icon className="w-4 h-4 text-white/70 shrink-0" />
                <span className="text-white text-xs font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tour time notice */}
      <div className="max-w-lg mx-auto px-4 -mt-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-amber-900 text-sm font-semibold">Tour window: Monday - Friday, 2:00 PM - 4:00 PM</p>
          <p className="text-amber-800 text-xs mt-0.5">
            We will call you to confirm the exact time. Times are flexible upon speaking with our staff.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <h2 className="text-lg font-bold text-[#1a2d5a]">Your info</h2>

        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Parent / guardian name <span className="text-[#c41e3a]">*</span></Label>
            <Input
              value={parentName}
              onChange={e => setParentName(e.target.value)}
              placeholder="Your full name"
              className="text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Student name <span className="text-[#c41e3a]">*</span></Label>
              <Input
                value={kidName}
                onChange={e => setKidName(e.target.value)}
                placeholder="Child's name"
                className="text-base"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Grade <span className="text-[#c41e3a]">*</span></Label>
              <Input
                value={grade}
                onChange={e => setGrade(e.target.value)}
                placeholder="e.g. 3rd grade"
                className="text-base"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Phone <span className="text-[#c41e3a]">*</span></Label>
            <Input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(770) 555-1234"
              className="text-base"
            />
          </div>

          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="text-base"
            />
          </div>
        </div>

        {/* Preferred days */}
        <div>
          <Label className="text-gray-700 font-medium mb-2.5 block">
            Preferred tour days <span className="text-gray-400 font-normal">(select all that work)</span>
          </Label>
          <div className="grid grid-cols-5 gap-1.5">
            {DAYS.map(day => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`py-2 rounded-lg border-2 text-xs font-semibold transition-colors ${
                  days.includes(day)
                    ? "border-[#1a2d5a] bg-[#1a2d5a] text-white"
                    : "border-gray-200 text-gray-600 bg-white hover:border-gray-300"
                }`}
              >
                {day.slice(0, 3)}
              </button>
            ))}
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
            <span className="font-semibold block mb-0.5 text-sm">Text me tour confirmation and updates <span className="text-[#c41e3a]">*</span></span>
            {SMS_CONSENT_TEXT}
          </span>
        </label>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl"
        >
          {isSubmitting ? "Submitting..." : "Request my tour"}
        </Button>

        <p className="text-center text-xs text-gray-400">
          Enroll before school starts. Free uniform + registration fee waived. K-5 only.
        </p>
      </form>
    </div>
  );
}
