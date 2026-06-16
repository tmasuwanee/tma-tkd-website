import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Plus, X, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import SignaturePad from "@/components/SignaturePad";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

/**
 * Public student intake + liability waiver. The digital version of the JotForm
 * guest waiver. QR code / iPad / link → this page. On submit it lands the family
 * in the SAME lead pipeline as web leads AND stores the signed waiver on file.
 *
 * WAIVER_DISCLAIMER is TMA's own waiver wording (provided 2026-06-15), strengthened
 * with standard assumption-of-risk, hold-harmless, emergency-care, and minor-guardian
 * elements. The exact text is snapshotted onto every signed submission, so editing it
 * here only affects waivers signed afterward. This is not legal advice. A liability
 * waiver that covers minors in Georgia is worth a quick attorney review for enforceability.
 */
const WAIVER_DISCLAIMER =
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

// Trial-specific variant, shown when the page is opened with ?type=trial (the
// "Open waiver" button from Add Trial Student). Same protections, framed around the
// paid 3-week trial enrollment.
const TRIAL_WAIVER_DISCLAIMER =
  "I am enrolling the student named above in the Top Martial Arts 3-Week Trial program. " +
  "I, for myself, my child(ren) named above, and our heirs, executors, and assigns, " +
  "acknowledge and fully understand that martial arts training and physical activity " +
  "involve inherent risks, including the risk of personal injury. I agree that the " +
  "instructors, staff, and owners of Top Martial Arts will not be held liable for any " +
  "damages arising from personal injury and/or loss sustained by the student in or about " +
  "the premises of the school. I confirm that the student is physically fit and able to " +
  "participate in all class activities to the best of their ability, and I authorize Top " +
  "Martial Arts staff to seek emergency medical care if it becomes necessary. I understand " +
  "the 3-week trial is a paid enrollment. As the parent or legal guardian of any minor named " +
  "above, I accept these terms on their behalf. I have read this waiver and sign it voluntarily.";

const INTERESTS: { key: string; label: string }[] = [
  { key: "better_listening", label: "Better listening" },
  { key: "improved_behavior", label: "Improved behavior" },
  { key: "fun", label: "Fun" },
  { key: "fitness", label: "Fitness" },
  { key: "self_defense", label: "Self-defense" },
  { key: "confidence", label: "Confidence" },
];

type StudentRow = { name: string; dob: string };

