import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";

/**
 * One-tap call page. Staff land here from the "Call and take notes" button in the lead email.
 * It dials from the TMA iPhone, then stays open so notes can be saved the moment the call ends,
 * with ready-to-send texts below. The link's signed token only works for this one lead, so no
 * admin password is needed and a leaked email cannot open the rest of the CRM.
 */

interface CallData {
  lead: {
    id: number; parentName: string; kidName: string; kidAge: string; phone: string;
    programInterest: string; pipelineStage: string; fromFacebook: boolean; utmCampaign: string | null;
    trialClassDate: string | null; trialClassTime: string | null; trialClassDay: string | null;
    additionalNotes: string | null; smsConsent: boolean;
  };
  tel: string;
  fromNumber: string;
  templates: { id: string; label: string; text: string }[];
  outcomes: { id: string; label: string }[];
  activities: { id: number; type: string; subject: string | null; body: string | null; status: string | null; createdAt: string }[];
}

const STAGE_LABEL: Record<string, string> = {
  new_lead: "New lead", contacted: "Contacted", trial_scheduled: "Trial scheduled", trial_paid: "Trial paid",
  trial_attended: "Trial attended", enrolled: "Enrolled", no_show: "No show", no_show_final: "No show (final)", lost: "Lost",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }

const FOLLOW_UPS = [
  { id: "none", label: "No reminder", value: null as string | null },
  { id: "tomorrow", label: "Tomorrow", value: inDays(1) },
  { id: "3days", label: "In 3 days", value: inDays(3) },
  { id: "week", label: "Next week", value: inDays(7) },
];

