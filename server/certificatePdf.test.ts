import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { buildCertificatesPdf, dateParts, ordinal, parseRoster, STYLES, styleById, type CertRow } from "../client/src/lib/certificatePdf";

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

describe("parseRoster", () => {
  it("reads one student per line with a comma, tab or dash", () => {
    const rows = parseRoster("Tyler Le, Yellow Belt\nAlex Luna\tGreen Belt\r\n\n Sam Ng - Blue Belt ", "2026-11-19");
    expect(rows.map(r => [r.name, r.rank])).toEqual([["Tyler Le", "Yellow Belt"], ["Alex Luna", "Green Belt"], ["Sam Ng", "Blue Belt"]]);
    expect(rows.every(r => r.date === "2026-11-19")).toBe(true);
  });
  it("keeps a missing rank empty so it shows in the table, and a rank with a comma intact", () => {
    const rows = parseRoster("Pat Kim\nLee Park, 1st Degree, Black Belt", "2026-11-19");
    expect(rows[0].rank).toBe("");
    expect(rows[1].rank).toBe("1st Degree, Black Belt");
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
