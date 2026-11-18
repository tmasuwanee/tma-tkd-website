import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Award, ArrowLeft, ChevronLeft, ChevronRight, Download, ListPlus, PenLine, Pencil, Plus, Printer, Trash2, TriangleAlert,
} from "lucide-react";
import blankScan from "@/assets/belt-certificate-blank.jpg";
import {
  buildCertificatesPdf, createLayouter, dateParts, normalizeRank, parseNames, rankOrder, styleById, STYLES, DEFAULT_STYLE,
  COLOR_BELTS, GUIDE_LINES,
  type CertRow, type FontBytes, type Layouter, type Orientation, type PlacedText, type StyleId,
} from "@/lib/certificatePdf";

/**
 * Belt-testing certificates.
 *  Left:  pick a belt, then list the students testing for it (one table per belt), or paste a list.
 *  Right: a live preview on the real blank certificate, plus the different looks to choose from.
 * "Print all" opens a print preview with every certificate's words in the right place on a blank page
 * (sorted by belt), then prints the PDF.
 *
 * Everything is built in this browser tab, so student names (mostly children) never reach the server. The
 * list is remembered on this computer only (localStorage) so a refresh does not lose 50 names.
 */

const STORE = "tma_testing_certificates_v2";

type BeltKey = (typeof COLOR_BELTS)[number] | "Black" | "Other";

// Swatch colors for the belt buttons. Order of COLOR_BELTS is TMA's belt order.
const SWATCH: Record<string, string> = {
  White: "#ffffff", Yellow: "#facc15", Orange: "#fb923c", Green: "#22c55e", Purple: "#8b5cf6", Blue: "#3b82f6",
  Brown: "#92400e", Red: "#ef4444", "High-Red": "#b91c1c",
  "Pre-Black": "linear-gradient(90deg,#ef4444 0 50%,#111827 50% 100%)", Black: "#111827", Other: "#e5e7eb",
};
const BELT_KEYS: BeltKey[] = [...COLOR_BELTS, "Black", "Other"];
const DANS = ["1st", "2nd"];
const LEVELS = ["1", "2", "3", "4", "5"];

const LAYOUTS: { value: Orientation; label: string }[] = [
  { value: "portrait-a", label: "Sideways, top on the right (usual)" },
  { value: "portrait-b", label: "Sideways, top on the left (if it prints upside down)" },
  { value: "landscape", label: "Landscape page" },
];

const EXAMPLE_NAME = "Student Name";

/** Which belt table a rank belongs to. Colors are checked first so "Pre-Black Belt" is not mistaken for a black belt. */
function beltOf(rank: string): BeltKey {
  const n = normalizeRank(rank);
  const color = COLOR_BELTS.find(c => n === `${c} Belt`);
  if (color) return color;
  return /black belt/i.test(n) ? "Black" : "Other";
}

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
      if (Array.isArray(j.rows)) {
        return { rows: j.rows, testDate: j.testDate || todayISO(), layout: j.layout || "portrait-a", style: styleById(j.style).id };
      }
    }
  } catch { /* private window or bad data: start fresh */ }
  return { rows: [], testDate: todayISO(), layout: "portrait-a", style: DEFAULT_STYLE };
}

// ─── fonts ────────────────────────────────────────────────────────────────────────────────────────
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
const family = (file: string) => `tma-cert-${file.replace(/\.woff$/, "")}`;
const FONT_FACE_CSS = Array.from(new Set(STYLES.flatMap(s => [s.nameFont, s.rankFont])))
  .map(f => `@font-face{font-family:"${family(f)}";src:url(/fonts/${f}) format("woff");font-display:block}`)
  .join("\n");

/** Works out where every word goes for each look, so previews match the PDF exactly. */
function useLayouters() {
  const [layouters, setLayouters] = useState<Partial<Record<StyleId, Layouter>>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        for (const st of STYLES) {
          const l = await createLayouter(await loadFonts(st.id), st.id);
          if (!alive) return;
          setLayouters(prev => ({ ...prev, [st.id]: l }));
        }
      } catch (e: any) {
        if (alive) setError(e?.message || "Could not load the certificate fonts.");
      }
    })();
    return () => { alive = false; };
  }, []);
  return { layouters, error };
}

