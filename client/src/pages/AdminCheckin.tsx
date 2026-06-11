import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardCheck, Eye, EyeOff, LogOut, Check, X, Phone, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ALLOWED_EMAILS = ["tmasuwanee@gmail.com", "coacharfasc@gmail.com"];
const PASSWORD = "Keep9oing!";
const SESSION_KEY = "tma_admin_session";

function LoginGate({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ALLOWED_EMAILS.includes(email.trim().toLowerCase()) && password === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, email.trim().toLowerCase());
      onLogin(email.trim().toLowerCase());
    } else setError("Incorrect email or password.");
  };
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 bg-[#1a2d5a] rounded-xl flex items-center justify-center mx-auto mb-3">
            <ClipboardCheck className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-xl text-[#1a2d5a]">Trial Check-in</CardTitle>
          <p className="text-sm text-gray-500">Did they show up?</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full bg-[#1a2d5a] hover:bg-[#142347]">Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function LeadRow({ lead, onMark, busy }: { lead: any; onMark: (showed: boolean) => void; busy: boolean }) {
  const marked = lead.pipelineStage === "trial_attended" ? "showed"
    : lead.pipelineStage === "no_show" ? "noshow" : null;
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[#1a2d5a]">{lead.parentName}{lead.kidName ? ` — ${lead.kidName}` : ""}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {lead.kidAge ? `age ${lead.kidAge} · ` : ""}{lead.programInterest || ""}
            {lead.trialClassTime ? ` · ${lead.trialClassTime}` : ""}
          </div>
          <a href={`tel:${lead.phone}`} className="text-xs text-[#c41e3a] mt-1 inline-flex items-center gap-1">
            <Phone className="w-3 h-3" /> {lead.phone}
          </a>
        </div>
        {marked && (
          <span className={`text-[10px] font-semibold px-2 py-1 rounded ${marked === "showed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {marked === "showed" ? "SHOWED" : "NO-SHOW"}
          </span>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" disabled={busy} onClick={() => onMark(true)}
          className={`flex-1 ${marked === "showed" ? "bg-green-600 hover:bg-green-700" : "bg-white border border-green-600 text-green-700 hover:bg-green-50"}`}>
          <Check className="w-4 h-4 mr-1" /> Showed up
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onMark(false)}
          className={`flex-1 ${marked === "noshow" ? "bg-red-600 hover:bg-red-700" : "bg-white border border-red-500 text-red-600 hover:bg-red-50"}`}>
          <X className="w-4 h-4 mr-1" /> No-show
        </Button>
      </div>
    </div>
  );
}

function CheckinApp({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [date, setDate] = useState(todayET());
  const [busyId, setBusyId] = useState<number | null>(null);
  const listQuery = trpc.checkin.listForDate.useQuery({ date }, { refetchOnWindowFocus: false });
  const mark = trpc.checkin.mark.useMutation();
  const utils = trpc.useUtils();

  const leads = listQuery.data?.leads ?? [];
  const unmarked = leads.filter((l: any) => l.pipelineStage === "trial_scheduled");
  const done = leads.filter((l: any) => l.pipelineStage !== "trial_scheduled");

  async function onMark(leadId: number, showed: boolean) {
    setBusyId(leadId);
    try {
      await mark.mutateAsync({ leadId, showed });
      await utils.checkin.listForDate.invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-[#1a2d5a] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" />
          <div>
            <div className="font-semibold text-sm">Trial Check-in</div>
            <div className="text-xs text-blue-200">{email}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onLogout}>
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="text-sm" />
        </div>

        {listQuery.isLoading ? (
          <div className="py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : leads.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm bg-white rounded border border-dashed">No trials scheduled for this date.</div>
        ) : (
          <>
            {unmarked.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Need marking ({unmarked.length})</h2>
                <div className="space-y-2">
                  {unmarked.map((l: any) => (
                    <LeadRow key={l.id} lead={l} busy={busyId === l.id} onMark={(s) => onMark(l.id, s)} />
                  ))}
                </div>
              </div>
            )}
            {done.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Marked ({done.length})</h2>
                <div className="space-y-2">
                  {done.map((l: any) => (
                    <LeadRow key={l.id} lead={l} busy={busyId === l.id} onMark={(s) => onMark(l.id, s)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminCheckin() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setEmail(saved);
  }, []);
  if (!email) return <LoginGate onLogin={setEmail} />;
  return <CheckinApp email={email} onLogout={() => { sessionStorage.removeItem(SESSION_KEY); setEmail(null); }} />;
}
