/**
 * Belt-testing certificate PDF, printed onto TMA's pre-printed certificate paper.
 *
 * The page geometry below was MEASURED from a flat scan of the real blank belt certificate
 * (2026-11-18), not taken from the old .pub file. Units are points (1/72 in), US Letter landscape
 * 792 x 612, with y measured from the TOP of the page:
 *
 *   name line  y=293.6   x 229.5 .. 560.3
 *   rank line  y=369.3   x 230.2 .. 560.6
 *   date line  y=433.5   blanks 263.9..327.4 | 376.2..462.7 | 470.8..527.8   ("Day of" sits between 1 and 2)
 *
 * The sheet is fed to the printer sideways (the certificate's top edge on the paper's right edge), so
 * the default output is a PORTRAIT page with the certificate turned 90 degrees, which means the printer
 * does no rotating of its own. Runs entirely in the browser (and in Node for tests): student names never
 * leave the computer. Pure functions, no DOM.
 */
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export type Orientation = "portrait-a" | "portrait-b" | "landscape";

export interface CertRow {
  name: string;
  rank: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface FontBytes {
  /** Font for the student's name. */
  name: Uint8Array;
  /** Font for the rank and the date words. */
  rank: Uint8Array;
}

type Metrics = { size: number; min: number; gap: number };

export type StyleId = "calligraphy" | "copperplate" | "brush" | "blackletter" | "classic";

export interface StylePreset {
  id: StyleId;
  label: string;
  description: string;
  /** Font files under /fonts (all free to embed: SIL Open Font License). */
  nameFont: string;
  rankFont: string;
  name: Metrics;
  rank: Metrics;
  date: Metrics;
}

/** The looks staff can pick from. Sizes are starting points; long text shrinks until it fits its line. */
export const STYLES: StylePreset[] = [
  {
    id: "calligraphy", label: "Calligraphy (Pinyon Script + Cinzel)",
    description: "Formal pen-written name, carved-inscription capitals for the rank.",
    nameFont: "pinyon-script-400.woff", rankFont: "cinzel-700.woff",
    name: { size: 40, min: 22, gap: 7 }, rank: { size: 25, min: 14, gap: 5 }, date: { size: 15, min: 9, gap: 3 },
  },
  {
    id: "copperplate", label: "Copperplate (Great Vibes + Cinzel)",
    description: "Flowing, loopy diploma script. Very formal.",
    nameFont: "great-vibes-400.woff", rankFont: "cinzel-700.woff",
    name: { size: 38, min: 22, gap: 7 }, rank: { size: 25, min: 14, gap: 5 }, date: { size: 15, min: 9, gap: 3 },
  },
  {
    id: "brush", label: "Brush (Kaushan Script + Cinzel)",
    description: "Bold brush-stroke name, closest to martial arts calligraphy.",
    nameFont: "kaushan-script-400.woff", rankFont: "cinzel-700.woff",
    name: { size: 32, min: 18, gap: 6 }, rank: { size: 25, min: 14, gap: 5 }, date: { size: 15, min: 9, gap: 3 },
  },
  {
    id: "blackletter", label: "Old English (UnifrakturCook + Cormorant)",
    description: "Blackletter name that matches the certificate's printed title.",
    nameFont: "unifrakturcook-700.woff", rankFont: "cormorant-garamond-700.woff",
    name: { size: 30, min: 18, gap: 6 }, rank: { size: 28, min: 15, gap: 5 }, date: { size: 18, min: 10, gap: 3 },
  },
  {
    id: "classic", label: "Classic serif (Cormorant italic)",
    description: "Elegant bold italic serif. The most readable of the five.",
    nameFont: "cormorant-garamond-700-italic.woff", rankFont: "cormorant-garamond-700.woff",
    name: { size: 34, min: 20, gap: 6 }, rank: { size: 28, min: 15, gap: 5 }, date: { size: 18, min: 10, gap: 3 },
  },
];

export const DEFAULT_STYLE: StyleId = "calligraphy";
export const styleById = (id: string | undefined): StylePreset => STYLES.find(s => s.id === id) ?? STYLES[0];

export const PAGE_W = 792;
export const PAGE_H = 612;

const GEO = {
  name: { x0: 229.5, x1: 560.3, y: 293.6 },
  rank: { x0: 230.2, x1: 560.6, y: 369.3 },
  dateY: 433.5,
  blanks: [
    [263.9, 327.4],
    [376.2, 462.7],
    [470.8, 527.8],
  ] as const,
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** "2026-11-19" -> { day: "19th", month: "November", year: "2026" }. Returns null for anything else. */
export function dateParts(iso: string): { day: string; month: string; year: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  if (!m) return null;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { day: ordinal(d), month: MONTHS[mo - 1], year: m[1] };
}

/** TMA's belts below black, in order. The last two are "High-Red Belt" and "Pre-Black Belt". */
export const COLOR_BELTS = ["White", "Yellow", "Orange", "Green", "Purple", "Blue", "Brown", "Red", "High-Red", "Pre-Black"] as const;

/** "yellow" -> "Yellow Belt", "pre black" -> "Pre-Black Belt". Anything else is left as typed. */
export function normalizeRank(rank: string): string {
  const r = rank.trim();
  // Compare ignoring case, spaces and hyphens, so "high red", "High-Red" and "highred" all match.
  const squash = (x: string) => x.toLowerCase().replace(/[\s-]+/g, "");
  const hit = COLOR_BELTS.find(c => squash(c) === squash(r) || `${squash(c)}belt` === squash(r));
  return hit ? `${hit} Belt` : r;
}

/**
 * Pull names out of pasted text. Names can be separated by commas, semicolons or line breaks (or a mix),
 * so "Tyler Le, Mia Park" and one name per line both work. Blank pieces are dropped, and a name repeated
 * in the same paste is only kept once.
 */
export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of text.split(/[\r\n,;]+/)) {
    const name = piece.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Print order: by belt (White first, Black last), black belts by Dan then Level, anything else at the end.
 * Students on the same belt stay in the order they were added. (Array.prototype.sort is stable.)
 */
export function rankOrder(rank: string): number {
  const r = rank.trim().toLowerCase();
  const color = COLOR_BELTS.findIndex(c => normalizeRank(r) === `${c} Belt`);
  if (color >= 0) return color;
  const black = /^(\d+)(?:st|nd|rd|th)\s+dan\s+black belt(?:\s+lvl\s+(\d+))?$/.exec(r);
  if (black) return 100 + Number(black[1]) * 10 + Number(black[2] ?? 0);
  if (/black belt/.test(r)) return 100;
  return 1000;
}
export const sortForPrint = (rows: CertRow[]): CertRow[] => [...rows].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));

