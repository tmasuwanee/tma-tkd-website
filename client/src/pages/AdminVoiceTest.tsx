import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, PhoneOutgoing, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

// Staff QA tool: have the OUTBOUND agent call your own phone to test each
// scenario. Passcode-gated server-side (no login needed; the passcode IS the
// gate). Calls only the number entered. Does not touch the crons.
const SCENARIOS = [
  { key: "speed_to_lead", label: "New inquiry callback", desc: "Acts like you just asked about a free trial and it's calling you back fast." },
  { key: "no_show", label: "Missed-trial recovery", desc: "Acts like you booked a trial and didn't show, it calls to rebook." },
  { key: "post_trial", label: "After-trial follow-up", desc: "Acts like you came to a trial a few days ago, it follows up." },
  { key: "afterschool_tour", label: "After-school tour", desc: "Acts like you asked about after-school, it offers a tour." },
];

export default function AdminVoiceTest() {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(callType: string) {
    setBusy(callType); setMsg(null);
    try {
      const r = await fetch("/api/voice/test-outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, passcode, call_type: callType }),
      });
      const j = await r.json();
      if (j.ok) setMsg({ ok: true, text: "Calling your phone now. Pick up to test the agent." });
      else setMsg({ ok: false, text: j.error || "Something went wrong." });
    } catch {
      setMsg({ ok: false, text: "Network error. Please try again." });
    } finally { setBusy(null); }
  }

  const ready = phone.replace(/\D/g, "").length >= 10 && passcode.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 bg-[#1a2d5a] rounded-xl flex items-center justify-center mx-auto mb-3">
            <PhoneOutgoing className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-xl text-[#1a2d5a]">Outbound Agent Tester</CardTitle>
          <p className="text-sm text-gray-500">TMA staff QA</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Your phone number</Label>
            <Input id="phone" type="tel" placeholder="(770) 555-1234" value={phone}
              onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Your first name (optional)</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Aniessa" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pass">Passcode</Label>
            <Input id="pass" type="password" value={passcode}
              onChange={e => setPasscode(e.target.value)} placeholder="ask Arfa" />
          </div>

          <div className="pt-2 space-y-2">
            <p className="text-xs text-gray-500">
              Tap a scenario. The agent will call your phone, pick up and talk to it like a parent
              would, then write down anything that felt off (weird pronunciations, awkward spots, etc.).
            </p>
            {SCENARIOS.map(s => (
              <button key={s.key} disabled={!ready || !!busy} onClick={() => call(s.key)}
                className="w-full text-left bg-white border border-gray-200 enabled:hover:border-[#1a2d5a] disabled:opacity-50 rounded-lg p-3 transition-colors shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#1a2d5a]">{s.label}</span>
                  {busy === s.key
                    ? <Loader2 className="w-4 h-4 animate-spin text-[#c41e3a]" />
                    : <Phone className="w-4 h-4 text-[#c41e3a]" />}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>

          {msg && (
            <div className={`flex items-start gap-2 text-sm rounded p-3 ${msg.ok
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"}`}>
              {msg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              {msg.text}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
