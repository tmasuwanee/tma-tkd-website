import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck, ChevronLeft, Calendar } from "lucide-react";
import TrialClassPicker from "@/components/TrialClassPicker";
import SignaturePad from "@/components/SignaturePad";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

const PROGRAMS = [
  { key: "taekwondo",    label: "Taekwondo" },
  { key: "little_tigers", label: "Little Tigers (4-5)" },
  { key: "bjj",         label: "Jiu-Jitsu" },
  { key: "kickboxing",  label: "Kickboxing" },
];

const PROGRAM_TO_INTEREST: Record<string, string> = {
  taekwondo:    "Taekwondo",
  little_tigers: "Little Tigers",
  bjj:          "BJJ",
  kickboxing:   "Kickboxing",
};

const WAIVER_TEXT =
  "I, for myself, my child(ren) named above, and our heirs, executors, and assigns, " +
  "acknowledge and fully understand that martial arts training and physical activity " +
  "involve inherent risks, including the risk of personal injury. I agree that the " +
  "instructors, staff, and owners of Top Martial Arts will not be held liable for any " +
  "damages arising from personal injury and/or loss sustained by the student in or about " +
  "the premises of the school. I confirm that the student is physically fit and able to " +
  "participate in all class activities to the best of their ability, and I authorize Top " +
  "Martial Arts staff to seek emergency medical care if it becomes necessary. As the parent " +
  "or legal guardian of any minor named above, I accept these terms on their behalf. I have " +
  "read this waiver and sign it voluntarily.";

type Slot = { startTime: string; day: string };