function smsHref(phone: string, body: string) {
  const d = phone.replace(/\D/g, "");
  const num = d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith("1") ? `+${d}` : d;
  return `sms:${num}&body=${encodeURIComponent(body)}`;
}

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function CallConsole() {
  const [, params] = useRoute("/call/:id");
  const leadId = Number(params?.id);
  const token = useMemo(() => new URLSearchParams(window.location.search).get("t") ?? "", []);
  const q = `?t=${encodeURIComponent(token)}`;

  const [data, setData] = useState<CallData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("none");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const dialed = useRef(false);

  const load = () =>
    fetch(`/api/call/${leadId}${q}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "Could not load this lead.");
        return j as CallData;
      })
      .then(setData)
      .catch(e => setError(e.message));

  useEffect(() => { document.title = "Call | Top Martial Arts"; load(); }, []);

  const post = (path: string, body: unknown) =>
    fetch(`/api/call/${leadId}/${path}${q}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Something went wrong.");
      return j;
    });

  // Dial once per page-open. A call can send the browser back to this page, so remember (for 10
  // minutes) that we already dialed and never re-dial on a reload. "Call again" is always there.
  const dial = (d: CallData) => {
    post("start", {}).catch(() => {});
    window.location.href = d.tel;
  };
  useEffect(() => {
    if (!data || dialed.current) return;
    dialed.current = true;
    const key = `tma_dialed_${leadId}`;
    try {
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 10 * 60 * 1000) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch { /* private mode: dial anyway */ }
    dial(data);
  }, [data]);

  const save = async () => {
    if (!outcome) return;
    setSaving(true);
    try {
      const fu = FOLLOW_UPS.find(f => f.id === followUp)?.value ?? null;
      const r = await post("finish", { outcome, notes, followUp: fu });
      setSaved(r.stageChangedTo ? "Saved. Moved to Contacted." : "Saved.");
      setNotes(""); setOutcome(null); setFollowUp("none");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally { setSaving(false); }
  };

  const copy = async (t: { id: string; text: string }) => {
    try { await navigator.clipboard.writeText(t.text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = t.text; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(t.id); setTimeout(() => setCopied(c => (c === t.id ? null : c)), 1800);
  };

  if (error && !data) {
    return (
      <Shell>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">{error}</p>
          {Number.isFinite(leadId) && (
            <a className="mt-3 inline-block underline" href={`/admin/leads?focus=lead:${leadId}`}>Open this lead in the CRM</a>
          )}
        </div>
      </Shell>
    );
  }
  if (!data) return <Shell><p className="text-gray-500">Loading lead...</p></Shell>;

  const { lead } = data;
  const kid = lead.kidName && lead.kidName.toUpperCase() !== "N/A" ? lead.kidName : null;

  return (
    <Shell>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-[#1a2d5a]">{lead.parentName}</h1>
          {lead.fromFacebook && <Pill tone="blue">Facebook lead</Pill>}
          <Pill tone="gray">{STAGE_LABEL[lead.pipelineStage] ?? lead.pipelineStage}</Pill>
        </div>
        <p className="text-gray-700">
          {kid ? `${kid}${lead.kidAge && lead.kidAge.toUpperCase() !== "N/A" ? `, age ${lead.kidAge}` : ""} · ` : ""}{lead.programInterest}
        </p>
        {lead.trialClassDate && (
          <p className="text-sm font-medium text-green-800">
            Trial booked: {[lead.trialClassDay, lead.trialClassDate, lead.trialClassTime].filter(Boolean).join(" ")}
          </p>
        )}
        {!lead.smsConsent && <p className="text-sm text-amber-700">They did not tick the text consent box. Call first.</p>}
      </header>

      <a href={data.tel} onClick={() => post("start", {}).catch(() => {})}
         className="block rounded-xl bg-[#c41e3a] px-4 py-4 text-center text-lg font-bold text-white active:opacity-80">
        Call {lead.phone}
      </a>
      <p className="-mt-3 text-center text-xs text-gray-500">Calls go out from the TMA iPhone, {data.fromNumber}</p>

      <Section title="How did it go?">
        <div className="flex flex-wrap gap-2">
          {data.outcomes.map(o => (
            <button key={o.id} onClick={() => setOutcome(o.id)}
              className={`rounded-full border px-4 py-2.5 text-sm font-medium ${outcome === o.id ? "border-[#1a2d5a] bg-[#1a2d5a] text-white" : "border-gray-300 bg-white text-gray-800"}`}>
              {o.label}
            </button>
          ))}
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} maxLength={2000}
          placeholder="Notes from the call (what they said, kid's experience, best time to reach them)"
          className="mt-3 w-full rounded-lg border border-gray-300 p-3 text-base" />
        <div className="mt-3 flex flex-wrap gap-2">
          {FOLLOW_UPS.map(f => (
            <button key={f.id} onClick={() => setFollowUp(f.id)}
              className={`rounded-md border px-3 py-2 text-sm ${followUp === f.id ? "border-[#c41e3a] bg-red-50 text-[#c41e3a]" : "border-gray-300 bg-white text-gray-700"}`}>
              {f.id === "none" ? f.label : `Remind me: ${f.label}`}
            </button>
          ))}
        </div>
        <button onClick={save} disabled={!outcome || saving}
          className="mt-3 w-full rounded-lg bg-[#1a2d5a] px-4 py-3 font-semibold text-white disabled:opacity-40">
          {saving ? "Saving..." : "Save call notes"}
        </button>
        {saved && <p className="mt-2 text-sm font-medium text-green-700">{saved}</p>}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </Section>

      <Section title="Text them">
        <p className="mb-2 text-xs text-gray-500">Copy puts the message on your clipboard. Messages opens a draft to {lead.phone}.</p>
        <div className="space-y-2">
          {data.templates.map(t => (
            <div key={t.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-sm font-semibold text-[#1a2d5a]">{t.label}</p>
              <p className="mt-1 text-sm text-gray-700">{t.text}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => copy(t)}
                  className="flex-1 rounded-md bg-[#1a2d5a] px-3 py-2 text-sm font-semibold text-white">
                  {copied === t.id ? "Copied" : "Copy"}
                </button>
                <a href={smsHref(lead.phone, t.text)} onClick={() => post("texted", { templateId: t.id }).catch(() => {})}
                   className="flex-1 rounded-md border border-[#1a2d5a] px-3 py-2 text-center text-sm font-semibold text-[#1a2d5a]">
                  Open in Messages
                </a>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {data.activities.length > 0 && (
        <Section title="Recent activity">
          <ul className="space-y-2">
            {data.activities.map(a => (
              <li key={a.id} className="rounded-md border border-gray-200 bg-white p-2.5 text-sm">
                <div className="flex justify-between gap-2 text-xs text-gray-500">
                  <span className="uppercase">{a.type}</span><span>{when(a.createdAt)}</span>
                </div>
                <p className="font-medium text-gray-800">{a.subject}</p>
                {a.body && <p className="mt-0.5 whitespace-pre-wrap text-gray-600">{a.body}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="pb-8 text-center text-sm">
        <a className="text-[#1a2d5a] underline" href={`/admin/leads?focus=lead:${lead.id}`}>Open full lead in the CRM</a>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen max-w-md space-y-5 bg-gray-50 px-4 py-5">{children}</div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">{title}</h2>{children}</section>;
}
function Pill({ tone, children }: { tone: "blue" | "gray"; children: React.ReactNode }) {
  const c = tone === "blue" ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-700";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}
