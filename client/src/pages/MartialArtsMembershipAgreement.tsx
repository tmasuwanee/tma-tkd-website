import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Download } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { MARTIAL_ARTS_AGREEMENT_SECTIONS } from "@shared/martialArtsAgreement";

/**
 * Public signing page for the Martial Arts Membership Agreement (TKD / KB / BJJ).
 * Prefilled from members.generateWaiverLink querystring. Renders the exact shared
 * agreement text, collects a signature, and files it under the waivers system.
 */
export default function MartialArtsMembershipAgreement() {
  const sp = useMemo(() => new URLSearchParams(window.location.search), []);
  const [parentName, setParentName] = useState(sp.get("parentName") ?? "");
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [phone, setPhone] = useState(sp.get("phone") ?? "");
  const [studentName, setStudentName] = useState(sp.get("studentName") ?? "");
  const [relationship, setRelationship] = useState("");
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState<{ pdfUrl: string | null } | null>(null);
  const submit = trpc.mmaAgreement.submit.useMutation();

  const handleSubmit = async () => {
    if (!parentName.trim() || !email.trim() || !phone.trim() || !studentName.trim()) { toast.error("Please fill in all required fields."); return; }
    if (!signaturePng) { toast.error("Please draw your signature."); return; }
    if (!agreed) { toast.error("Please check the box to agree to the terms."); return; }
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await submit.mutateAsync({
        parentName: parentName.trim(), email: email.trim(), phone: phone.trim(), studentName: studentName.trim(),
        signedRelationship: relationship.trim() || undefined, signedDate: today, signaturePngDataUrl: signaturePng, agreedToTerms: true,
      });
      setDone({ pdfUrl: r.pdfUrl ?? null });
      window.scrollTo(0, 0);
    } catch (e) {
      toast.error((e as Error).message || "Could not submit. Please try again or call the school.");
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#1a2d5a] flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 bg-green-400 rounded-full flex items-center justify-center mb-6"><CheckCircle2 className="w-11 h-11 text-white" /></div>
        <h1 className="text-3xl font-bold text-white mb-3">Agreement signed. Thank you.</h1>
        <p className="text-white/70 text-sm max-w-sm">Your Martial Arts Membership Agreement is on file. A copy has been saved to the account.</p>
        {done.pdfUrl ? (
          <a href={done.pdfUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 bg-white text-[#1a2d5a] font-semibold rounded-lg px-4 py-2.5 text-sm">
            <Download className="w-4 h-4" /> Download signed copy
          </a>
        ) : null}
        <p className="text-white/50 text-xs mt-6 max-w-xs">Questions? Call or text (770) 277-3009.</p>
      </div>
    );
  }

  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2d5a]/30";
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a2d5a] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0"><span className="text-white text-xs font-bold">TMA</span></div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Top Martial Arts Suwanee</p>
            <p className="text-white/60 text-xs">Martial Arts Membership Agreement</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <Card className="p-4 space-y-4">
          <h2 className="text-lg font-bold text-[#1a2d5a]">Your info</h2>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Parent / guardian name <span className="text-[#c41e3a]">*</span></label>
            <input value={parentName} onChange={e => setParentName(e.target.value)} className={inp} placeholder="Your full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Student name <span className="text-[#c41e3a]">*</span></label>
              <input value={studentName} onChange={e => setStudentName(e.target.value)} className={inp} placeholder="Student's name" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Relationship</label>
              <input value={relationship} onChange={e => setRelationship(e.target.value)} className={inp} placeholder="e.g. Parent" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Email <span className="text-[#c41e3a]">*</span></label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inp} placeholder="you@email.com" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phone <span className="text-[#c41e3a]">*</span></label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inp} placeholder="(770) 555-1234" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-lg font-bold text-[#1a2d5a] mb-3">Membership agreement &amp; policies</h2>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {MARTIAL_ARTS_AGREEMENT_SECTIONS.map(sec => (
              <div key={sec.key}>
                <h3 className="text-sm font-bold text-[#1a2d5a] mb-1">{sec.title}</h3>
                {sec.body.map((p, i) => <p key={i} className="text-xs text-gray-600 leading-relaxed mb-1.5">{p}</p>)}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-lg font-bold text-[#1a2d5a]">Signature</h2>
          <SignaturePad onChange={setSignaturePng} />
          <label className="flex items-start gap-3 p-3 bg-[#1a2d5a]/5 border border-[#1a2d5a]/20 rounded-xl cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="text-xs text-gray-700 leading-relaxed">I have read and agree to all policies above, and I understand that drawing my signature has the same effect as signing on paper. If the student is under 18, I am the parent or legal guardian.</span>
          </label>
          <Button onClick={handleSubmit} disabled={submit.isPending} className="w-full bg-[#c41e3a] hover:bg-[#a81830] text-white text-base font-semibold h-12 rounded-xl">
            {submit.isPending ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Submitting...</>) : "Sign & submit agreement"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