export default function StudentWaiver() {
  const submit = trpc.waiver.submit.useMutation();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ?type=trial → the 3-week-trial waiver variant (opened from Add Trial Student).
  const isTrial = useMemo(() => new URLSearchParams(window.location.search).get("type") === "trial", []);
  const disclaimer = isTrial ? TRIAL_WAIVER_DISCLAIMER : WAIVER_DISCLAIMER;

  // Local date (they're signing in GA). Used as the signed date and shown on the form.
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const todayPretty = useMemo(
    () => new Date(today + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    [today]
  );

  const [parentName, setParentName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([{ name: "", dob: "" }]);
  const [interests, setInterests] = useState<string[]>([]);
  const [signedName, setSignedName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);

  const setStudent = (i: number, patch: Partial<StudentRow>) =>
    setStudents(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStudent = () => setStudents(prev => (prev.length >= 3 ? prev : [...prev, { name: "", dob: "" }]));
  const removeStudent = (i: number) => setStudents(prev => prev.filter((_, idx) => idx !== i));
  const toggleInterest = (key: string) =>
    setInterests(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanStudents = students.map(s => ({ name: s.name.trim(), dob: s.dob })).filter(s => s.name);

    if (!parentName.trim() || !address.trim() || !email.trim() || !phone.trim()) {
      toast.error("Please fill in your name, address, email, and phone.");
      return;
    }
    if (cleanStudents.length === 0 || !cleanStudents[0].dob) {
      toast.error("Please add at least one student with a name and date of birth.");
      return;
    }
    if (!agreed) {
      toast.error("Please read and agree to the waiver.");
      return;
    }
    if (!signatureData) {
      toast.error("Please sign in the signature box.");
      return;
    }

    setIsSubmitting(true);
    try {
      await submit.mutateAsync({
        parentName: parentName.trim(),
        address: address.trim(),
        email: email.trim(),
        phone: phone.trim(),
        students: cleanStudents,
        interests,
        signatureData,
        signedName: (signedName.trim() || parentName.trim()),
        signedDate: today,
        disclaimerText: disclaimer,
        source: isTrial ? "trial" : "walk_in",
        ...(smsConsent ? { smsConsent: true, smsConsentText: SMS_CONSENT_TEXT } : {}),
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Waiver submit error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setSubmitted(false);
    setParentName(""); setAddress(""); setEmail(""); setPhone("");
    setStudents([{ name: "", dob: "" }]); setInterests([]);
    setSignedName(""); setSignatureData(null); setAgreed(false); setSmsConsent(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Compact branded header */}
      <header className="bg-[#1a2d5a]">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-11 h-11 bg-white/10 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">TMA</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Top Martial Arts Suwanee</h1>
            <p className="text-white/70 text-xs">{isTrial ? "3-Week Trial Waiver" : "Waiver"}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {submitted ? (
          <Card className="bg-white shadow-lg">
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#1a2d5a] mb-2">You're all set!</h2>
              <p className="text-gray-600 mb-1">Thanks, {parentName.split(" ")[0] || "and welcome"}. Your waiver is signed and on file.</p>
              <p className="text-gray-500 text-sm mb-7">A coach will get you started. Welcome to the TMA family.</p>
              <Button onClick={reset} className="bg-[#1a2d5a] hover:bg-[#142347] text-white">
                Sign up another family
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="bg-white shadow-lg">
            <form onSubmit={handleSubmit} className="p-5 md:p-7 space-y-7">
              {/* Parent / guardian */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#1a2d5a]">Parent / Guardian</h2>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Full name *</Label>
                  <Input value={parentName} onChange={e => setParentName(e.target.value)} placeholder="Your full name" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Address *</Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, city, state, ZIP" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-700 font-medium mb-1.5 block">Email *</Label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
                  </div>
                  <div>
                    <Label className="text-gray-700 font-medium mb-1.5 block">Phone *</Label>
                    <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(770) 277-3009" />
                  </div>
                </div>
              </section>

              {/* Students */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#1a2d5a]">Student(s)</h2>
                {students.map((s, i) => (
                  <div key={i} className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end bg-gray-50 rounded-lg p-3">
                    <div>
                      <Label className="text-gray-700 font-medium mb-1.5 block">
                        Student {i + 1} full name{i === 0 ? " *" : ""}
                      </Label>
                      <Input value={s.name} onChange={e => setStudent(i, { name: e.target.value })} placeholder="Child's full name" />
                    </div>
                    <div>
                      <Label className="text-gray-700 font-medium mb-1.5 block">
                        Date of birth{i === 0 ? " *" : ""}
                      </Label>
                      <Input type="date" value={s.dob} onChange={e => setStudent(i, { dob: e.target.value })} className="w-full" />
                    </div>
                    {i > 0 ? (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeStudent(i)}
                        className="text-gray-400 hover:text-red-500 mb-0.5" title="Remove">
                        <X className="w-4 h-4" />
                      </Button>
                    ) : <div className="hidden sm:block w-9" />}
                  </div>
                ))}
                {students.length < 3 ? (
                  <Button type="button" variant="outline" size="sm" onClick={addStudent}
                    className="border-[#1a2d5a]/30 text-[#1a2d5a]">
                    <Plus className="w-4 h-4 mr-1" /> Add another child
                  </Button>
                ) : null}
              </section>

              {/* Interests */}
              <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#1a2d5a]">
                  What are you hoping to gain?
                </h2>
                <p className="text-xs text-gray-500 -mt-1">Select all that apply.</p>
                <div className="grid grid-cols-2 gap-2">
                  {INTERESTS.map(opt => {
                    const on = interests.includes(opt.key);
                    return (
                      <button type="button" key={opt.key} onClick={() => toggleInterest(opt.key)}
                        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                          on ? "border-[#1a2d5a] bg-[#1a2d5a]/5 text-[#1a2d5a] font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          on ? "bg-[#1a2d5a] border-[#1a2d5a]" : "border-gray-400"}`}>
                          {on ? <CheckCircle2 className="w-3.5 h-3.5 text-white" /> : null}
                        </span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Waiver + signature */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#1a2d5a]">Liability Waiver</h2>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
                  {disclaimer}
                </div>
                <label className="flex items-center gap-3.5 cursor-pointer bg-white border-2 border-[#c41e3a]/60 rounded-lg p-4 hover:border-[#c41e3a] transition-colors shadow-sm">
                  <Checkbox checked={agreed} onCheckedChange={v => setAgreed(v === true)}
                    className="h-7 w-7 border-2 border-gray-500 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0" />
                  <span className="text-base font-bold text-gray-900">I have read and agree to the waiver above. <span className="text-[#c41e3a]">*</span></span>
                </label>

                <div className="grid sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <Label className="text-gray-700 font-medium mb-1.5 block">Printed name</Label>
                    <Input value={signedName} onChange={e => setSignedName(e.target.value)} placeholder={parentName || "Your name"} />
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
              </section>

              {/* Optional SMS consent, made prominent so it actually gets checked */}
              <label htmlFor="smsConsent" className="flex items-start gap-3.5 p-4 bg-[#1a2d5a]/5 border-2 border-[#1a2d5a]/30 rounded-lg cursor-pointer hover:bg-[#1a2d5a]/10 transition-colors">
                <Checkbox id="smsConsent" checked={smsConsent} onCheckedChange={v => setSmsConsent(v === true)}
                  className="mt-0.5 h-6 w-6 border-2 border-[#1a2d5a]/60 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a]" />
                <span className="text-sm text-gray-700 leading-relaxed">
                  <span className="block font-bold text-[#1a2d5a] text-base mb-0.5">Text me class updates &amp; reminders</span>
                  I agree to receive recurring SMS text messages from Top Martial Arts Suwanee at the
                  number above (confirmations, reminders, updates; up to 10/month). Message and data
                  rates may apply. Reply <strong>STOP</strong> to unsubscribe. Consent is not a condition
                  of purchase. See <a href="/sms-terms" target="_blank" className="underline">SMS Terms</a> and{" "}
                  <a href="/privacy-policy" target="_blank" className="underline">Privacy Policy</a>.
                </span>
              </label>

              <Button type="submit" disabled={isSubmitting} size="lg"
                className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold">
                <ShieldCheck className="w-5 h-5 mr-2" />
                {isSubmitting ? "Submitting..." : "Sign & Submit"}
              </Button>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