export default function WalkIn() {
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 state
  const [program, setProgram] = useState("taekwondo");
  const [ageStr, setAgeStr] = useState("");
  const [classSlot, setClassSlot] = useState<{ slot: Slot; date: string } | null>(null);

  // Step 2 state
  const [parentName, setParentName] = useState("");
  const [kidName, setKidName]       = useState("");
  const [email, setEmail]           = useState("");
  const [phone, setPhone]           = useState("");
  const [agreed, setAgreed]         = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitWaiver = trpc.waiver.submit.useMutation();
  const bookManual   = trpc.leads.bookManual.useMutation();

  const ageNum = parseInt(ageStr) || 8;

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const todayPretty = useMemo(
    () => new Date(today + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    [today]
  );

  const formatSlotDate = (date: string) =>
    new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const goToStep2 = () => {
    if (!classSlot) { toast.error("Pick a class time first."); return; }
    setStep(2);
    window.scrollTo(0, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentName.trim() || !kidName.trim() || !phone.trim() || !email.trim()) {
      toast.error("Please fill in all required fields."); return;
    }
    if (!agreed) { toast.error("Please read and agree to the waiver."); return; }
    if (!signatureData) { toast.error("Please sign the waiver."); return; }

    setIsSubmitting(true);
    try {
      const result = await submitWaiver.mutateAsync({
        parentName:    parentName.trim(),
        address:       null,
        email:         email.trim(),
        phone:         phone.trim(),
        students:      [{ name: kidName.trim(), dob: "" }],
        interests:     [],
        signatureData,
        signedName:    parentName.trim(),
        signedDate:    today,
        disclaimerText: WAIVER_TEXT,
        source:        "walk_in",
        ...(smsConsent ? { smsConsent: true, smsConsentText: SMS_CONSENT_TEXT } : {}),
      });

      if (classSlot && result.leadId) {
        await bookManual.mutateAsync({
          leadId:          result.leadId,
          parentName:      parentName.trim(),
          kidName:         kidName.trim(),
          kidAge:          ageStr || null,
          phone:           phone.trim(),
          email:           email.trim(),
          programInterest: PROGRAM_TO_INTEREST[program] || "Taekwondo",
          trialClassDate:  classSlot.date,
          trialClassTime:  classSlot.slot.startTime,
          trialClassDay:   classSlot.slot.day,
          notes:           "Walk-in via QR form",
        });
      }

      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#1a2d5a] flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 bg-green-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
          <CheckCircle2 className="w-11 h-11 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">You're booked!</h1>
        {classSlot && (
          <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 mt-4 mb-6 w-full max-w-xs">
            <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Your trial class</p>
            <p className="text-white font-bold text-xl leading-tight">{formatSlotDate(classSlot.date)}</p>
            <p className="text-white/80 text-lg mt-0.5">{classSlot.slot.startTime}</p>
            <p className="text-white/60 text-sm mt-1 capitalize">{PROGRAM_TO_INTEREST[program]}</p>
          </div>
        )}
        <p className="text-white/60 text-sm max-w-xs">
          Waiver signed and on file. A coach will get you started. Welcome to the TMA family.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1a2d5a] sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">TMA</span>
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">Top Martial Arts Suwanee</p>
              <p className="text-white/60 text-xs">Free trial class</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full transition-colors ${step >= 1 ? "bg-white" : "bg-white/30"}`} />
            <div className={`w-2 h-2 rounded-full transition-colors ${step >= 2 ? "bg-white" : "bg-white/30"}`} />
          </div>
        </div>
      </header>

      {/* Step 1: pick a class */}
      {step === 1 && (
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1a2d5a]">Book your free trial class</h1>
            <p className="text-gray-500 text-sm mt-1">Pick a program and choose a class time that works for you.</p>
          </div>

          <div>
            <Label className="text-gray-700 font-semibold mb-2.5 block">Program</Label>
            <div className="grid grid-cols-2 gap-2.5">
              {PROGRAMS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => { setProgram(p.key); setClassSlot(null); }}
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

          <div>
            <Label className="text-gray-700 font-semibold mb-2 block">Student's age</Label>
            <Input
              type="number" min="3" max="70"
              value={ageStr}
              onChange={e => { setAgeStr(e.target.value); setClassSlot(null); }}
              placeholder="e.g. 8"
              className="max-w-[140px] text-base"
            />
          </div>

          {ageStr && parseInt(ageStr) >= 3 && (
            <div>
              <Label className="text-gray-700 font-semibold mb-2 block flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> Pick a class time
              </Label>
              <TrialClassPicker
                program={program}
                age={ageNum}
                onSelect={(slot, date) => setClassSlot({ slot, date })}
              />
              {classSlot && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800 font-medium">
                  Selected: {formatSlotDate(classSlot.date)} at {classSlot.slot.startTime}
                </div>
              )}
            </div>
          )}

          <Button
            onClick={goToStep2}
            disabled={!classSlot}
            className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl"
          >
            Continue to waiver
          </Button>
        </div>
      )}

      {/* Step 2: contact info + waiver */}
      {step === 2 && (
        <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-6 space-y-6">
          <div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1 text-sm text-[#1a2d5a] mb-4 hover:underline"
            >
              <ChevronLeft className="w-4 h-4" /> Change class time
            </button>

            {classSlot && (
              <div className="bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl px-4 py-3 text-sm mb-5">
                <span className="font-semibold text-[#1a2d5a]">Your class:</span>{" "}
                <span className="text-gray-700">
                  {formatSlotDate(classSlot.date)} at {classSlot.slot.startTime} ({PROGRAM_TO_INTEREST[program]})
                </span>
              </div>
            )}
            <h2 className="text-xl font-bold text-[#1a2d5a]">Your info</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Parent / guardian name *</Label>
              <Input value={parentName} onChange={e => setParentName(e.target.value)} placeholder="Your full name" className="text-base" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Student's name *</Label>
              <Input value={kidName} onChange={e => setKidName(e.target.value)} placeholder="Child's full name" className="text-base" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Phone *</Label>
                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(770) 555-1234" className="text-base" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Email *</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="text-base" />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1a2d5a]">Liability Waiver</h2>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3.5 text-xs leading-relaxed text-gray-600">
              {WAIVER_TEXT}
            </div>
            <label className="flex items-center gap-3.5 cursor-pointer bg-white border-2 border-[#c41e3a]/50 rounded-xl p-4 hover:border-[#c41e3a] transition-colors">
              <Checkbox
                checked={agreed}
                onCheckedChange={v => setAgreed(v === true)}
                className="h-7 w-7 border-2 border-gray-400 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0"
              />
              <span className="text-sm font-bold text-gray-900">
                I have read and agree to the waiver above.{" "}
                <span className="text-[#c41e3a]">*</span>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Printed name</Label>
                <Input value={parentName || "Your name"} readOnly className="bg-gray-50 text-gray-500" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Date</Label>
                <Input value={todayPretty} readOnly className="bg-gray-50 text-gray-500" />
              </div>
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Signature *</Label>
              <SignaturePad onChange={setSignatureData} />
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl cursor-pointer hover:bg-[#1a2d5a]/10 transition-colors">
            <Checkbox
              checked={smsConsent}
              onCheckedChange={v => setSmsConsent(v === true)}
              className="mt-0.5 h-5 w-5 border-2 border-[#1a2d5a]/50 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0"
            />
            <span className="text-xs text-gray-700 leading-relaxed min-w-0 break-words">
              <span className="font-semibold block mb-0.5 text-sm">Text me class updates and reminders</span>
              {SMS_CONSENT_TEXT}
            </span>
          </label>

          <Button
            type="submit"
            disabled={isSubmitting}
            size="lg"
            className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl"
          >
            <ShieldCheck className="w-5 h-5 mr-2" />
            {isSubmitting ? "Submitting..." : "Sign waiver and book class"}
          </Button>
        </form>
      )}
    </div>
  );
}
