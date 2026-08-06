import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Download, FileSignature } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { AFTERSCHOOL_WAIVER_SECTIONS } from "@shared/afterschoolWaiver";

/**
 * Standalone After-School WAIVER page (/afterschool-waiver). Just the waiver +
 * policies with an initial per section and a signature. No registration
 * questions, no payment. For a parent who only needs to sign the waiver.
 */

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30";

export default function AfterschoolWaiver() {
  const sp = new URLSearchParams(window.location.search);
  const todayIso = new Date().toISOString().slice(0, 10);

  const [parentName, setParentName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studentName, setStudentName] = useState(sp.get("student") ?? "");
  const [relationship, setRelationship] = useState("");
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const [done, setDone] = useState<{ pdfUrl: string | null } | null>(null);
  const submit = trpc.afterschoolWaiver.submit.useMutation();

  async function handleSubmit() {
    if (!parentName.trim() || !email.trim() || !phone.trim() || !studentName.trim()) {
      toast.error("Please fill in the parent, email, phone, and student name.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { toast.error("Please enter a valid email."); return; }
    for (const s of AFTERSCHOOL_WAIVER_SECTIONS) {
      if (!(initials[s.key] || "").trim()) { toast.error("Please initial every policy section."); return; }
    }
    if (!signaturePng) { toast.error("Please draw your signature."); return; }
    if (!agreed) { toast.error("Please check the agreement box."); return; }

    try {
      const r = await submit.mutateAsync({
        parentName: parentName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        studentName: studentName.trim(),
        signedRelationship: relationship.trim() || undefined,
        signedDate: todayIso,
        waiverInitials: initials,
        signaturePngDataUrl: signaturePng,
        agreedToGuidelines: true,
      });
      setDone({ pdfUrl: r.pdfUrl ?? null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      toast.error(e.message || "Could not submit the waiver. Please try again or call the school.");
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="bg-white shadow-lg border border-gray-200 p-8 sm:p-10 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-[#1a2d5a] mb-2">Waiver signed</h2>
          <p className="text-gray-600 mb-6">
            Thank you. The After-School waiver for {studentName} is signed and on file with Top Martial Arts Suwanee.
          </p>
          {done.pdfUrl && (
            <a href={done.pdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#1a2d5a] hover:bg-[#12203f] text-white font-semibold px-5 py-3 rounded-xl">
              <Download className="w-5 h-5" /> Download your signed copy
            </a>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1a2d5a] text-white py-8 px-4 text-center">
        <div className="inline-flex items-center gap-2 mb-2">
          <FileSignature className="w-5 h-5 text-[#c41e3a]" />
          <span className="text-[#c41e3a] font-semibold text-sm tracking-wide uppercase">After-School Waiver</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold">Top Martial Arts Suwanee</h1>
        <p className="text-white/80 mt-2 max-w-lg mx-auto text-sm">
          Please read each section, enter your initials, and sign at the bottom.
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <Card className="bg-white shadow-lg border border-gray-200 p-5 sm:p-6 space-y-5">
          {/* Identity */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Parent / guardian name <span className="text-red-500">*</span></label>
              <input className={inputCls} value={parentName} onChange={e => setParentName(e.target.value)} placeholder="Your full name" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Relationship to child</label>
              <input className={inputCls} value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="e.g. Mother" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Child's name <span className="text-red-500">*</span></label>
              <input className={inputCls} value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Student's full name" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
              <input type="tel" className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(770) 555-0100" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
              <p className="text-xs text-gray-400 mt-1">We'll email a signed copy here.</p>
            </div>
          </div>

          {/* Waiver sections with initials */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Waiver, Release & Policies</p>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2 border border-gray-100 rounded-lg p-3 bg-gray-50/50">
              {AFTERSCHOOL_WAIVER_SECTIONS.map(sec => (
                <div key={sec.key} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-bold text-[#1a2d5a] text-sm">{sec.title}</p>
                    <input
                      value={initials[sec.key] || ""}
                      onChange={e => setInitials(prev => ({ ...prev, [sec.key]: e.target.value.toUpperCase().slice(0, 5) }))}
                      placeholder="Initials"
                      className="w-20 shrink-0 border border-gray-300 rounded-md px-2 py-1.5 text-sm text-center uppercase focus:outline-none focus:ring-2 focus:ring-[#c41e3a]/40"
                    />
                  </div>
                  {sec.body.map((p, i) => <p key={i} className="text-xs text-gray-600 leading-relaxed mb-1.5">{p}</p>)}
                </div>
              ))}
            </div>
          </div>

          {/* Signature */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Signature <span className="text-red-500">*</span></label>
            <SignaturePad onChange={setSignaturePng} />
          </div>
          <p className="text-xs text-gray-400">Date: {todayIso}</p>

          <label className="flex items-start gap-3 cursor-pointer bg-[#1a2d5a]/5 border border-[#1a2d5a]/15 rounded-lg p-3">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#c41e3a] focus:ring-[#c41e3a]" />
            <span className="text-sm text-gray-700">
              I have read and agree to all policies above, and I understand that typing my initials and drawing my signature has the same effect as signing on paper.
            </span>
          </label>

          <Button onClick={handleSubmit} disabled={submit.isPending}
            className="w-full bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white py-3 text-base font-semibold">
            {submit.isPending ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Submitting…</>) : "Sign & submit waiver"}
          </Button>
        </Card>
        <p className="text-center text-xs text-gray-400 mt-4">Questions? Call or text (770) 277-3009.</p>
      </div>
    </div>
  );
}
