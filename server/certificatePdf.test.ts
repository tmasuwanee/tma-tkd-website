import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { buildCertificatesPdf, createLayouter, isWhiteBelt, dateParts, normalizeRank, ordinal, parseNames, rankOrder, sortForPrint, COLOR_BELTS, STYLES, styleById, type CertRow } from "../client/src/lib/certificatePdf";

const fontDir = path.resolve(__dirname, "../client/public/fonts");
const bytes = (f: string) => new Uint8Array(readFileSync(path.join(fontDir, f)));
const fontsFor = (id?: string) => { const st = styleById(id); return { name: bytes(st.nameFont), rank: bytes(st.rankFont) }; };
const fonts = fontsFor();
const row = (over: Partial<CertRow> = {}): CertRow => ({ name: "Tyler Le", rank: "Yellow Belt", date: "2026-11-19", ...over });

describe("dates", () => {
  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "30th", "31st"]);
  });
  it("splits an ISO date into the three blanks", () => {
    expect(dateParts("2026-11-19")).toEqual({ day: "19th", month: "November", year: "2026" });
    expect(dateParts("2027-01-02")).toEqual({ day: "2nd", month: "January", year: "2027" });
  });
  it("rejects anything that is not a real date shape", () => {
    for (const bad of ["", "11/19/2026", "2026-13-01", "2026-00-10", "2026-11-32", "soon"]) expect(dateParts(bad)).toBeNull();
  });
});

describe("parseNames", () => {
  it("splits on commas, line breaks, semicolons, or a mix", () => {
    expect(parseNames("Tyler Le, Mia Park, Sam Ng")).toEqual(["Tyler Le", "Mia Park", "Sam Ng"]);
    expect(parseNames("Tyler Le\nMia Park\r\nSam Ng")).toEqual(["Tyler Le", "Mia Park", "Sam Ng"]);
    expect(parseNames("Tyler Le, Mia Park\nSam Ng; Jo Kim")).toEqual(["Tyler Le", "Mia Park", "Sam Ng", "Jo Kim"]);
  });
  it("trims, squeezes extra spaces, and drops blanks and repeats", () => {
    expect(parseNames("  Tyler   Le ,, \n\n Mia Park,tyler le,  ")).toEqual(["Tyler Le", "Mia Park"]);
    expect(parseNames("")).toEqual([]);
    expect(parseNames(" , ,\n")).toEqual([]);
  });
  it("keeps accented and hyphenated names whole", () => {
    expect(parseNames("José Peña, Mary-Jane O'Neil")).toEqual(["José Peña", "Mary-Jane O'Neil"]);
  });
});

describe("buildCertificatesPdf", () => {
  it("makes one portrait Letter page per student by default", async () => {
    const r = await buildCertificatesPdf([row(), row({ name: "Alex Coronado Luna", rank: "1st Degree Black Belt" }), row({ name: "Sam Ng" })], fonts);
    expect(r.pages).toBe(3);
    expect(r.problems).toEqual([]);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
  it("landscape pages are 792 x 612", async () => {
    const r = await buildCertificatesPdf([row()], fonts, { orientation: "landscape" });
    expect((await PDFDocument.load(r.bytes)).getPage(0).getSize()).toEqual({ width: 792, height: 612 });
  });
  it("50 students make a 50 page file in reasonable time and size", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => row({ name: `Student Number ${i + 1}` }));
    const t = Date.now();
    const r = await buildCertificatesPdf(rows, fonts);
    expect(r.pages).toBe(50);
    expect(r.bytes.length).toBeLessThan(500_000);
    expect(Date.now() - t).toBeLessThan(5000);
  });
  it("skips a row with a missing name, rank or date and says why, without wasting a page", async () => {
    const r = await buildCertificatesPdf([row(), row({ name: " " }), row({ rank: "" }), row({ date: "" }), row({ name: "Kim" })], fonts);
    expect(r.pages).toBe(2);
    expect(r.problems.map(p => [p.index, p.reason])).toEqual([[1, "No student name."], [2, "No rank."], [3, "Pick a date."]]);
  });
  it("skips a name with a character the font cannot print instead of making a broken page", async () => {
    const r = await buildCertificatesPdf([row({ name: "김민준" }), row()], fonts);
    expect(r.pages).toBe(1);
    expect(r.problems[0].index).toBe(0);
  });
  it("accepts accented Latin names", async () => {
    const r = await buildCertificatesPdf([row({ name: "José Peña" })], fonts);
    expect(r.pages).toBe(1);
    expect(r.problems).toEqual([]);
  });
  it("very long names still fit (shrink) and do not throw", async () => {
    const r = await buildCertificatesPdf([row({ name: "Alexandria Maximilian Coronado-Luna Montgomery", rank: "Sixth Degree Master Black Belt Instructor" })], fonts);
    expect(r.pages).toBe(1);
  });
  it("guides mode adds the preview lines and still builds", async () => {
    const plain = await buildCertificatesPdf([row()], fonts);
    const guided = await buildCertificatesPdf([row()], fonts, { guides: true });
    expect(guided.bytes.length).toBeGreaterThan(plain.bytes.length);
  });
});

