import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Phone, PhoneIncoming, PhoneOutgoing, MessageSquare, Clock,
  Eye, EyeOff, LogOut, RefreshCw, PlayCircle, Smile, Meh, Frown,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Auth (same gate as the rest of /admin) ──────────────────────────────────
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
          <CardTitle className="text-xl text-[#1a2d5a]">Call Log</CardTitle>
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

// ─── helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso?: string | Date | null) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function clockTime(iso?: string | Date | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function fmtDur(sec?: number | null) {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function isToday(iso?: string | Date | null) {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function Sentiment({ s }: { s?: string | null }) {
  if (!s) return null;
  const v = s.toLowerCase();
  if (v.includes("positive")) return <span className="inline-flex items-center gap-1 text-green-600"><Smile className="w-3.5 h-3.5" />Positive</span>;
  if (v.includes("negative")) return <span className="inline-flex items-center gap-1 text-red-600"><Frown className="w-3.5 h-3.5" />Negative</span>;
  return <span className="inline-flex items-center gap-1 text-gray-500"><Meh className="w-3.5 h-3.5" />{s}</span>;
}

/** Parse a Retell transcript string ("Agent: ...\nUser: ...") into bubbles. */
function parseTranscript(t?: string | null): { who: "agent" | "user"; text: string }[] {
  if (!t) return [];
  const out: { who: "agent" | "user"; text: string }[] = [];
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(agent|assistant|ai|bot|user|caller|human)\s*[:\-]\s*(.*)$/i);
    if (m) {
      const who = /agent|assistant|ai|bot/i.test(m[1]) ? "agent" : "user";
      out.push({ who, text: m[2] });
    } else if (out.length) {
      out[out.length - 1].text += " " + line;
    } else {
      out.push({ who: "agent", text: line });
    }
  }
  return out;
}

function DirectionIcon({ d }: { d: string }) {
  return d === "outbound"
    ? <PhoneOutgoing className="w-4 h-4 text-[#c41e3a]" />
    : <PhoneIncoming className="w-4 h-4 text-[#1a2d5a]" />;
}

