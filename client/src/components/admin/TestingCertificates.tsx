import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Award, Download, Eye, Plus, Printer, Trash2, ClipboardPaste, Ruler } from "lucide-react";
import {
  buildCertificatesPdf, dateParts, parseRoster, STYLES, DEFAULT_STYLE, styleById,
  type CertRow, type FontBytes, type Orientation, type StyleId,
} from "@/lib/certificatePdf";

/**
 * Belt-testing certificates: list each student, the rank they are testing for and the date, then
 * make one PDF (one certificate per page, in this order) to print on the pre-printed certificate paper.
 * Everything is built in this browser tab. Student names are never sent to the server. The list is
 * remembered on this computer only (localStorage) so a refresh does not lose 50 names.
 */

const STORE = "tma_testing_certificates_v1";

// Typical Taekwondo ranks, offered as suggestions only. The Rank box accepts anything you type.
const RANKS = [
  "White Belt", "Yellow Belt", "Orange Belt", "Green Belt", "Blue Belt", "Purple Belt", "Brown Belt", "Red Belt",
  "1st Degree Black Belt", "2nd Degree Black Belt", "3rd Degree Black Belt", "4th Degree Black Belt",
];

const LAYOUTS: { value: Orientation; label: string; help: string }[] = [
  { value: "portrait-a", label: "Sideways, top on the right (recommended)", help: "Matches how the certificate paper sits in the printer." },
  { value: "portrait-b", label: "Sideways, top on the left", help: "Use this if the first one comes out upside down." },
  { value: "landscape", label: "Landscape page", help: "Only if the printer turns the page for you." },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Saved { rows: CertRow[]; testDate: string; layout: Orientation; style: StyleId }

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const j = JSON.parse(raw);
      if (Array.isArray(j.rows)) return { rows: j.rows, testDate: j.testDate || todayISO(), layout: j.layout || "portrait-a", style: styleById(j.style).id };
    }
  } catch { /* private window or bad data: start fresh */ }
  return { rows: [], testDate: todayISO(), layout: "portrait-a", style: DEFAULT_STYLE };
}

const fontFiles = new Map<string, Promise<Uint8Array>>();
function fetchFont(file: string): Promise<Uint8Array> {
  let p = fontFiles.get(file);
  if (!p) {
    p = fetch(`/fonts/${file}`).then(async r => {
      if (!r.ok) throw new Error(`Could not load the ${file} font.`);
      return new Uint8Array(await r.arrayBuffer());
    });
    p.catch(() => fontFiles.delete(file));   // retry next time instead of caching a failure
    fontFiles.set(file, p);
  }
  return p;
}
async function loadFonts(style: StyleId): Promise<FontBytes> {
  const st = styleById(style);
  const [name, rank] = await Promise.all([fetchFont(st.nameFont), fetchFont(st.rankFont)]);
  return { name, rank };
}

function blobUrl(bytes: Uint8Array) {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
}

