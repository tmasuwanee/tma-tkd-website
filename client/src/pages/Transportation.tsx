import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Download, PenLine, X } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

// Static image of the blank GCPS form (rendered from the PDF). Overlay fields
// sit on top at the same coordinates the server stamps, so the on-screen form
// matches the signed PDF. No pdf.js at runtime, so nothing to hang.
const FORM_IMG = "/forms/transportation.png";
const PAGE_W = 612;
const PAGE_H = 792;

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

const PARENT_STATEMENT =
  "By signing below I agree to the following: I have read and understand the guidelines below. " +
  "The safety of my child while walking to, from, and waiting at the bus stop is my responsibility. " +
  "The above information I have provided is correct, and I am the Parent/legal guardian of the child listed above.";

type TextKey =
  | "studentName" | "grade" | "teacher" | "homeAddress" | "aptBldg"
  | "homePhone" | "cellPhone" | "workPhone" | "schoolName" | "dateToBegin"
  | "printedName" | "signedDate";

// Field boxes in PDF points (x, y from TOP, width, height). Same numbers the
// server stamps at, so the overlay and the signed PDF line up. Verify with ?grid=1.
type Box = { key: TextKey; x: number; y: number; w: number; h: number; ph: string };
// Boxes are vertically CENTERED on each printed line (input text centers in its
// box), so top = lineY - height/2. Line positions were measured from the form image.
const TEXT_FIELDS: Box[] = [
  { key: "studentName", x: 146, y: 56,  w: 232, h: 15, ph: "Student name" },
  { key: "grade",       x: 345, y: 50,  w: 54,  h: 14, ph: "Grade" },
  { key: "teacher",     x: 445, y: 50,  w: 62,  h: 14, ph: "Teacher" },
  { key: "homeAddress", x: 146, y: 92,  w: 252, h: 15, ph: "Home address" },
  { key: "homePhone",   x: 146, y: 111, w: 200, h: 15, ph: "Home phone" },
  { key: "aptBldg",     x: 470, y: 111, w: 90,  h: 14, ph: "Apt/Bldg #" },
  { key: "cellPhone",   x: 88,  y: 127, w: 184, h: 15, ph: "Cell #" },
  { key: "workPhone",   x: 330, y: 127, w: 122, h: 15, ph: "Work #" },
  { key: "schoolName",  x: 198, y: 199, w: 200, h: 15, ph: "Child's school" },
  { key: "dateToBegin", x: 116, y: 625, w: 74,  h: 14, ph: "Start date" },
  { key: "printedName", x: 33,  y: 719, w: 205, h: 15, ph: "Print your name" },
  { key: "signedDate",  x: 498, y: 719, w: 70,  h: 14, ph: "Date" },
];
const SIG_BOX = { x: 292, y: 701, w: 144, h: 27 };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Transportation() {
  const showGrid = useMemo(() => new URLSearchParams(window.location.search).has("grid"), []);

  const docRef = useRef<HTMLDivElement | null>(null);
  const [docW, setDocW] = useState(0);
  const scale = docW ? docW / PAGE_W : 0;

  const [values, setValues] = useState<Record<TextKey, string>>({
    studentName: "", grade: "", teacher: "", homeAddress: "", aptBldg: "",
    homePhone: "", cellPhone: "", workPhone: "", schoolName: "", dateToBegin: "",
    printedName: "", signedDate: todayISO(),
  });
  const set = (k: TextKey, v: string) => setValues(prev => ({ ...prev, [k]: v }));

  const [signature, setSignature] = useState<string | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [sigDraft, setSigDraft] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [donePdfUrl, setDonePdfUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = trpc.transportation.submit.useMutation();

  useEffect(() => {
    const measure = () => setDocW(docRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const pctL = (v: number) => `${(v / PAGE_W) * 100}%`;
  const pctT = (v: number) => `${(v / PAGE_H) * 100}%`;
  const pctW = (v: number) => `${(v / PAGE_W) * 100}%`;
  const pctH = (v: number) => `${(v / PAGE_H) * 100}%`;
  const fontPx = Math.max(9, Math.round(9.5 * scale));

  // Grid-mode: live coordinate readout so exact field positions can be read off.
  const [hoverXY, setHoverXY] = useState<{ x: number; y: number } | null>(null);
  function onDocMove(e: React.MouseEvent) {
    if (!showGrid) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHoverXY({
      x: Math.round(((e.clientX - r.left) / r.width) * PAGE_W),
      y: Math.round(((e.clientY - r.top) / r.height) * PAGE_H),
    });
  }

  function openSignature() { setSigDraft(signature); setSigOpen(true); }
  function saveSignature() {
    if (!sigDraft) { toast.error("Please draw your signature first."); return; }
    setSignature(sigDraft);
    setSigOpen(false);
  }

  async function handleSubmit() {
    const phone = values.cellPhone.trim() || values.homePhone.trim() || values.workPhone.trim();
    if (!values.studentName.trim()) { toast.error("Enter the student's name."); return; }
    if (!values.schoolName.trim()) { toast.error("Enter the child's school."); return; }
    if (!values.printedName.trim()) { toast.error("Print your name on the signature line."); return; }
    if (!phone) { toast.error("Enter a phone number (home, cell, or work)."); return; }
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) { toast.error("Enter a valid email so we can send your signed copy."); return; }
    if (!signature) { toast.error("Please add your signature on the form."); return; }
    if (!agreed) { toast.error("Please agree to the transportation guidelines."); return; }

    setSubmitting(true);
    try {
      const r = await submit.mutateAsync({
        studentName: values.studentName.trim(),
        grade: values.grade.trim() || undefined,
        teacher: values.teacher.trim() || undefined,
        homeAddress: values.homeAddress.trim() || undefined,
        aptBldg: values.aptBldg.trim() || undefined,
        homePhone: values.homePhone.trim() || undefined,
        cellPhone: values.cellPhone.trim() || undefined,
        workPhone: values.workPhone.trim() || undefined,
        schoolName: values.schoolName.trim(),
        dateToBegin: values.dateToBegin.trim() || undefined,
        parentEmail: email.trim(),
        parentPhone: phone,
        printedName: values.printedName.trim(),
        signedDate: values.signedDate,
        signaturePngDataUrl: signature,
        agreedToGuidelines: true,
        guidelinesText: GUIDELINES,
        ...(smsConsent ? { smsConsentText: SMS_CONSENT_TEXT } : {}),
      });
      setDonePdfUrl(r.pdfUrl ?? null);
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong submitting the form. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#1a2d5a] flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 bg-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-11 h-11 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Signed and submitted!</h1>
        <p className="text-white/70 text-sm max-w-sm mb-6">
          Your transportation form is signed. A copy has been emailed to {email}. TMA will submit it
          to your child's school; approval can take up to 10 business days, and the school may
          require a daycare enrollment verification letter.
        </p>
        {donePdfUrl && (
          <a
            href={donePdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white text-[#1a2d5a] font-semibold px-5 py-3 rounded-xl hover:bg-white/90"
          >
            <Download className="w-5 h-5" /> Download your signed PDF
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-[#1a2d5a] sticky top-0 z-20 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">TMA</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Top Martial Arts Suwanee</p>
            <p className="text-white/60 text-xs">After-School Transportation Form</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-[#1a2d5a]">Sign your transportation form</h1>
          <p className="text-sm text-gray-600 mt-1">
            Fill in the highlighted boxes on the form, then tap the signature box to sign. TMA is
            already listed on the form as your child's after-school destination. Tip: pinch to zoom
            if the boxes are small on your phone.
          </p>
        </div>

        {/* The GCPS form image with a fillable overlay */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
          <div ref={docRef} className="relative w-full select-none" onMouseMove={onDocMove} onMouseLeave={() => setHoverXY(null)}>
            <img src={FORM_IMG} alt="GCPS Transportation Parent Authorization form" className="block w-full h-auto rounded" draggable={false} />

            {/* Debug gridlines (?grid=1) to verify field placement. Minor lines
                every 25, bolder + labeled every 50 (x) / 25 (y). */}
            {showGrid && scale > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: Math.floor(PAGE_W / 25) + 1 }, (_, i) => i * 25).map(x => (
                  <div key={`v${x}`} className="absolute top-0 bottom-0" style={{ left: pctL(x), borderLeft: `${x % 100 === 0 ? 0.9 : 0.4}px solid rgba(255,0,0,${x % 50 === 0 ? 0.7 : 0.35})` }}>
                    {x % 50 === 0 && <span style={{ position: "absolute", top: 0, left: 1, fontSize: 7, color: "red" }}>{x}</span>}
                  </div>
                ))}
                {Array.from({ length: Math.floor(PAGE_H / 25) + 1 }, (_, i) => i * 25).map(y => (
                  <div key={`h${y}`} className="absolute left-0 right-0" style={{ top: pctT(y), borderTop: `${y % 100 === 0 ? 0.9 : 0.4}px solid rgba(0,0,255,${y % 50 === 0 ? 0.7 : 0.35})` }}>
                    <span style={{ position: "absolute", left: 0, top: 1, fontSize: 7, color: "blue" }}>{y}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Live coordinate readout (grid mode): hover to read exact x,y */}
            {showGrid && hoverXY && (
              <div className="absolute z-30 px-2 py-1 rounded bg-black/80 text-white text-xs font-mono pointer-events-none" style={{ left: pctL(Math.min(hoverXY.x, 500)), top: pctT(Math.max(hoverXY.y - 20, 0)) }}>
                x {hoverXY.x}, y {hoverXY.y}
              </div>
            )}

            {/* Field overlay */}
            <div className="absolute inset-0">
              {TEXT_FIELDS.map(f => (
                <input
                  key={f.key}
                  value={values[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  placeholder={f.ph}
                  aria-label={f.ph}
                  className="absolute bg-yellow-100/70 focus:bg-yellow-50 border border-yellow-400/70 focus:border-[#1a2d5a] rounded-[2px] px-1 text-[#12245a] outline-none placeholder:text-yellow-700/50"
                  style={{ left: pctL(f.x), top: pctT(f.y), width: pctW(f.w), height: pctH(f.h), fontSize: fontPx, lineHeight: 1 }}
                />
              ))}

              <button
                type="button"
                onClick={openSignature}
                aria-label="Sign here"
                className={`absolute flex items-center justify-center rounded-[2px] border ${signature ? "border-transparent" : "border-[#c41e3a] bg-[#c41e3a]/10 hover:bg-[#c41e3a]/20"}`}
                style={{ left: pctL(SIG_BOX.x), top: pctT(SIG_BOX.y), width: pctW(SIG_BOX.w), height: pctH(SIG_BOX.h) }}
              >
                {signature ? (
                  <img src={signature} alt="Signature" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="flex items-center gap-1 text-[#c41e3a] font-semibold" style={{ fontSize: Math.max(8, fontPx - 1) }}>
                    <PenLine style={{ width: fontPx, height: fontPx }} /> Sign
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {signature && (
          <button onClick={openSignature} className="text-xs text-[#1a2d5a] underline mt-2">Redo signature</button>
        )}

        {/* Below-document: email, guidelines, agreement, submit */}
        <div className="mt-6 space-y-5 bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">
              Your email <span className="text-[#c41e3a]">*</span>
            </Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="text-base" />
            <p className="text-xs text-gray-400 mt-1">We email your signed copy here.</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-[#1a2d5a] mb-1">Parent/guardian statement</p>
            <p className="text-xs text-gray-600 mb-2">{PARENT_STATEMENT}</p>
            <p className="text-xs font-semibold text-[#1a2d5a] mb-1">Transportation guidelines</p>
            <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600 whitespace-pre-line">
              {GUIDELINES}
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl cursor-pointer">
            <Checkbox
              checked={agreed}
              onCheckedChange={v => setAgreed(v === true)}
              className="mt-0.5 h-5 w-5 border-2 border-[#1a2d5a]/50 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0"
            />
            <span className="text-sm font-semibold text-gray-900">
              I have read and agree to the transportation guidelines above. <span className="text-[#c41e3a]">*</span>
            </span>
          </label>

          <label className="flex items-start gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer">
            <Checkbox
              checked={smsConsent}
              onCheckedChange={v => setSmsConsent(v === true)}
              className="mt-0.5 h-5 w-5 border-2 border-gray-300 data-[state=checked]:bg-[#1a2d5a] data-[state=checked]:border-[#1a2d5a] shrink-0"
            />
            <span className="text-xs text-gray-600 leading-relaxed">
              <span className="font-semibold block mb-0.5 text-sm text-gray-800">Text me transportation updates (optional)</span>
              {SMS_CONSENT_TEXT}
            </span>
          </label>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl"
          >
            {submitting ? "Submitting..." : "Sign and submit form"}
          </Button>
        </div>
      </div>

      {/* Signature modal */}
      {sigOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-[#1a2d5a]">Draw your signature</p>
              <button onClick={() => setSigOpen(false)} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="border-2 border-dashed border-gray-300 rounded-lg">
              <SignaturePad onChange={setSigDraft} />
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setSigDraft(null)}>Clear</Button>
              <Button className="flex-1 bg-[#1a2d5a] hover:bg-[#142449] text-white" onClick={saveSignature}>Use signature</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