type Mapper = (x: number, yTop: number) => { x: number; y: number };

function makeMapper(o: Orientation): { map: Mapper; rotate: number; size: [number, number] } {
  // Landscape coordinates (x right, y down from top) -> PDF coordinates (origin bottom-left).
  if (o === "landscape") {
    return { map: (x, yTop) => ({ x, y: PAGE_H - yTop }), rotate: 0, size: [PAGE_W, PAGE_H] };
  }
  if (o === "portrait-a") {
    // certificate top edge -> paper's right edge; text reads downward
    return { map: (x, yTop) => ({ x: PAGE_H - yTop, y: PAGE_W - x }), rotate: -90, size: [PAGE_H, PAGE_W] };
  }
  // portrait-b: certificate top edge -> paper's left edge; text reads upward
  return { map: (x, yTop) => ({ x: yTop, y: x }), rotate: 90, size: [PAGE_H, PAGE_W] };
}

function fit(font: PDFFont, text: string, start: number, min: number, width: number): number {
  let size = start;
  while (font.widthOfTextAtSize(text, size) > width && size > min) size -= 0.5;
  return size;
}

export interface BuildOptions {
  orientation?: Orientation;
  /** Light gray guide lines at the printed lines, for the on-screen preview and the plain-paper test sheet. */
  guides?: boolean;
  /** Which look to use. The caller must pass that style's font files in `fonts`. */
  style?: StyleId;
}

export interface BuildResult {
  bytes: Uint8Array;
  pages: number;
  /** Rows that were skipped or had a problem, with a plain-language reason. */
  problems: { index: number; name: string; reason: string }[];
}

/** One piece of text on the certificate. Landscape coordinates in points: x is the LEFT of the text, baseline is measured from the TOP. */
export interface PlacedText {
  text: string;
  role: "name" | "rank" | "date";
  size: number;
  x: number;
  baseline: number;
}

export type LayoutResult = { ok: true; items: PlacedText[] } | { ok: false; reason: string };

export interface Layouter {
  layout(row: CertRow): LayoutResult;
  nameFont: PDFFont;
  rankFont: PDFFont;
}

/**
 * Works out where every word goes and how big it is. The PDF and the on-screen previews both use this,
 * so what staff see is what prints. Pass the real PDF document when building a PDF so the fonts are embedded once.
 */