// ─── drawing ──────────────────────────────────────────────────────────────────────────────────────
function CertSvg({ items, style, withScan, guides, label }: { items: PlacedText[]; style: StyleId; withScan: boolean; guides?: boolean; label: string }) {
  const st = styleById(style);
  return (
    <svg viewBox="0 0 792 612" role="img" aria-label={label} className="block h-auto w-full bg-white" style={{ aspectRatio: "792 / 612" }}>
      {withScan && <image href={blankScan} x="0" y="0" width="792" height="612" preserveAspectRatio="none" />}
      {guides && [GUIDE_LINES.name, GUIDE_LINES.rank, ...GUIDE_LINES.date].map((g, i) => (
        <line key={i} x1={g.x0} x2={g.x1} y1={g.y} y2={g.y} stroke="#9ca3af" strokeWidth="0.6" />
      ))}
      {items.map((it, i) => (
        <text key={i} x={it.x} y={it.baseline} fontSize={it.size} fill="#000"
          fontFamily={`"${family(it.role === "name" ? st.nameFont : st.rankFont)}", serif`}>{it.text}</text>
      ))}
    </svg>
  );
}

// ─── the page ─────────────────────────────────────────────────────────────────────────────────────
type Tab = "one" | "paste";

export default function TestingCertificates() {
  const initial = useMemo(load, []);
  const [rows, setRows] = useState<CertRow[]>(initial.rows);
  const [testDate, setTestDate] = useState(initial.testDate);
  const [layout, setLayout] = useState<Orientation>(initial.layout);
  const [style, setStyle] = useState<StyleId>(initial.style);

  const [view, setView] = useState<"make" | "print">("make");
  const [tab, setTab] = useState<Tab>("one");
  // Open the first belt that already has students (after a refresh), otherwise start at White.
  const [belt, setBelt] = useState<BeltKey>(() => BELT_KEYS.find(b => initial.rows.some(r => beltOf(r.rank) === b)) ?? "White");
  const [dan, setDan] = useState("1st");
  const [level, setLevel] = useState("1");
  const [otherRank, setOtherRank] = useState("");
  const [fName, setFName] = useState("");
  const [paste, setPaste] = useState("");
  const [peek, setPeek] = useState(0);              // which saved student the preview shows
  const [busy, setBusy] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const { layouters, error: fontError } = useLayouters();
  const layouter = layouters[style];

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ rows, testDate, layout, style })); } catch { /* ignore */ }
  }, [rows, testDate, layout, style]);
  // One date for everyone: changing it updates every student.
  useEffect(() => {
    setRows(rs => (rs.some(r => r.date !== testDate) ? rs.map(r => ({ ...r, date: testDate })) : rs));
  }, [testDate]);

  /** The rank a new student gets from whatever is picked on the left. */
  const currentRank =
    belt === "Black" ? `${dan} Dan Black Belt Lvl ${level}` :
    belt === "Other" ? otherRank.trim() :
    `${belt} Belt`;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach(r => { const k = beltOf(r.rank); c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [rows]);
  /** Positions in `rows` of the students on the open belt table. */
  const tableIdx = useMemo(() => rows.map((_, i) => i).filter(i => beltOf(rows[i].rank) === belt), [rows, belt]);
  const activeIdx = tableIdx.includes(peek) ? peek : tableIdx[0];

  const status = useCallback((r: CertRow): string | null => {
    if (!layouter) return null;
    const res = layouter.layout(r);
    return res.ok ? null : res.reason;
  }, [layouter]);
  /** Printable students in print order (by belt, then the order added), each remembering its place in `rows`. */
  const readyEntries = useMemo(
    () => (layouter
      ? rows.map((r, i) => ({ r, i })).filter(x => status(x.r) === null).sort((a, b) => rankOrder(a.r.rank) - rankOrder(b.r.rank))
      : []),
    [rows, status, layouter],
  );
  const ready = useMemo(() => readyEntries.map(e => e.r), [readyEntries]);
  const skipped = useMemo(() => rows.map((r, i) => ({ r, i, why: status(r) })).filter(x => x.why), [rows, status]);

  // What the big preview shows: the name being typed, else the student picked in the table, else an example.
  const typing = fName.trim() !== "";
  const previewRow: CertRow = typing
    ? { name: fName.trim(), rank: currentRank || "Yellow Belt", date: testDate }
    : activeIdx !== undefined
      ? rows[activeIdx]
      : { name: EXAMPLE_NAME, rank: currentRank || "Yellow Belt", date: testDate };
  const isExample = !typing && activeIdx === undefined;

  const previewFor = (id: StyleId, row: CertRow) => {
    const l = layouters[id];
    if (!l) return null;
    const res = l.layout(row);
    return res.ok ? res : null;
  };

  // ── students ──
  function addStudent() {
    const name = fName.trim();
    if (!name) { toast.error("Type the student's name first."); nameInput.current?.focus(); return; }
    if (!currentRank) { toast.error("Type the rank first."); return; }
    setRows(rs => [...rs, { name, rank: currentRank, date: testDate }]);
    setPeek(rows.length);
    setFName("");
    nameInput.current?.focus();
  }
  const rename = (i: number, name: string) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, name } : r)));
  const removeStudent = (i: number) => setRows(rs => rs.filter((_, j) => j !== i));
  function addPasted() {
    if (!currentRank) { toast.error("Type the rank first."); return; }
    const names = parseNames(paste);
    if (!names.length) { toast.error("Type some names first, separated by commas or one per line."); return; }
    setRows(rs => [...rs, ...names.map(name => ({ name, rank: currentRank, date: testDate }))]);
    setPaste("");
    setTab("one");
    toast.success(`Added ${names.length} student${names.length === 1 ? "" : "s"} to the ${beltLabel} list.`);
  }
  /** Change which belt an already-added student is on. The open belt follows them so they stay on screen. */
  function changeBelt(i: number, key: BeltKey) {
    const r = rows[i];
    if (!r || beltOf(r.rank) === key) return;
    let rank: string;
    if (key === "Black") rank = `${dan} Dan Black Belt Lvl ${level}`;
    else if (key === "Other") {
      rank = otherRank.trim();
      if (!rank) { toast.error("Tap Other and type the rank first."); return; }
    } else rank = `${key} Belt`;
    setRows(rs => rs.map((x, j) => (j === i ? { ...x, rank } : x)));
    setBelt(key);
    setPeek(i);
    toast.success(`Moved ${r.name || "the student"} to the ${key} belt list.`);
  }
  /** Names typed (or pasted) but not added yet are added on the way to printing, so nothing is silently left out. */
  const pendingNames = tab === "paste" ? parseNames(paste) : fName.trim() ? [fName.trim()] : [];
  function goPrint() {
    if (pendingNames.length) {
      if (!currentRank) { toast.error("Type the rank first."); return; }
      setRows(rs => [...rs, ...pendingNames.map(name => ({ name, rank: currentRank, date: testDate }))]);
      setFName(""); setPaste("");
      toast.success(`Added ${pendingNames.length === 1 ? pendingNames[0] : `${pendingNames.length} students`} to the ${beltLabel} list.`);
    }
    setView("print");
  }
  /** From a print-preview page: go back to that student's belt table with the cursor in their name. */
  function editFromPrint(rowIdx: number) {
    const r = rows[rowIdx];
    if (!r) return;
    setView("make");
    setTab("one");
    setBelt(beltOf(r.rank));
    setPeek(rowIdx);
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-student-index="${rowIdx}"]`);
      el?.focus(); el?.select();
    }, 80);
  }
  function pickBelt(b: BeltKey) {
    setBelt(b);
    const first = rows.findIndex(r => beltOf(r.rank) === b);
    if (first >= 0) setPeek(first);
    setTimeout(() => nameInput.current?.focus(), 30);
  }
  const stepPreview = (dir: 1 | -1) => {
    if (!tableIdx.length) return;
    const pos = Math.max(0, tableIdx.indexOf(activeIdx ?? tableIdx[0]));
    setPeek(tableIdx[(pos + dir + tableIdx.length) % tableIdx.length]);
  };

  // ── printing ──
  async function makePdf(kind: "print" | "download" | "test") {
    const list = kind === "test" ? ready.slice(0, 1) : ready;
    if (!list.length) { toast.error("Add at least one student first."); return; }
    setBusy(kind);
    try {
      const res = await buildCertificatesPdf(list, await loadFonts(style), { orientation: layout, style, guides: kind === "test" });
      if (!res.pages) { toast.error(res.problems[0]?.reason ?? "Nothing to print."); return; }
      const url = URL.createObjectURL(new Blob([res.bytes as BlobPart], { type: "application/pdf" }));
      if (kind === "print") {
        window.open(url, "_blank");
        toast.success("Opened in a new tab. Press the Print button there.");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = kind === "test" ? "alignment-test-with-guide-lines.pdf" : `testing-certificates-${res.pages}-pages.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        toast.success(kind === "test" ? "Test sheet downloaded. Print it on plain paper." : `Downloaded ${res.pages} certificate${res.pages === 1 ? "" : "s"}.`);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      toast.error(e?.message || "Could not make the PDF.");
    } finally { setBusy(null); }
  }

  // ───────────────────────── print preview ─────────────────────────
  if (view === "print") {
    return (
      <div className="mx-auto max-w-5xl space-y-5 p-4">
        <style>{FONT_FACE_CSS}</style>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1a2d5a]">Print preview</h1>
            <p className="text-gray-600">
              {ready.length} certificate{ready.length === 1 ? "" : "s"}, {ready.length} page{ready.length === 1 ? "" : "s"}, in belt order (White first, Black last).
              Only the words print. When printing choose Portrait, Letter, Actual size (100%).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" onClick={() => setView("make")}><ArrowLeft className="mr-2 h-5 w-5" /> Back</Button>
            <Button variant="outline" size="lg" onClick={() => makePdf("download")} disabled={!!busy || !ready.length}><Download className="mr-2 h-5 w-5" /> Save PDF</Button>
            <Button size="lg" onClick={() => makePdf("print")} disabled={!!busy || !ready.length} className="bg-[#c41e3a] hover:bg-[#a51830]">
              <Printer className="mr-2 h-5 w-5" /> {busy === "print" ? "Opening..." : "Print"}
            </Button>
          </div>
        </header>

        <details className="text-sm text-gray-500">
          <summary className="cursor-pointer">Printer problems? (upside down, or off a little)</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Page direction</span>
              <select value={layout} onChange={e => setLayout(e.target.value as Orientation)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900">
                {LAYOUTS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            <Button variant="outline" onClick={() => makePdf("test")} disabled={!!busy || !ready.length}>Save a test sheet with guide lines</Button>
          </div>
        </details>

        {skipped.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4" /> {skipped.length} not included</p>
            <ul className="mt-1 list-disc pl-5">{skipped.map(x => <li key={x.i}>{x.r.name || `Row ${x.i + 1}`}: {x.why}</li>)}</ul>
          </div>
        )}

        <div className="space-y-6">
          {readyEntries.map(({ r, i: rowIdx }, i) => {
            const res = layouter!.layout(r);
            if (!res.ok) return null;
            return (
              <figure key={rowIdx} className="mx-auto max-w-3xl">
                <div className="overflow-hidden rounded-sm border border-gray-300 bg-white shadow-sm">
                  <CertSvg items={res.items} style={style} withScan={false} label={`Page ${i + 1}: ${r.name}`} />
                </div>
                <figcaption className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-gray-500">
                  <span>Page {i + 1} of {ready.length}: <b className="text-gray-700">{r.name}</b>, {r.rank}</span>
                  <button onClick={() => editFromPrint(rowIdx)} className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-[#1a2d5a] hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  <button onClick={() => { removeStudent(rowIdx); toast.success(`Removed ${r.name}.`); }} className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                </figcaption>
              </figure>
            );
          })}
          {ready.length === 0 && <p className="py-10 text-center text-gray-500">Nothing to print yet. Go back and add students.</p>}
        </div>
      </div>
    );
  }

  // ───────────────────────── make view ─────────────────────────
  const prevRes = layouter ? layouter.layout(previewRow) : null;
  const prevItems = prevRes && prevRes.ok ? prevRes.items : null;
  const beltLabel = belt === "Black" ? "Black belt" : belt === "Other" ? "Other rank" : `${belt} belt`;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      <style>{FONT_FACE_CSS}</style>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-[#1a2d5a]"><Award className="h-8 w-8" /> Testing Certificates</h1>
          <p className="mt-1 text-lg text-gray-600">Pick a look, add the students for each belt, then print.</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-right">
          <p className="text-3xl font-bold text-[#1a2d5a]">{rows.length}</p>
          <p className="text-sm text-gray-500">student{rows.length === 1 ? "" : "s"} added</p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* ─── LEFT: add students ─── */}
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <div role="tablist" aria-label="How to add students" className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            {([["one", "One by one", PenLine], ["paste", "Paste a list", ListPlus]] as const).map(([key, label, Icon]) => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-3 text-base font-semibold ${tab === key ? "bg-white text-[#1a2d5a] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                <Icon className="h-5 w-5" /> {label}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1 block text-base font-semibold text-gray-800">Date on the certificates (for everyone)</span>
            <Input type="date" value={testDate} onChange={e => setTestDate(e.target.value)} className="h-12 max-w-xs text-lg" />
          </label>

          {tab === "one" ? (
            <form onSubmit={e => { e.preventDefault(); addStudent(); }}>
              <label className="block">
                <span className="mb-1 block text-base font-semibold text-gray-800">1. Student's name <span className="font-normal text-gray-500">(goes on the belt you tap below)</span></span>
                <div className="flex gap-2">
                  <Input ref={nameInput} value={fName} onChange={e => setFName(e.target.value)} placeholder="Type the name, press Enter" autoComplete="off" className="h-14 flex-1 text-xl" />
                  <Button type="submit" size="lg" className="h-14 bg-[#1a2d5a] px-5 text-lg hover:bg-[#142347]"><Plus className="mr-1 h-5 w-5" /> Add</Button>
                </div>
              </label>
              {fName.trim() && (
                <p className="mt-1 text-sm text-amber-700">Not added yet. Press Add (or Enter) to put {fName.trim()} on the {beltLabel} list. Printing adds it for you too.</p>
              )}
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-base text-gray-700">
                1. Type or paste the names, separated by commas or one on each line. They all go on the belt you tap below (right now: <b>{beltLabel}</b>).
              </p>
              <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={7}
                placeholder={"Tyler Le, Mia Park, Sam Ng"}
                className="w-full rounded-lg border border-gray-300 p-3 font-mono text-base" />
              <Button size="lg" onClick={addPasted} disabled={!paste.trim()} className="h-14 w-full bg-[#1a2d5a] text-lg hover:bg-[#142347]">
                <ListPlus className="mr-2 h-5 w-5" /> Add these students
              </Button>
              {parseNames(paste).length > 0 && (
                <p className="text-sm text-amber-700">Not added yet. Press Add these students. Printing adds them for you too.</p>
              )}
            </div>
          )}

          {/* belts */}
          <div>
            <span className="mb-2 block text-base font-semibold text-gray-800">2. Tap a belt</span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Belt">
              {BELT_KEYS.map(b => {
                const active = belt === b;
                const n = counts[b] ?? 0;
                return (
                  <button type="button" key={b} onClick={() => pickBelt(b)} aria-pressed={active}
                    className={`relative flex flex-col items-center gap-1 rounded-lg border-2 px-1 py-2 text-sm font-semibold ${active ? "border-[#1a2d5a] bg-blue-50 text-[#1a2d5a]" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
                    <span className="h-3 w-12 rounded-full border border-gray-400" style={{ background: SWATCH[b] }} />
                    {b}
                    {n > 0 && <span className="absolute right-1 top-1 min-w-5 rounded-full bg-[#1a2d5a] px-1.5 text-center text-xs font-bold text-white" aria-label={`${n} students`}>{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {belt === "Black" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3">
              <label className="text-sm font-medium text-gray-700">Dan
                <select value={dan} onChange={e => setDan(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-gray-300 bg-white px-2 text-base text-gray-900">
                  {DANS.map(d => <option key={d} value={d}>{d} Dan</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">Level
                <select value={level} onChange={e => setLevel(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-gray-300 bg-white px-2 text-base text-gray-900">
                  {LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
                </select>
              </label>
              <p className="col-span-2 text-sm text-gray-600">Certificate will say: <b>{currentRank}</b></p>
            </div>
          )}
          {belt === "Other" && (
            <label className="block rounded-lg bg-gray-50 p-3 text-sm font-medium text-gray-700">
              Type the rank exactly as it should print
              <Input value={otherRank} onChange={e => setOtherRank(e.target.value)} placeholder="Yellow Stripe" className="mt-1 h-11 bg-white text-base" />
            </label>
          )}

          {tab === "one" && (
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
                    <span className="h-3 w-8 rounded-full border border-gray-400" style={{ background: SWATCH[belt] }} />
                    {beltLabel} students ({tableIdx.length})
                  </h2>
                </div>
                {tableIdx.length === 0 ? (
                  <p className="p-4 text-center text-gray-500">No {beltLabel} students yet. Type a name above.</p>
                ) : (
                  <ol className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
                    {tableIdx.map((i, n) => {
                      const r = rows[i];
                      const why = status(r);
                      return (
                        <li key={i} className={`flex items-center gap-2 px-3 py-1.5 ${activeIdx === i && !typing ? "bg-blue-50" : ""}`}>
                          <span className="w-6 text-right text-sm font-semibold text-gray-400">{n + 1}</span>
                          <div className="min-w-0 flex-1">
                            <Input value={r.name} onChange={e => rename(i, e.target.value)} onFocus={() => setPeek(i)} aria-label={`Name for student ${n + 1}`} data-student-index={i} className="h-10 text-base" />
                            {(belt === "Black" || belt === "Other") && <span className="block px-1 text-xs text-gray-500">{r.rank}</span>}
                            {why && <span className="block px-1 text-xs text-red-600">{why}</span>}
                          </div>
                          <select value={beltOf(r.rank)} onChange={e => changeBelt(i, e.target.value as BeltKey)} aria-label={`Belt for ${r.name || `student ${n + 1}`}`}
                            className="h-10 w-28 shrink-0 rounded-md border border-gray-300 bg-white px-1.5 text-sm text-gray-900">
                            {BELT_KEYS.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                          <button onClick={() => removeStudent(i)} aria-label={`Remove ${r.name || `student ${n + 1}`}`} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
          )}

          <div className="border-t border-gray-200 pt-3">
            {rows.length > 0 && (
              <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                <span className="flex flex-wrap items-center gap-1">
                  <span>All belts:</span>
                  {BELT_KEYS.filter(b => counts[b]).map(b => (
                    <button key={b} onClick={() => pickBelt(b)} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${belt === b ? "bg-[#1a2d5a] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                      {b} {counts[b]}
                    </button>
                  ))}
                </span>
                <button className="text-red-600 hover:underline"
                  onClick={() => { if (window.confirm(`Remove all ${rows.length} students from every belt?`)) setRows([]); }}>Remove all</button>
              </div>
            )}
            <Button size="lg" disabled={!ready.length && !pendingNames.length} onClick={goPrint}
              className="h-16 w-full bg-[#c41e3a] text-xl hover:bg-[#a51830]">
              <Printer className="mr-2 h-6 w-6" /> Print all {ready.length + pendingNames.length} certificate{ready.length + pendingNames.length === 1 ? "" : "s"}
            </Button>
            {skipped.length > 0 && <p className="mt-2 text-center text-sm text-amber-700">{skipped.length} student{skipped.length === 1 ? "" : "s"} can't print yet and will be left out.</p>}
          </div>
        </section>

        {/* ─── RIGHT: preview + looks ─── */}
        <section className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-800">
                {isExample ? "Example. Add a student to see theirs." : typing ? "Preview: what you're typing" : `Preview: ${previewRow.name}`}
              </h2>
              {!typing && tableIdx.length > 1 && (
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <button aria-label="Previous student" onClick={() => stepPreview(-1)} className="rounded p-1.5 hover:bg-gray-100"><ChevronLeft className="h-5 w-5" /></button>
                  <span>{tableIdx.indexOf(activeIdx ?? tableIdx[0]) + 1} of {tableIdx.length}</span>
                  <button aria-label="Next student" onClick={() => stepPreview(1)} className="rounded p-1.5 hover:bg-gray-100"><ChevronRight className="h-5 w-5" /></button>
                </div>
              )}
            </div>
            <div className="overflow-hidden rounded-md border border-gray-200">
              {prevItems ? (
                <CertSvg items={prevItems} style={style} withScan label={`Preview of ${previewRow.name}'s certificate`} />
              ) : (
                <div className="flex aspect-[792/612] items-center justify-center bg-gray-50 px-6 text-center text-gray-500">
                  {fontError ? fontError : prevRes && !prevRes.ok ? `Can't show this one: ${prevRes.reason}` : "Loading the fonts..."}
                </div>
              )}
            </div>
            {prevRes && !prevRes.ok && <p className="mt-2 text-sm text-red-600">{prevRes.reason}</p>}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-1 text-base font-semibold text-gray-800">Pick a look</h2>
            <p className="mb-3 text-sm text-gray-500">{styleById(style).description}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Look">
              {STYLES.map(st => {
                const res = previewFor(st.id, previewRow);
                const active = st.id === style;
                const short = st.label.replace(/ \(.*\)$/, "");
                return (
                  <button key={st.id} role="radio" aria-checked={active} aria-label={`${short} look`} onClick={() => setStyle(st.id)}
                    className={`overflow-hidden rounded-lg border-2 text-left ${active ? "border-[#c41e3a] ring-2 ring-[#c41e3a]/20" : "border-gray-200 hover:border-gray-400"}`}>
                    {res
                      ? <CertSvg items={res.items} style={st.id} withScan label={`${short} look`} />
                      : <div className="flex aspect-[792/612] items-center justify-center bg-gray-50 text-xs text-gray-400">Loading...</div>}
                    <span className={`block px-2 py-1.5 text-sm font-semibold ${active ? "text-[#c41e3a]" : "text-gray-700"}`}>
                      {short}{active ? " (picked)" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