// ─── inbox row ────────────────────────────────────────────────────────────────
function CallRow({ row, onClick }: { row: any; onClick: () => void }) {
  const name = row.callerName || row.fromNumber || "Unknown caller";
  return (
    <button onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 hover:border-[#1a2d5a] hover:bg-gray-50 rounded-lg px-3 py-2.5 transition-colors shadow-sm flex items-start gap-3">
      <div className="mt-0.5"><DirectionIcon d={row.direction} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#1a2d5a] truncate">{name}</span>
          {row.booked ? <Badge className="bg-green-100 text-green-700 text-[10px]">booked</Badge> : null}
        </div>
        <div className="text-xs text-gray-600 truncate mt-0.5">
          {row.summary || <span className="italic text-gray-400">no summary</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-[11px] text-gray-400">{timeAgo(row.createdAt)}</span>
        {row.durationSec ? <span className="text-[10px] font-mono text-gray-400">{fmtDur(row.durationSec)}</span> : null}
      </div>
    </button>
  );
}

// ─── Gmail-style detail panel ─────────────────────────────────────────────────
function CallDetail({ row, onClose }: { row: any | null; onClose: () => void }) {
  if (!row) return null;
  const name = row.callerName || row.fromNumber || "Unknown caller";
  const bubbles = parseTranscript(row.transcript);
  const number = row.direction === "outbound" ? row.toNumber : row.fromNumber;

  return (
    <Dialog open={!!row} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1a2d5a]">
            <DirectionIcon d={row.direction} />
            {name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* meta line */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span className="capitalize">{row.direction}</span>
            {number ? <span>· {number}</span> : null}
            {row.durationSec ? <span>· {fmtDur(row.durationSec)}</span> : null}
            <span>· {clockTime(row.createdAt)}</span>
            {row.sentiment ? <span>· <Sentiment s={row.sentiment} /></span> : null}
          </div>

          {/* quick actions */}
          {number ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <a href={`tel:${number}`} className="flex items-center gap-1 bg-[#c41e3a] text-white px-3 py-1.5 rounded">
                <Phone className="w-3.5 h-3.5" /> Call back
              </a>
              <a href={`sms:${number}`} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded">
                <MessageSquare className="w-3.5 h-3.5" /> Text
              </a>
              {row.recordingUrl ? (
                <a href={row.recordingUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded">
                  <PlayCircle className="w-3.5 h-3.5" /> Recording
                </a>
              ) : null}
            </div>
          ) : null}

          {/* summary */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <div className="text-xs font-semibold text-blue-900 mb-1">Summary</div>
            <div className="text-sm text-blue-900 leading-relaxed">
              {row.summary || <span className="italic text-blue-400">No summary was captured for this call.</span>}
            </div>
          </div>

          {/* transcript */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-2">Transcript</div>
            {bubbles.length === 0 ? (
              <div className="text-xs text-gray-400 italic">No transcript available.</div>
            ) : (
              <div className="space-y-2">
                {bubbles.map((b, i) => (
                  <div key={i} className={`flex ${b.who === "agent" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm leading-snug ${
                      b.who === "agent"
                        ? "bg-gray-100 text-gray-800 rounded-tl-sm"
                        : "bg-[#1a2d5a] text-white rounded-tr-sm"
                    }`}>
                      <div className="text-[9px] uppercase tracking-wide opacity-60 mb-0.5">
                        {b.who === "agent" ? "Agent" : "Caller"}
                      </div>
                      {b.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {row.disconnectReason ? (
            <div className="text-[10px] text-gray-400">Ended: {row.disconnectReason}</div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── app ──────────────────────────────────────────────────────────────────────
export function CallLogApp({ email, onLogout, embedded }: { email: string; onLogout?: () => void; embedded?: boolean }) {
  const [active, setActive] = useState<any | null>(null);
  const listQuery = trpc.callLog.list.useQuery({ limit: 100, offset: 0 }, { refetchOnWindowFocus: false });
  const utils = trpc.useUtils();
  const rows = listQuery.data ?? [];

  const { today, earlier } = useMemo(() => {
    const t: any[] = [], e: any[] = [];
    for (const r of rows) (isToday(r.createdAt) ? t : e).push(r);
    return { today: t, earlier: e };
  }, [rows]);

  return (
    <div className={embedded ? "pb-12" : "min-h-screen bg-gray-50 pb-24"}>
      {!embedded && (
      <div className="bg-[#1a2d5a] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5" />
          <div>
            <div className="font-semibold text-sm">Call Log</div>
            <div className="text-xs text-blue-200">{email}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10"
            onClick={() => utils.callLog.list.invalidate()}>
            <RefreshCw className={`w-4 h-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
        {listQuery.isLoading ? (
          <div className="text-center py-12 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm bg-white rounded border border-dashed">
            No calls logged yet. Inbound and outbound calls will appear here automatically.
          </div>
        ) : (
          <>
            {today.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Recent ({today.length})
                </h2>
                <div className="space-y-2">
                  {today.map((r: any) => <CallRow key={r.id} row={r} onClick={() => setActive(r)} />)}
                </div>
              </div>
            )}
            {earlier.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Earlier ({earlier.length})
                </h2>
                <div className="space-y-2">
                  {earlier.map((r: any) => <CallRow key={r.id} row={r} onClick={() => setActive(r)} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <CallDetail row={active} onClose={() => setActive(null)} />
    </div>
  );
}

export default function AdminCallLog() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setEmail(saved);
  }, []);
  if (!email) return <LoginGate onLogin={setEmail} />;
  return <CallLogApp email={email} onLogout={() => {
    sessionStorage.removeItem(SESSION_KEY);
    setEmail(null);
  }} />;
}