export async function createLayouter(fonts: FontBytes, styleId?: StyleId, existingDoc?: PDFDocument): Promise<Layouter> {
  const preset = styleById(styleId);
  const doc = existingDoc ?? (await PDFDocument.create());
  doc.registerFontkit(fontkit);
  const nameFont = await doc.embedFont(fonts.name, { subset: true });
  const rankFont = await doc.embedFont(fonts.rank, { subset: true });
  const nameChars = new Set(nameFont.getCharacterSet());
  const rankChars = new Set(rankFont.getCharacterSet());
  const unprintable = (s: string, set: Set<number>) => Array.from(s).some(ch => !set.has(ch.codePointAt(0)!));

  const layout = (row: CertRow): LayoutResult => {
    const name = (row.name || "").trim();
    const rank = (row.rank || "").trim();
    const d = dateParts(row.date);
    if (!name) return { ok: false, reason: "No student name." };
    if (!rank) return { ok: false, reason: "No rank." };
    if (!d) return { ok: false, reason: "Pick a date." };
    // Every character must exist in the fonts, so a bad row is caught before a certificate is wasted.
    if (unprintable(name, nameChars) || unprintable(rank, rankChars)) {
      return { ok: false, reason: "This name or rank has a character the certificate font can't print." };
    }

    const items: PlacedText[] = [];

    // Name, centered on its line
    const nameSize = fit(nameFont, name, preset.name.size, preset.name.min, GEO.name.x1 - GEO.name.x0 - 12);
    const nameW = nameFont.widthOfTextAtSize(name, nameSize);
    items.push({ text: name, role: "name", size: nameSize, x: GEO.name.x0 + (GEO.name.x1 - GEO.name.x0 - nameW) / 2, baseline: GEO.name.y - preset.name.gap });

    // Rank, centered on its line
    const rankSize = fit(rankFont, rank, preset.rank.size, preset.rank.min, GEO.rank.x1 - GEO.rank.x0 - 12);
    const rankW = rankFont.widthOfTextAtSize(rank, rankSize);
    items.push({ text: rank, role: "rank", size: rankSize, x: GEO.rank.x0 + (GEO.rank.x1 - GEO.rank.x0 - rankW) / 2, baseline: GEO.rank.y - preset.rank.gap });

    // Date: one size for all three words so "November" never looks smaller than "19th"
    const words = [d.day, d.month, d.year];
    let dateSize = preset.date.size;
    words.forEach((w, i) => {
      const [a, b] = GEO.blanks[i];
      dateSize = Math.min(dateSize, fit(rankFont, w, preset.date.size, preset.date.min, b - a + 4));
    });
    words.forEach((w, i) => {
      const [a, b] = GEO.blanks[i];
      const ww = rankFont.widthOfTextAtSize(w, dateSize);
      items.push({ text: w, role: "date", size: dateSize, x: a + (b - a - ww) / 2, baseline: GEO.dateY - preset.date.gap });
    });
    return { ok: true, items };
  };

  return { layout, nameFont, rankFont };
}

export async function buildCertificatesPdf(rows: CertRow[], fonts: FontBytes, opts: BuildOptions = {}): Promise<BuildResult> {
  const orientation = opts.orientation ?? "portrait-a";
  const { map, rotate, size } = makeMapper(orientation);

  const doc = await PDFDocument.create();
  const layouter = await createLayouter(fonts, opts.style, doc);
  const problems: BuildResult["problems"] = [];
  let pages = 0;

  const line = (page: PDFPage, x0: number, x1: number, yTop: number) => {
    page.drawLine({ start: map(x0, yTop), end: map(x1, yTop), thickness: 0.6, color: rgb(0.55, 0.55, 0.55) });
  };

  rows.forEach((row, index) => {
    const res = layouter.layout(row);
    if (!res.ok) { problems.push({ index, name: (row.name || "").trim() || "(blank)", reason: res.reason }); return; }
    try {
      const page = doc.addPage(size);
      if (opts.guides) {
        line(page, GEO.name.x0, GEO.name.x1, GEO.name.y);
        line(page, GEO.rank.x0, GEO.rank.x1, GEO.rank.y);
        for (const [a, b] of GEO.blanks) line(page, a, b, GEO.dateY);
      }
      for (const it of res.items) {
        const p = map(it.x, it.baseline);
        page.drawText(it.text, {
          x: p.x, y: p.y, size: it.size, font: it.role === "name" ? layouter.nameFont : layouter.rankFont,
          color: rgb(0, 0, 0), rotate: degrees(rotate),
        });
      }
      pages++;
    } catch {
      // Safety net: never leave a half-drawn page in the file.
      if (doc.getPageCount() > pages) doc.removePage(doc.getPageCount() - 1);
      problems.push({ index, name: (row.name || "").trim(), reason: "Could not draw this certificate." });
    }
  });

  return { bytes: await doc.save(), pages, problems };
}

/** Where the printed lines sit, for drawing guides in the on-screen previews. */
export const GUIDE_LINES = {
  name: { x0: GEO.name.x0, x1: GEO.name.x1, y: GEO.name.y },
  rank: { x0: GEO.rank.x0, x1: GEO.rank.x1, y: GEO.rank.y },
  date: GEO.blanks.map(([a, b]) => ({ x0: a, x1: b, y: GEO.dateY })),
};
