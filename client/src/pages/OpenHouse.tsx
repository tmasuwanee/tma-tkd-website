import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, PartyPopper, CalendarDays, MapPin, Clock, Users, Gift } from "lucide-react";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

/**
 * Back-to-School "Bring a Friend" Open House RSVP page (/open-house).
 * Current TMA families share the link; the new family RSVPs and can name who
 * invited them, so staff can reward the referrer. Every RSVP becomes a lead
 * (tagged open_house_2026, plus referral when an inviter is named).
 *
 * Event details are constants below so staff can update them in one place.
 */

const EVENT = {
  title: "Back-to-School Open House",
  dateLine: "Saturday, August 29, 2026",
  timeLine: "10:00 AM – 2:00 PM",
  address: "2005 Lawrenceville Suwanee Rd, Suwanee, GA 30024",
};

const PROGRAMS = ["Not sure yet", "Taekwondo", "Kickboxing", "Brazilian Jiu-Jitsu", "After School"];

function getUtm() {
  const p = new URLSearchParams(window.location.search);
  return {
    utmSource: p.get("utm_source") ?? undefined,
    utmMedium: p.get("utm_medium") ?? undefined,
    utmCampaign: p.get("utm_campaign") ?? undefined,
    utmContent: p.get("utm_content") ?? undefined,
  };
}

export default function OpenHouse() {
  const sp = new URLSearchParams(window.location.search);
  const [parentName, setParentName] = useState("");
  const [kidName, setKidName] = useState("");
  const [kidAge, setKidAge] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [invitedBy, setInvitedBy] = useState(sp.get("ref") ?? "");
  const [program, setProgram] = useState(PROGRAMS[0]);
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = trpc.leads.submit.useMutation();
  const utm = useMemo(getUtm, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parentName.trim() || !kidName.trim() || !phone.trim()) {
      toast.error("Please fill in your name, your child's name, and a phone number.");
      return;
    }
    if (!smsConsent) {
      toast.error("Please agree to receive text updates so we can confirm your spot.");
      return;
    }
    setIsSubmitting(true);
    try {
      const notes =
        `Open House RSVP (${EVENT.dateLine}). ` +
        `Interested in: ${program}.` +
        (invitedBy.trim() ? ` Invited by current member: ${invitedBy.trim()}.` : " (no referrer named)");
      await submit.mutateAsync({
        parentName: parentName.trim(),
        kidName: kidName.trim(),
        kidAge: kidAge.trim() || "N/A",
        programInterest: "Open House",
        email: email.trim() || "",
        phone: phone.trim(),
        additionalNotes: notes,
        tags: invitedBy.trim() ? ["open_house_2026", "referral"] : ["open_house_2026"],
        smsConsent: true,
        smsConsentText: SMS_CONSENT_TEXT,
        ...utm,
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
        <h1 className="text-3xl font-bold text-white mb-3">You're on the list!</h1>
        <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 mt-2 mb-6 w-full max-w-sm">
          <p className="text-white font-semibold">{EVENT.dateLine}</p>
          <p className="text-white/80 text-sm">{EVENT.timeLine}</p>
          <p className="text-white/60 text-xs mt-2">{EVENT.address}</p>
        </div>
        <p className="text-white/70 text-sm max-w-xs">
          We'll text you a reminder before the event. Bring comfortable clothes and lots of energy. See you there!
        </p>
        <p className="text-white/50 text-xs mt-4">Questions? Call or text (770) 277-3009.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-[#1a2d5a] px-4 pt-8 pb-10">
        <div className="max-w-lg mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#c41e3a]/20 rounded-full px-4 py-1.5 mb-4">
            <PartyPopper className="w-4 h-4 text-[#c41e3a]" />
            <span className="text-[#c41e3a] font-semibold text-xs tracking-wide uppercase">Free Community Event</span>
          </div>
          <h1 className="text-white text-3xl sm:text-4xl font-extrabold leading-tight">{EVENT.title}</h1>
          <p className="text-white/80 mt-3">
            Free classes, board breaking, games, and giveaways. Bring the kids and a friend and try martial arts on us.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-6 text-left">
            {[
              { icon: CalendarDays, text: EVENT.dateLine },
              { icon: Clock, text: EVENT.timeLine },
              { icon: MapPin, text: "Suwanee, GA" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2">
                <Icon className="w-4 h-4 text-white/70 shrink-0" />
                <span className="text-white text-xs font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bring a friend callout */}
      <div className="max-w-lg mx-auto px-4 -mt-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <Gift className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-amber-900 text-sm">
            <span className="font-semibold">Bring a friend!</span> If your friend joins after the open house, you
            <span className="font-semibold"> both get a free month</span>. Just tell us who invited you below.
          </p>
        </div>
      </div>

      {/* RSVP form */}
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#c41e3a]" />
          <h2 className="text-lg font-bold text-[#1a2d5a]">RSVP (free)</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Parent / guardian name <span className="text-[#c41e3a]">*</span></Label>
            <Input value={parentName} onChange={e => setParentName(e.target.value)} placeholder="Your full name" className="text-base" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Child's name <span className="text-[#c41e3a]">*</span></Label>
              <Input value={kidName} onChange={e => setKidName(e.target.value)} placeholder="Child's name" className="text-base" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Age <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input value={kidAge} onChange={e => setKidAge(e.target.value)} placeholder="e.g. 7" className="text-base" />
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
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Who invited you? <span className="text-gray-400 font-normal">(a current TMA family)</span></Label>
            <Input value={invitedBy} onChange={e => setInvitedBy(e.target.value)} placeholder="Their name (so we can thank them)" className="text-base" />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Which program are you curious about?</Label>
            <select value={program} onChange={e => setProgram(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30">
              {PROGRAMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* SMS consent */}
        <label className="flex items-start gap-3 p-3.5 bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl cursor-pointer hover:bg-[#1a2d5a]/10 transition-colors">
          <Checkbox checked={smsConsent} onCheckedChange={v => setSmsConsent(v === true)}
            className="mt-0.5 h-5 w-5 border-2 border-[#1a2d5a]/50 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0" />
          <span className="text-xs text-gray-700 leading-relaxed">
            <span className="font-semibold block mb-0.5 text-sm">Text me my open-house reminder <span className="text-[#c41e3a]">*</span></span>
            {SMS_CONSENT_TEXT}
          </span>
        </label>

        <Button type="submit" disabled={isSubmitting}
          className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl">
          {isSubmitting ? "Reserving your spot..." : "Reserve my spot"}
        </Button>
        <p className="text-center text-xs text-gray-400">Free event. No obligation. All ages welcome.</p>
      </form>
    </div>
  );
}
