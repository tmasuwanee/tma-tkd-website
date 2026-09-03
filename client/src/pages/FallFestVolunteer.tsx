import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Leaf, CalendarDays, Clock, MapPin, HandHeart, Gift } from "lucide-react";

/**
 * Fall Fest volunteer sign-up page (/fall-fest-volunteer).
 * Parents pick how they want to help and what they can donate. Sign-ups are
 * stored in their own `fallFestVolunteers` table via fallFest.submitVolunteer,
 * deliberately OUTSIDE the leads pipeline: volunteers are not sales leads and
 * there is no SMS/A2P consent flow, so there is no consent gate here.
 *
 * Event details are constants below so staff can update them in one place.
 */

const EVENT = {
  title: "Fall Fest Volunteers",
  dateLine: "Saturday, September 19, 2026",
  timeLine: "11:00 AM to 1:00 PM",
  address: "2005 Lawrenceville Suwanee Rd, Suwanee, GA 30024",
};

const ROLES = [
  "Setup & decorations",
  "Games & activities",
  "Pumpkin painting",
  "Food & snack table",
  "Check-in / greeting",
  "Cleanup",
];

const TIMES = [
  "Whole event (11 AM to 1 PM)",
  "Setup before (10 to 11 AM)",
  "First hour (11 AM to 12 PM)",
  "Second hour (12 to 1 PM)",
  "Cleanup after (1 to 1:30 PM)",
];

const DONATIONS = [
  "Craft paint & brushes",
  "Candy",
  "Bottled water / drinks",
  "Snacks",
  "Paper goods (plates, napkins, cups)",
  "Other (tell us below)",
];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export default function FallFestVolunteer() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string>(TIMES[0]);
  const [donations, setDonations] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = trpc.fallFest.submitVolunteer.useMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Please add your name and a phone number.");
      return;
    }
    if (roles.length === 0 && donations.length === 0) {
      toast.error("Pick at least one way to help or one thing to donate.");
      return;
    }
    setIsSubmitting(true);
    try {
      await submit.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        roles,
        availability,
        donations,
        note: note.trim() || undefined,
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
        <h1 className="text-3xl font-bold text-white mb-3">Thank you for helping!</h1>
        <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 mt-2 mb-6 w-full max-w-sm">
          <p className="text-white font-semibold">{EVENT.dateLine}</p>
          <p className="text-white/80 text-sm">{EVENT.timeLine}</p>
          <p className="text-white/60 text-xs mt-2">{EVENT.address}</p>
        </div>
        <p className="text-white/70 text-sm max-w-xs">
          We got your sign-up. We'll text you before Fall Fest with where to be and when. We appreciate you!
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
          <div className="inline-flex items-center gap-2 bg-amber-500/20 rounded-full px-4 py-1.5 mb-4">
            <Leaf className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 font-semibold text-xs tracking-wide uppercase">Fall Fest Volunteers</span>
          </div>
          <h1 className="text-white text-3xl sm:text-4xl font-extrabold leading-tight">Lend a hand at Fall Fest</h1>
          <p className="text-white/80 mt-3">
            Our Fall Fest runs on family help. Tell us how you'd like to pitch in and what you can bring. Every bit makes the day better for the kids.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-6 text-left">
            {[
              { icon: CalendarDays, text: "Sat, Sept 19" },
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

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Contact */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <HandHeart className="w-4 h-4 text-amber-600" />
            <h2 className="text-lg font-bold text-[#1a2d5a]">Your info</h2>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Your name <span className="text-[#c41e3a]">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" className="text-base" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Phone <span className="text-[#c41e3a]">*</span></Label>
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(770) 555-1234" className="text-base" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="text-base" />
            </div>
          </div>
        </div>

        {/* Roles */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-[#1a2d5a]">How can you help?</h2>
          <p className="text-sm text-gray-500 -mt-1">Pick as many as you like.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ROLES.map(role => {
              const active = roles.includes(role);
              return (
                <label
                  key={role}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    active ? "bg-amber-50 border-amber-300" : "bg-white border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Checkbox
                    checked={active}
                    onCheckedChange={() => setRoles(r => toggle(r, role))}
                    className="h-5 w-5 border-2 border-amber-500/50 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 shrink-0"
                  />
                  <span className="text-sm text-gray-800 font-medium">{role}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Availability */}
        <div className="space-y-2">
          <Label className="text-lg font-bold text-[#1a2d5a] block">When can you be there?</Label>
          <select
            value={availability}
            onChange={e => setAvailability(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30"
          >
            {TIMES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* Donations */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-amber-600" />
            <h2 className="text-lg font-bold text-[#1a2d5a]">Can you donate anything?</h2>
          </div>
          <p className="text-sm text-gray-500 -mt-1">Totally optional. Only if you're able.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {DONATIONS.map(item => {
              const active = donations.includes(item);
              return (
                <label
                  key={item}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    active ? "bg-amber-50 border-amber-300" : "bg-white border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Checkbox
                    checked={active}
                    onCheckedChange={() => setDonations(d => toggle(d, item))}
                    className="h-5 w-5 border-2 border-amber-500/50 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 shrink-0"
                  />
                  <span className="text-sm text-gray-800 font-medium">{item}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Note */}
        <div>
          <Label className="text-gray-700 font-medium mb-1.5 block">Anything else? <span className="text-gray-400 font-normal">(optional)</span></Label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="Questions, what you're bringing, when you have to leave, etc."
            className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30"
          />
        </div>

        <Button type="submit" disabled={isSubmitting}
          className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl">
          {isSubmitting ? "Signing you up..." : "Sign me up to help"}
        </Button>
        <p className="text-center text-xs text-gray-400">Thank you for supporting our TMA family.</p>
      </form>
    </div>
  );
}