export default function TestingCertificates() {
  const initial = useMemo(load, []);
  const [rows, setRows] = useState<CertRow[]>(initial.rows);
  const [testDate, setTestDate] = useState(initial.testDate);
  const [layout, setLayout] = useState<Orientation>(initial.layout);
  const [style, setStyle] = useState<StyleId>(initial.style);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const tableEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ rows, testDate, layout, style })); } catch { /* ignore */ }
  }, [rows, testDate, layout, style]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const issues = useMemo(() => rows.map((r, i) => {
    if (!r.name.trim() && !r.rank.trim()) return null;           // an untouched blank row is not an error
    if (!r.name.trim()) return "Needs a name";
    if (!r.rank.trim()) return "Needs a rank";
    if (!dateParts(r.date)) return "Needs a date";
    return null;
  }), [rows]);
  const ready = rows.filter((r, i) => r.name.trim() && r.rank.trim() && dateParts(r.date));
  const problemCount = issues.filter(Boolean).length;

  const update = (i: number, patch: Partial<CertRow>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = (focus = true) => {
    setRows(rs => [...rs, { name: "", rank: rs.length ? rs[rs.length - 1].rank : "", date: testDate }]);
    if (focus) setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-cert-name="${rows.length}"]`);
      el?.focus();
      tableEnd.current?.scrollIntoView({ block: "nearest" });
    }, 30);
  };
  const remove = (i: number) => setRows(rs => rs.filter((_, j) => j !== i));

  const importPaste = () => {
    const added = parseRoster(paste, testDate);
    if (!added.length) { toast.error("Nothing to add. Type one student per line, like: Tyler Le, Yellow Belt"); return; }
    setRows(rs => [...rs, ...added]);
    setPaste(""); setShowPaste(false);
    toast.success(`Added ${added.length} student${added.length === 1 ? "" : "s"}.`);
  };

  async function make(kind: "download" | "open" | "preview" | "test") {
    const list = kind === "preview" || kind === "test" ? ready.slice(0, 1) : ready;
    if (!list.length) { toast.error("Add at least one student with a name, rank and date first."); return; }
    setBusy(kind);
    try {
      const fonts = await loadFonts(style);
      const res = await buildCertificatesPdf(list, fonts, { orientation: layout, style, guides: kind === "preview" || kind === "test" });
      if (!res.pages) { toast.error(res.problems[0]?.reason ?? "Nothing to print."); return; }
      if (res.problems.length) toast.error(`${res.problems.length} skipped: ${res.problems.map(p => `${p.name} (${p.reason})`).join("; ")}`);
      const url = blobUrl(res.bytes);
      if (kind === "preview") { setPreview(url); return; }
      if (kind === "open") { window.open(url, "_blank"); return; }
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "test" ? "alignment-test-with-guide-lines.pdf" : `testing-certificates-${testDate}-${res.pages}-pages.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success(kind === "test" ? "Test sheet downloaded. Print it on plain paper." : `Downloaded ${res.pages} certificate${res.pages === 1 ? "" : "s"}.`);
    } catch (e: any) {
      toast.error(e?.message || "Could not build the PDF.");
    } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#1a2d5a]"><Award className="h-6 w-6" /> Testing Certificates</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            List each student, the rank they are testing for, and the date. This makes one PDF with one certificate per page, in this order,
            ready to print on the pre-printed belt certificate paper. Master Jo's signature lines are left blank for him to sign.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-right">
          <p className="text-2xl font-bold text-[#1a2d5a]">{ready.length}</p>
          <p className="text-xs text-gray-500">certificate{ready.length === 1 ? "" : "s"} = {ready.length} page{ready.length === 1 ? "" : "s"}</p>
        </div>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Testing date</span>
          <Input type="date" value={testDate} onChange={e => setTestDate(e.target.value)} className="w-44" />
        </label>
        <Button variant="outline" onClick={() => { setRows(rs => rs.map(r => ({ ...r, date: testDate }))); toast.success("Every row now uses this date."); }}
          disabled={!rows.length}>Use this date for every row</Button>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Font style</span>
          <select value={style} onChange={e => setStyle(e.target.value as StyleId)}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
            {STYLES.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Page layout</span>
          <select value={layout} onChange={e => setLayout(e.target.value as Orientation)}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
            {LAYOUTS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        <p className="basis-full text-xs text-gray-500">{styleById(style).description} {LAYOUTS.find(l => l.value === layout)?.help}</p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-3">
          <h2 className="font-semibold text-gray-800">Students ({rows.length})</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowPaste(s => !s)}><ClipboardPaste className="mr-1 h-4 w-4" /> Paste a list</Button>
            <Button size="sm" onClick={() => addRow()} className="bg-[#1a2d5a] hover:bg-[#142347]"><Plus className="mr-1 h-4 w-4" /> Add student</Button>
            <Button size="sm" variant="ghost" className="text-red-600" disabled={!rows.length}
              onClick={() => { if (window.confirm(`Clear all ${rows.length} students?`)) setRows([]); }}>Clear all</Button>
          </div>
        </div>

        {showPaste && (
          <div className="space-y-2 border-b border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-700">One student per line: name, then rank. Each uses the testing date above, and you can fix any of them in the table afterward.</p>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={6}
              placeholder={"Tyler Le, Yellow Belt\nAlex Coronado Luna, 1st Degree Black Belt\nSam Ng, Green Belt"}
              className="w-full rounded-md border border-gray-300 p-2 font-mono text-sm" />
            <div className="flex gap-2">
              <Button size="sm" onClick={importPaste} className="bg-[#1a2d5a] hover:bg-[#142347]">Add these students</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowPaste(false); setPaste(""); }}>Cancel</Button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">No students yet. Add one, or paste a whole list.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="w-12 px-3 py-2">#</th><th className="px-2 py-2">Student</th><th className="px-2 py-2">Rank testing for</th><th className="px-2 py-2">Date</th><th className="w-10" /></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 font-semibold text-gray-500">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <Input data-cert-name={i} value={r.name} onChange={e => update(i, { name: e.target.value })} placeholder="Student name" />
                      {issues[i] && <p className="mt-0.5 text-xs text-red-600">{issues[i]}</p>}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input list="cert-ranks" value={r.rank} onChange={e => update(i, { rank: e.target.value })} placeholder="Yellow Belt"
                        onKeyDown={e => { if (e.key === "Enter" && i === rows.length - 1) { e.preventDefault(); addRow(); } }} />
                    </td>
                    <td className="px-2 py-1.5"><Input type="date" value={r.date} onChange={e => update(i, { date: e.target.value })} className="w-40" /></td>
                    <td className="px-1 py-1.5"><button aria-label={`Remove ${r.name || `row ${i + 1}`}`} onClick={() => remove(i)} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="cert-ranks">{RANKS.map(r => <option key={r} value={r} />)}</datalist>
            <div ref={tableEnd} />
          </div>
        )}
        {problemCount > 0 && <p className="border-t border-gray-100 p-3 text-sm text-amber-700">{problemCount} row{problemCount === 1 ? "" : "s"} still {problemCount === 1 ? "needs" : "need"} something and will be left out of the PDF.</p>}
      </section>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-800">Make the PDF</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => make("download")} disabled={!!busy || !ready.length} className="bg-[#c41e3a] hover:bg-[#a51830]">
            <Download className="mr-1 h-4 w-4" /> {busy === "download" ? "Building..." : `Download all ${ready.length} certificate${ready.length === 1 ? "" : "s"}`}
          </Button>
          <Button variant="outline" onClick={() => make("open")} disabled={!!busy || !ready.length}><Printer className="mr-1 h-4 w-4" /> Open to print</Button>
          <Button variant="outline" onClick={() => make("preview")} disabled={!!busy || !ready.length}><Eye className="mr-1 h-4 w-4" /> Preview the first one</Button>
          <Button variant="outline" onClick={() => make("test")} disabled={!!busy || !ready.length}><Ruler className="mr-1 h-4 w-4" /> Alignment test sheet</Button>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-600">
          <li>Download the <b>Alignment test sheet</b> and print it on <b>plain paper</b>. It has light guide lines.</li>
          <li>Hold it against a blank certificate in the light. The guide lines should sit on the printed lines. If it is upside down, switch the page layout above.</li>
          <li>When it lines up, print the real PDF on the certificate paper. In the print window choose <b>Portrait, Letter, Actual size (100%)</b>. Do not pick "Fit to page."</li>
        </ol>
        {preview && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Preview. The gray lines are guides and do not print on the real certificates.</p>
            <iframe title="Certificate preview" src={`${preview}#toolbar=0&navpanes=0`} className="h-[520px] w-full rounded-md border border-gray-200" />
          </div>
        )}
      </section>
    </div>
  );
}
