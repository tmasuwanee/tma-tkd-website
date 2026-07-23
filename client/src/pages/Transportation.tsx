import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bus, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

const GUIDELINES = `The safety of your children while walking to, from, and while waiting at the bus stop is the parent's responsibility.

Student Bus Stop Assignment:
- Students are assigned to the stop closest to their home address.
- Change of bus stop for personal preferences (to get on/off the bus sooner or later, or to be with friends) are NOT allowed.

Transportation Tags:
- The address your child uses three or more days during the week is the address applied to the transportation tag.
- Do not remove the tag. Only the school may remove or attach a new transportation tag to your child's book bag.
- Only one tag is issued per child.
- The school must be notified in writing to request a transportation change different from the original agreement made at enrollment.

Official Bus Pass:
- Will not be issued for play dates, birthdays, Scouts, weekend sleepovers, or any reason except an emergency as determined by a school official.
- Valid for up to 10 consecutive school days and cannot be photocopies.

Emergency situations: To obtain a temporary bus pass the parent must notify the school in person and/or in writing with: parent and student name, contact phone number and address of the student your child is going home with; the requesting parent's contact phone number for verification; the day(s) and date(s) requested (not to exceed 10 consecutive school days); and parent signature and date.

Permissive Transfers:
- Transportation for students on permissive transfer is the responsibility of the parent/guardian.
- For more information see the GCPS website at www.gwinnett.k12.ga.us.

Car Rider:
- Must obtain an official bus pass (valid up to 10 consecutive school days) from the school main office to ride the GCPS bus home or to a designated emergency address.

Walker:
- Must be approved by the school Principal.
- Must obtain an official bus pass (valid up to 10 consecutive school days) from the school main office to ride the GCPS bus home or to a designated emergency address.

GCPS School Bus to daycare facility 5 days a week (address other than home) requires:
- Students transported to a daycare facility by a GCPS bus must provide the school with a copy of the daycare enrollment verification letter.
- School approval and/or transportation supervisor's approval and signature prior to the start date of service.
- Student meets eligibility within the school's assigned attendance zone.
- For reasons other than daycare: transportation supervisor approval, and it must be the same for all 5 days of the week.

Service address MUST be: the same for all 5 days; within the school's assigned attendance zone (or the daycare facility/sitter provides all transportation); and an approved/current GCPS bus stop in compliance with GCPS Transportation safe-stop guidelines.

This form is to be completed for every elementary child with each transportation change.`;

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Transportation() {
  const [studentName, setStudentName] = useState("");
  const [grade, setGrade] = useState("");
  const [teacher, setTeacher] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [aptBldg, setAptBldg] = useState("");
  const [homePhone, setHomePhone] = useState("");
  const [cellPhone, setCellPhone] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [dateToBegin, setDateToBegin] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [printedName, setPrintedName] = useState("");
  const [signedDate] = useState(getTodayDate);
  const [signaturePngDataUrl, setSignaturePngDataUrl] = useState<string | null>(null);
  const [agreedToGuidelines, setAgreedToGuidelines] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = trpc.transportation.submit.useMutation();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!studentName.trim() || !schoolName.trim() || !parentPhone.trim() || !printedName.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail.trim())) {
      toast.error("Please enter a valid parent or guardian email address.");
      return;
    }

    if (!agreedToGuidelines) {
      toast.error("Please read and agree to the transportation guidelines.");
      return;
    }

    if (!signaturePngDataUrl) {
      toast.error("Please add your signature before submitting.");
      return;
    }

    setIsSubmitting(true);
    try {
      await submit.mutateAsync({
        studentName: studentName.trim(),
        grade: grade.trim() || undefined,
        teacher: teacher.trim() || undefined,
        homeAddress: homeAddress.trim() || undefined,
        aptBldg: aptBldg.trim() || undefined,
        homePhone: homePhone.trim() || undefined,
        cellPhone: cellPhone.trim() || undefined,
        workPhone: workPhone.trim() || undefined,
        schoolName: schoolName.trim(),
        dateToBegin: dateToBegin || undefined,
        parentEmail: parentEmail.trim(),
        parentPhone: parentPhone.trim(),
        printedName: printedName.trim(),
        signedDate,
        signaturePngDataUrl,
        agreedToGuidelines: true,
        guidelinesText: GUIDELINES,
        smsConsentText: smsConsent ? SMS_CONSENT_TEXT : undefined,
      });
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (error) {
      console.error(error);
      toast.error("We could not submit your form. Please try again.");
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
        <h1 className="text-3xl font-bold text-white mb-3">Transportation form submitted</h1>
        <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 w-full max-w-sm">
          <p className="text-white/90 text-sm leading-relaxed">
            Your transportation form is signed and submitted. A copy has been emailed to you. TMA will submit it to your child's school; approval can take up to 10 business days.
          </p>
        </div>
        <div className="mt-5 flex items-start gap-2 max-w-sm text-left text-white/65 text-xs leading-relaxed">
          <FileText className="w-4 h-4 shrink-0 mt-0.5" />
          <p>The school may require a daycare enrollment verification letter.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a2d5a] sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">TMA</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Top Martial Arts Suwanee</p>
            <p className="text-white/60 text-xs">GCPS Transportation Authorization</p>
          </div>
        </div>
      </header>

      <section className="bg-[#1a2d5a] px-4 pt-5 pb-8">
        <div className="max-w-lg mx-auto">
          <div className="inline-flex items-center gap-1.5 bg-white/10 text-white rounded-lg px-3 py-1.5 text-xs font-semibold mb-4">
            <Bus className="w-3.5 h-3.5" /> After-school pickup
          </div>
          <h1 className="text-white text-3xl font-bold leading-tight">After-School Transportation Form</h1>
          <p className="text-white/75 text-sm mt-3 leading-relaxed">
            This authorizes your child's GCPS school to dismiss them to TMA Suwanee after school. TMA is already listed on the form.
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-[#1a2d5a]">Student and school information</h2>
            <p className="text-gray-500 text-sm mt-1">Please enter the information exactly as your child's school has it.</p>
          </div>

          <div>
            <Label htmlFor="student-name" className="text-gray-700 font-medium mb-1.5 block">
              Student name <span className="text-[#c41e3a]">*</span>
            </Label>
            <Input id="student-name" value={studentName} onChange={event => setStudentName(event.target.value)} placeholder="Child's full name" className="text-base" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="grade" className="text-gray-700 font-medium mb-1.5 block">Grade</Label>
              <Input id="grade" value={grade} onChange={event => setGrade(event.target.value)} placeholder="e.g. 3rd" className="text-base" />
            </div>
            <div>
              <Label htmlFor="teacher" className="text-gray-700 font-medium mb-1.5 block">Teacher</Label>
              <Input id="teacher" value={teacher} onChange={event => setTeacher(event.target.value)} placeholder="Teacher's name" className="text-base" />
            </div>
          </div>

          <div>
            <Label htmlFor="school-name" className="text-gray-700 font-medium mb-1.5 block">
              School the child attends <span className="text-[#c41e3a]">*</span>
            </Label>
            <Input id="school-name" value={schoolName} onChange={event => setSchoolName(event.target.value)} placeholder="School name" className="text-base" />
          </div>

          <div className="grid grid-cols-[1fr_0.48fr] gap-3">
            <div>
              <Label htmlFor="home-address" className="text-gray-700 font-medium mb-1.5 block">Home address</Label>
              <Input id="home-address" value={homeAddress} onChange={event => setHomeAddress(event.target.value)} placeholder="Street address" className="text-base" />
            </div>
            <div>
              <Label htmlFor="apt-bldg" className="text-gray-700 font-medium mb-1.5 block">Apt/Bldg #</Label>
              <Input id="apt-bldg" value={aptBldg} onChange={event => setAptBldg(event.target.value)} placeholder="Optional" className="text-base" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="home-phone" className="text-gray-700 font-medium mb-1.5 block">Home phone</Label>
              <Input id="home-phone" type="tel" value={homePhone} onChange={event => setHomePhone(event.target.value)} placeholder="(770) 555-1234" className="text-base" />
            </div>
            <div>
              <Label htmlFor="cell-phone" className="text-gray-700 font-medium mb-1.5 block">Cell phone</Label>
              <Input id="cell-phone" type="tel" value={cellPhone} onChange={event => setCellPhone(event.target.value)} placeholder="(770) 555-1234" className="text-base" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="work-phone" className="text-gray-700 font-medium mb-1.5 block">Work phone</Label>
              <Input id="work-phone" type="tel" value={workPhone} onChange={event => setWorkPhone(event.target.value)} placeholder="(770) 555-1234" className="text-base" />
            </div>
            <div>
              <Label htmlFor="date-to-begin" className="text-gray-700 font-medium mb-1.5 block">Desired start date</Label>
              <Input id="date-to-begin" type="date" value={dateToBegin} onChange={event => setDateToBegin(event.target.value)} className="text-base" />
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-[#1a2d5a]">Parent or guardian information</h2>
            <p className="text-gray-500 text-sm mt-1">This is where the completed form and confirmation will be sent.</p>
          </div>

          <div>
            <Label htmlFor="parent-email" className="text-gray-700 font-medium mb-1.5 block">
              Parent/guardian email <span className="text-[#c41e3a]">*</span>
            </Label>
            <Input id="parent-email" type="email" value={parentEmail} onChange={event => setParentEmail(event.target.value)} placeholder="you@email.com" className="text-base" />
          </div>

          <div>
            <Label htmlFor="parent-phone" className="text-gray-700 font-medium mb-1.5 block">
              Parent/guardian phone <span className="text-[#c41e3a]">*</span>
            </Label>
            <Input id="parent-phone" type="tel" value={parentPhone} onChange={event => setParentPhone(event.target.value)} placeholder="(770) 555-1234" className="text-base" />
          </div>

          <div>
            <Label htmlFor="printed-name" className="text-gray-700 font-medium mb-1.5 block">
              Parent/guardian full name (printed) <span className="text-[#c41e3a]">*</span>
            </Label>
            <Input id="printed-name" value={printedName} onChange={event => setPrintedName(event.target.value)} placeholder="Your full legal name" className="text-base" />
          </div>

          <div>
            <Label htmlFor="signed-date" className="text-gray-700 font-medium mb-1.5 block">Date signed</Label>
            <Input id="signed-date" value={signedDate} readOnly aria-readonly="true" className="text-base bg-gray-50 text-gray-600" />
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#1a2d5a] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-[#1a2d5a]">Parent statement and guidelines</h2>
              <p className="text-gray-700 text-sm leading-relaxed mt-2">
                By signing below I agree to the following: I have read and understand the guidelines below. The safety of my child while walking to, from, and waiting at the bus stop is my responsibility. The above information I have provided is correct, and I am the Parent/legal guardian of the child listed above. Signature is required to process this request.
              </p>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-xs text-gray-600 leading-relaxed whitespace-pre-line">
            {GUIDELINES}
          </div>

          <label className="flex items-start gap-3 p-3.5 bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl cursor-pointer hover:bg-[#1a2d5a]/10 transition-colors">
            <Checkbox
              checked={agreedToGuidelines}
              onCheckedChange={checked => setAgreedToGuidelines(checked === true)}
              className="mt-0.5 h-5 w-5 border-2 border-[#1a2d5a]/50 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              I have read and agree to the transportation guidelines above. <span className="text-[#c41e3a]">*</span>
            </span>
          </label>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4 shadow-sm">
          <div>
            <Label className="text-gray-700 font-semibold mb-1.5 block">Signature <span className="text-[#c41e3a]">*</span></Label>
            <p className="text-gray-500 text-sm">Use your finger, stylus, or mouse to sign.</p>
          </div>
          <SignaturePad onChange={setSignaturePngDataUrl} />
        </section>

        <label className="flex items-start gap-3 p-3.5 bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl cursor-pointer hover:bg-[#1a2d5a]/10 transition-colors">
          <Checkbox
            checked={smsConsent}
            onCheckedChange={checked => setSmsConsent(checked === true)}
            className="mt-0.5 h-5 w-5 border-2 border-[#1a2d5a]/50 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0"
          />
          <span className="text-xs text-gray-700 leading-relaxed">
            <span className="font-semibold block mb-0.5 text-sm">Text me TMA updates (optional)</span>
            {SMS_CONSENT_TEXT}
          </span>
        </label>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl"
        >
          {isSubmitting ? "Submitting your form..." : "Sign and submit form"}
        </Button>

        <p className="text-center text-xs text-gray-400 pb-2">
          Your completed authorization will be sent to you and prepared for TMA to submit to your child's school.
        </p>
      </form>
    </div>
  );
}
