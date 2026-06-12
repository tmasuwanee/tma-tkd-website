import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Phone, MessageSquare, Mail, Check, X, Clock, Eye, EyeOff, LogOut,
  Calendar, RefreshCw, ChevronRight, AlertCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Auth (matches the rest of /admin) ───────────────────────────────────────
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
    } else {
      setError("Incorrect email or password.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 bg-[#1a2d5a] rounded-xl flex items-center justify-center mx-auto mb-3">
            <Phone className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-xl text-[#1a2d5a]">Today's Calls</CardTitle>
          <p className="text-sm text-gray-500">TMA admin</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email}
                onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPw ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
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

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(ms / (1000 * 60));
  return `${Math.max(mins, 1)}m ago`;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  answered: "bg-blue-100 text-blue-700",
  voicemail: "bg-purple-100 text-purple-700",
  no_answer: "bg-yellow-100 text-yellow-700",
  booked: "bg-green-100 text-green-700",
  not_interested: "bg-red-100 text-red-700",
  callback_later: "bg-orange-100 text-orange-700",
  skipped: "bg-gray-100 text-gray-500",
};

function CallCard({ row, onClick }: { row: any; onClick: () => void }) {
  const lead = row.lead;
  if (!lead) return null;
  return (
    <button onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 hover:border-[#1a2d5a] rounded-lg p-4 transition-colors shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-[#1a2d5a]">{lead.parentName}</div>
            <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[row.status]}`}>
              {row.status}
            </Badge>
          </div>
          <div className="text-xs text-gray-600 mt-0.5">
            Kid: <strong>{lead.kidName}</strong> ({lead.kidAge})
          </div>
          {row.vertical && (
            <div className="text-xs text-gray-500 mt-0.5">
              Interest: {row.vertical}
            </div>
          )}
          <div className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {row.reason || "general follow-up"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded">
            score {row.score}
          </div>
          <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()}
            className="text-xs bg-[#c41e3a] text-white px-2 py-1 rounded flex items-center gap-1">
            <Phone className="w-3 h-3" /> {lead.phone}
          </a>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
        <span className="text-gray-500">Stage: <strong>{lead.pipelineStage}</strong></span>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </button>
  );
}

function CallDetailModal({ row, email, onClose, onSaved }: {
  row: any | null;
  email: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<string>("answered");
  const [notes, setNotes] = useState("");
  const mark = trpc.calls.markOutcome.useMutation();
  const activityQuery = trpc.calls.leadActivity.useQuery(
    { leadId: row?.leadId ?? 0, limit: 10 },
    { enabled: !!row, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (row) {
      setStatus(row.status === "pending" ? "answered" : row.status);
      setNotes(row.outcomeNotes ?? "");
    }
  }, [row?.id]);

  if (!row) return null;
  const lead = row.lead;

  async function save() {
    try {
      await mark.mutateAsync({
        id: row.id,
        status: status as any,
        outcomeNotes: notes || undefined,
        calledBy: email,
      });
      toast.success("Outcome saved");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#1a2d5a]">
            {lead?.parentName} — {lead?.kidName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {lead?.kidAge}y old, interested in {row.vertical || "n/a"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <a href={`tel:${lead?.phone}`}
              className="flex items-center gap-1 bg-[#c41e3a] text-white px-3 py-1.5 rounded">
              <Phone className="w-3.5 h-3.5" /> {lead?.phone}
            </a>
            {lead?.email && (
              <a href={`mailto:${lead.email}`}
                className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded">
                <Mail className="w-3.5 h-3.5" /> {lead.email}
              </a>
            )}
            {lead?.phone && (
              <a href={`sms:${lead.phone}`}
                className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded">
                <MessageSquare className="w-3.5 h-3.5" /> Text
              </a>
            )}
          </div>

          {/* Why we're calling */}
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs">
            <div className="font-semibold text-yellow-900 mb-1">Why this call</div>
            <div className="text-yellow-800">{row.reason || "general follow-up"}</div>
            <div className="text-yellow-700 mt-1">
              Lead since {timeAgo(lead?.createdAt)} · stage <strong>{lead?.pipelineStage}</strong>
            </div>
          </div>

          {/* Activity history */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1.5">Recent activity</div>
            {activityQuery.isLoading ? (
              <div className="text-xs text-gray-400">Loading...</div>
            ) : activityQuery.data && activityQuery.data.length > 0 ? (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {activityQuery.data.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs border-l-2 border-gray-200 pl-2">
                    <div className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                      a.direction === "inbound" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {a.type}{a.direction === "inbound" ? " IN" : ""}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-700 truncate">{a.subject || "(no subject)"}</div>
                      <div className="text-gray-400 text-[10px]">{timeAgo(a.createdAt)} · {a.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400">No activity yet.</div>
            )}
          </div>

          {/* Suggested talking points */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1.5">Suggested opener</div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900 leading-relaxed">
              "Hi {lead?.parentName?.split(" ")[0]}, this is Master Arfa from TMA Suwanee.
              We have early-bird pricing for summer camp running this week. {lead?.kidName} would be welcome
              for any of the remaining weeks. Got a minute?"
            </div>
          </div>

          {/* Outcome */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs font-semibold">Outcome</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="answered">Answered (talked)</SelectItem>
                <SelectItem value="booked">Booked / Enrolled</SelectItem>
                <SelectItem value="voicemail">Left voicemail</SelectItem>
                <SelectItem value="no_answer">No answer</SelectItem>
                <SelectItem value="callback_later">Callback later</SelectItem>
                <SelectItem value="not_interested">Not interested</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>

            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Anything to remember for next time..." rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={mark.isPending} className="bg-[#1a2d5a] hover:bg-[#142347]">
            {mark.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Save</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CallsApp({ email, onLogout, embedded }: { email: string; onLogout?: () => void; embedded?: boolean }) {
  const [date, setDate] = useState(todayString());
  const [activeRow, setActiveRow] = useState<any | null>(null);
  const [activeVertical, setActiveVertical] = useState("Summer Camp");
  const listQuery = trpc.calls.listToday.useQuery({ date }, { refetchOnWindowFocus: false });
  const generate = trpc.calls.generateToday.useMutation();
  const utils = trpc.useUtils();

  const items = listQuery.data ?? [];
  const pending = items.filter((r: any) => r.status === "pending");
  const completed = items.filter((r: any) => r.status !== "pending");

  async function regenerate() {
    try {
      const inserted = await generate.mutateAsync({
        limit: 5,
        activeVertical: activeVertical || undefined,
      });
      toast.success(`Queued ${inserted.length} call(s) for today`);
      await utils.calls.listToday.invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate");
    }
  }

  return (
    <div className={embedded ? "pb-12" : "min-h-screen bg-gray-50 pb-24"}>
      {!embedded && (
      <div className="bg-[#1a2d5a] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5" />
          <div>
            <div className="font-semibold text-sm">Today's Calls</div>
            <div className="text-xs text-blue-200">{email}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onLogout}>
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Date + regen controls */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Active campaign</Label>
              <Input value={activeVertical} onChange={e => setActiveVertical(e.target.value)}
                placeholder="Summer Camp" className="text-sm" />
            </div>
            <Button onClick={regenerate} disabled={generate.isPending}
              className="w-full bg-[#c41e3a] hover:bg-[#a31931]">
              {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Generate top 5 for today
            </Button>
            <p className="text-[10px] text-gray-400 text-center">
              The 8am cron will eventually do this. For now, hit the button.
            </p>
          </CardContent>
        </Card>

        {/* Pending */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            To call ({pending.length})
          </h2>
          {listQuery.isLoading ? (
            <div className="text-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          ) : pending.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm bg-white rounded border border-dashed">
              No pending calls. Hit "Generate" above.
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map((row: any) => (
                <CallCard key={row.id} row={row} onClick={() => setActiveRow(row)} />
              ))}
            </div>
          )}
        </div>

        {/* Done */}
        {completed.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              Completed ({completed.length})
            </h2>
            <div className="space-y-2">
              {completed.map((row: any) => (
                <CallCard key={row.id} row={row} onClick={() => setActiveRow(row)} />
              ))}
            </div>
          </div>
        )}
      </div>

      <CallDetailModal row={activeRow} email={email}
        onClose={() => setActiveRow(null)}
        onSaved={() => utils.calls.listToday.invalidate()} />
    </div>
  );
}

export default function AdminTodaysCalls() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setEmail(saved);
  }, []);

  if (!email) return <LoginGate onLogin={setEmail} />;
  return <CallsApp email={email} onLogout={() => {
    sessionStorage.removeItem(SESSION_KEY);
    setEmail(null);
  }} />;
}
