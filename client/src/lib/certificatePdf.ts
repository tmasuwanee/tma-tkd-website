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

/**
 * Turn pasted text into rows. One student per line: "Name, Rank" (comma, tab or " - " between).
 * Lines that are blank are skipped. A line with no rank keeps the rank empty so it is visible in the table.
 */
export function parseRoster(text: string, defaultDate: string): CertRow[] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/\t|,| - /).map(s => s.trim());
      return { name: parts[0] ?? "", rank: parts.slice(1).join(", "), date: defaultDate };
    });
}

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

export async function buildCertificatesPdf(rows: CertRow[], fonts: FontBytes, opts: BuildOptions = {}): Promise<BuildResult> {
  const orientation = opts.orientation ?? "portrait-a";
  const preset = styleById(opts.style);
  const { map, rotate, size } = makeMapper(orientation);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const script = await doc.embedFont(fonts.name, { subset: true });
  const serif = await doc.embedFont(fonts.rank, { subset: true });
  const problems: BuildResult["problems"] = [];
  let pages = 0;
  const scriptChars = new Set(script.getCharacterSet());
  const serifChars = new Set(serif.getCharacterSet());
  const unprintable = (s: string, set: Set<number>) => Array.from(s).some(ch => !set.has(ch.codePointAt(0)!));

  const text = (page: PDFPage, s: string, font: PDFFont, fontSize: number, xLeft: number, baselineTop: number) => {
    const p = map(xLeft, baselineTop);
    page.drawText(s, { x: p.x, y: p.y, size: fontSize, font, color: rgb(0, 0, 0), rotate: degrees(rotate) });
  };
  const line = (page: PDFPage, x0: number, x1: number, yTop: number) => {
    const a = map(x0, yTop);
    const b = map(x1, yTop);
    page.drawLine({ start: a, end: b, thickness: 0.6, color: rgb(0.55, 0.55, 0.55) });
  };

  rows.forEach((row, index) => {
    const name = (row.name || "").trim();
    const rank = (row.rank || "").trim();
    const d = dateParts(row.date);
    if (!name) { problems.push({ index, name: "(blank)", reason: "No student name." }); return; }
    if (!rank) { problems.push({ index, name, reason: "No rank." }); return; }
    if (!d) { problems.push({ index, name, reason: "Pick a date." }); return; }

    // Check every character exists in the fonts BEFORE adding a page, so a bad row never wastes a certificate.
    if (unprintable(name, scriptChars) || unprintable(rank, serifChars)) {
      problems.push({ index, name, reason: "This name or rank has a character the certificate font can't print." });
      return;
    }

    try {
      const page = doc.addPage(size);

      if (opts.guides) {
        line(page, GEO.name.x0, GEO.name.x1, GEO.name.y);
        line(page, GEO.rank.x0, GEO.rank.x1, GEO.rank.y);
        for (const [a, b] of GEO.blanks) line(page, a, b, GEO.dateY);
      }

      // Name (calligraphy), centered on its line
      const nameSize = fit(script, name, preset.name.size, preset.name.min, GEO.name.x1 - GEO.name.x0 - 12);
      const nameW = script.widthOfTextAtSize(name, nameSize);
      text(page, name, script, nameSize, GEO.name.x0 + (GEO.name.x1 - GEO.name.x0 - nameW) / 2, GEO.name.y - preset.name.gap);

      // Rank (inscription serif), centered on its line
      const rankSize = fit(serif, rank, preset.rank.size, preset.rank.min, GEO.rank.x1 - GEO.rank.x0 - 12);
      const rankW = serif.widthOfTextAtSize(rank, rankSize);
      text(page, rank, serif, rankSize, GEO.rank.x0 + (GEO.rank.x1 - GEO.rank.x0 - rankW) / 2, GEO.rank.y - preset.rank.gap);

      // Date: one size for all three words so "November" never looks smaller than "19th"
      const words = [d.day, d.month, d.year];
      let dateSize = preset.date.size;
      words.forEach((w, i) => {
        const [a, b] = GEO.blanks[i];
        dateSize = Math.min(dateSize, fit(serif, w, preset.date.size, preset.date.min, b - a + 4));
      });
      words.forEach((w, i) => {
        const [a, b] = GEO.blanks[i];
        const ww = serif.widthOfTextAtSize(w, dateSize);
        text(page, w, serif, dateSize, a + (b - a - ww) / 2, GEO.dateY - preset.date.gap);
      });
      pages++;
    } catch {
      // Safety net: never leave a half-drawn page in the file.
      if (doc.getPageCount() > pages) doc.removePage(doc.getPageCount() - 1);
      problems.push({ index, name, reason: "Could not draw this certificate." });
    }
  });

  return { bytes: await doc.save(), pages, problems };
}
