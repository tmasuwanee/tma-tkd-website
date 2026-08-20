import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { MARTIAL_ARTS_AGREEMENT_SECTIONS, MARTIAL_ARTS_AGREEMENT_VERSION } from "@shared/martialArtsAgreement";

/**
 * Signed Martial Arts Membership Agreement PDF (TKD / Kickboxing / BJJ). Renders
 * the header, who signed, the full agreement text, and the drawn signature. The
 * exact wording also lives on the waiver record's disclaimerText.
 */
const PAGE_W = 612, PAGE_H = 792, MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const NAVY = rgb(0.102, 0.176, 0.353);
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.85, 0.85, 0.88);

export type MmaAgreementData = {
  parentName: string;
  studentName: string;
  signedRelationship?: string;
  signedDate: string;
  signaturePngDataUrl: string;
};

export async function buildMmaAgreementPdf(data: MmaAgreementData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const ensure = (h: number) => { if (y - h < MARGIN) newPage(); };
  const wrap = (t: string, f: PDFFont, size: number, width = CONTENT_W): string[] => {
    const words = String(t).replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = []; let cur = "";
    for (const w of words) { const test = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(test, size) > width && cur) { lines.push(cur); cur = w; } else cur = test; }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };
  const para = (s: string, f: PDFFont, size: number, color = INK) => { for (const ln of wrap(s, f, size)) { ensure(size + 4); page.drawText(ln, { x: MARGIN, y, size, font: f, color }); y -= size + 4; } };

  page.drawText("TOP MARTIAL ARTS MEMBERSHIP AGREEMENT", { x: MARGIN, y, size: 15, font: bold, color: NAVY }); y -= 20;
  para(`Taekwondo, Kickboxing, and Brazilian Jiu-Jitsu  (v${MARTIAL_ARTS_AGREEMENT_VERSION})`, font, 9, MUTED); y -= 4;
  para(`Student: ${data.studentName}    Signed by: ${data.parentName}${data.signedRelationship ? ` (${data.signedRelationship})` : ""}    Date: ${data.signedDate}`, font, 10); y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LINE }); y -= 14;

  for (const sec of MARTIAL_ARTS_AGREEMENT_SECTIONS) {
    ensure(24); page.drawText(sec.title.toUpperCase(), { x: MARGIN, y, size: 10, font: bold, color: NAVY }); y -= 16;
    for (const p of sec.body) { para(p, font, 9.5); y -= 4; }
    y -= 4;
  }

  ensure(100);
  page.drawText("Signature", { x: MARGIN, y, size: 9, font: bold, color: MUTED }); y -= 8;
  try {
    const png = await pdf.embedPng(data.signaturePngDataUrl);
    const dims = png.scale(1); const scale = Math.min(1, 260 / dims.width); const w = dims.width * scale, h = dims.height * scale;
    ensure(h + 24); page.drawImage(png, { x: MARGIN, y: y - h, width: w, height: h }); y -= h + 6;
  } catch { /* signature embed failed; leave the line */ }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 260, y }, thickness: 0.75, color: LINE }); y -= 12;
  para(`${data.parentName}   ${data.signedDate}`, font, 9, MUTED);

  return pdf.save();
}
