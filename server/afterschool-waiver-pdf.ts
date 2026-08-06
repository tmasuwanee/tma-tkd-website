import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { AFTERSCHOOL_WAIVER_SECTIONS } from "@shared/afterschoolWaiver";

/**
 * Signed After-School WAIVER ONLY (no registration data). For a parent who just
 * needs to sign the waiver + policies. Renders the header, who signed, the full
 * waiver text with the parent's initials per section, and the drawn signature.
 */

const PAGE_W = 612, PAGE_H = 792, MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const NAVY = rgb(0.102, 0.176, 0.353);
const RED = rgb(0.769, 0.118, 0.227);
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.85, 0.85, 0.88);

export type AfterschoolWaiverData = {
  parentName: string;
  studentName: string;
  signedRelationship?: string;
  signedDate: string;
  waiverInitials: Record<string, string>;
  signaturePngDataUrl: string;
};

export async function buildAfterschoolWaiverPdf(data: AfterschoolWaiverData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const ensure = (h: number) => { if (y - h < MARGIN) newPage(); };
  const wrap = (text: string, f: PDFFont, size: number, width = CONTENT_W): string[] => {
    const words = String(text).replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = []; let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(test, size) > width && cur) { lines.push(cur); cur = w; } else { cur = test; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };
  const para = (text: string, size = 9, color = INK, gap = 3) => {
    const lh = size * 1.35;
    for (const ln of wrap(text, font, size)) { ensure(lh); page.drawText(ln, { x: MARGIN, y: y - size, size, font, color }); y -= lh; }
    y -= gap;
  };

  // Header
  page.drawText("TOP MARTIAL ARTS SUWANEE", { x: MARGIN, y: y - 16, size: 16, font: bold, color: NAVY });
  y -= 22;
  page.drawText("After School Program — Waiver, Release & Policies", { x: MARGIN, y: y - 12, size: 11, font, color: RED });
  y -= 16;
  page.drawText(`Signed ${data.signedDate}`, { x: MARGIN, y: y - 10, size: 9, font, color: MUTED });
  y -= 16;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
  y -= 10;

  const field = (label: string, value: string) => {
    ensure(16);
    page.drawText(label, { x: MARGIN, y: y - 9, size: 9, font: bold, color: MUTED });
    page.drawText(value || "—", { x: MARGIN + 120, y: y - 9, size: 10, font, color: INK });
    y -= 16;
  };
  field("Student", data.studentName);
  field("Parent / Guardian", data.parentName + (data.signedRelationship ? `  (${data.signedRelationship})` : ""));
  y -= 6;

  para("The parent / guardian initialed each section below to acknowledge and agree.", 9, MUTED, 6);
  for (const s of AFTERSCHOOL_WAIVER_SECTIONS) {
    ensure(30);
    const initials = (data.waiverInitials[s.key] || "").toUpperCase();
    page.drawText(s.title, { x: MARGIN, y: y - 10.5, size: 10.5, font: bold, color: NAVY });
    const pill = `Initialed: ${initials || "—"}`;
    page.drawText(pill, { x: PAGE_W - MARGIN - bold.widthOfTextAtSize(pill, 9), y: y - 10, size: 9, font: bold, color: RED });
    y -= 16;
    for (const p of s.body) para(p, 9, INK, 3);
    y -= 4;
  }

  // Signature
  ensure(96);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LINE });
  y -= 10;
  page.drawText("Electronic Signature", { x: MARGIN, y: y - 11, size: 11, font: bold, color: NAVY });
  y -= 22;
  const b64 = data.signaturePngDataUrl.split(",")[1];
  if (b64) {
    try {
      const png = await pdf.embedPng(Buffer.from(b64, "base64"));
      const w = 200, scale = w / png.width, h = Math.min(png.height * scale, 56);
      ensure(h + 24);
      page.drawImage(png, { x: MARGIN, y: y - h, width: w, height: h });
      y -= h + 2;
    } catch { /* ignore bad image */ }
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 220, y }, thickness: 0.75, color: LINE });
  y -= 12;
  page.drawText(data.signedRelationship ? `${data.parentName}  (${data.signedRelationship})` : data.parentName, { x: MARGIN, y: y - 9, size: 9.5, font, color: INK });
  page.drawText(`Date: ${data.signedDate}`, { x: MARGIN + 260, y: y - 9, size: 9.5, font, color: INK });
  y -= 18;
  para("This document was signed electronically. Typing initials and drawing a signature has the same effect as a handwritten signature.", 7.5, MUTED, 0);

  return pdf.save();
}