describe("font styles", () => {
  it("every style points at real font files and builds a certificate with the long-name stress case", async () => {
    for (const st of STYLES) {
      const r = await buildCertificatesPdf(
        [row({ name: "Alexandria Maximilian Coronado-Luna", rank: "Sixth Degree Master Black Belt" }), row()],
        fontsFor(st.id), { style: st.id },
      );
      expect(r.problems, st.id).toEqual([]);
      expect(r.pages, st.id).toBe(2);
    }
  });
  it("an unknown style id falls back to the default instead of failing", () => {
    expect(styleById("nope").id).toBe(STYLES[0].id);
    expect(styleById(undefined).id).toBe(STYLES[0].id);
  });
  it("style ids are unique", () => {
    expect(new Set(STYLES.map(s => s.id)).size).toBe(STYLES.length);
  });
});

describe("belts", () => {
  it("are in TMA's order, ending High-Red, Pre-Black (then Black)", () => {
    expect([...COLOR_BELTS]).toEqual(["White", "Yellow", "Orange", "Green", "Purple", "Blue", "Brown", "Red", "High-Red", "Pre-Black"]);
  });
  it("normalizeRank adds the word Belt to a bare color and tolerates spacing and hyphens", () => {
    expect(normalizeRank("yellow")).toBe("Yellow Belt");
    expect(normalizeRank(" Yellow Belt ")).toBe("Yellow Belt");
    expect(normalizeRank("high red")).toBe("High-Red Belt");
    expect(normalizeRank("pre-black")).toBe("Pre-Black Belt");
    expect(normalizeRank("PreBlack belt")).toBe("Pre-Black Belt");
    expect(normalizeRank("1st Dan Black Belt Lvl 3")).toBe("1st Dan Black Belt Lvl 3");
    expect(normalizeRank("Yellow Stripe")).toBe("Yellow Stripe");
  });
  it("rankOrder puts the belts in order, black belts by Dan then Level, anything else last", () => {
    const order = ["White Belt", "Yellow Belt", "Orange Belt", "Green Belt", "Purple Belt", "Blue Belt", "Brown Belt", "Red Belt",
      "High-Red Belt", "Pre-Black Belt", "1st Dan Black Belt Lvl 1", "1st Dan Black Belt Lvl 5", "2nd Dan Black Belt Lvl 1", "2nd Dan Black Belt Lvl 5", "Yellow Stripe"];
    const shuffled = [...order].reverse();
    expect(shuffled.sort((a, b) => rankOrder(a) - rankOrder(b))).toEqual(order);
  });
  it("sortForPrint groups by belt and keeps the order students were added within a belt", () => {
    const r = (name: string, rank: string): CertRow => ({ name, rank, date: "2026-11-19" });
    const out = sortForPrint([r("a", "Blue Belt"), r("b", "Yellow Belt"), r("c", "Blue Belt"), r("d", "White Belt"), r("e", "Yellow Belt")]);
    expect(out.map(x => x.name)).toEqual(["d", "b", "e", "a", "c"]);
  });
  it("long black belt rank still fits and prints", async () => {
    const r = await buildCertificatesPdf([row({ rank: "2nd Dan Black Belt Lvl 5" })], fonts);
    expect(r.pages).toBe(1);
  });
});

describe("White Belt joke (nobody is promoted TO white belt, only demoted)", () => {
  it("White Belt gets a red line through the printed word 'promotion' and a red 'demotion' under it", async () => {
    const l = await createLayouter(fonts, "calligraphy");
    const res = l.layout(row({ rank: "White Belt" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].color).toBe("red");
    expect(res.lines[0].x0).toBeLessThan(371.1);      // reaches past both ends of the printed word
    expect(res.lines[0].x1).toBeGreaterThan(444.6);
    const joke = res.items.find(i => i.text === "demotion");
    expect(joke?.color).toBe("red");
    expect(joke!.baseline).toBeGreaterThan(res.lines[0].y);   // under the struck word
  });
  it("only White Belt gets it, and also when typed loosely", async () => {
    const l = await createLayouter(fonts, "calligraphy");
    for (const rank of ["Yellow Belt", "Pre-Black Belt", "1st Dan Black Belt Lvl 1", "White Stripe"]) {
      const res = l.layout(row({ rank }));
      expect(res.ok && res.lines.length, rank).toBe(0);
      expect(res.ok && res.items.some(i => i.color === "red"), rank).toBe(false);
    }
    expect(isWhiteBelt("white")).toBe(true);
    expect(isWhiteBelt(" White Belt ")).toBe(true);
    expect(isWhiteBelt("Yellow Belt")).toBe(false);
  });
  it("it prints in every look and keeps the certificate's other words", async () => {
    for (const st of STYLES) {
      const r = await buildCertificatesPdf([row({ rank: "White Belt" })], fontsFor(st.id), { style: st.id });
      expect(r.problems, st.id).toEqual([]);
      expect(r.pages, st.id).toBe(1);
    }
  });
});
