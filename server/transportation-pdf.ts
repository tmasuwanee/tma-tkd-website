import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Fills the official GCPS Transportation Parent Authorization form (3026-RF),
 * TMA-customized template, with the parent's answers and their drawn signature.
 *
 * The template already has TMA's info pre-printed (dismiss-to = TopMartialArts,
 * PM alternate address = 2005 Lawrenceville-Suwanee Rd, daycare name/phone, and
 * the daycare-PM checkbox). So we only stamp the parent's own fields + signature.
 *
 * Coordinates were calibrated against a 612x792 grid overlay. pdf-lib's origin
 * is bottom-left, so on-page y = 792 - (distance from top).
 */

const H = 792;
const INK = rgb(0, 0, 0.55); // dark blue, like a pen, so it reads as filled-in

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, "assets", "gcps-transportation-form.pdf");

export type TransportationFormData = {
  studentName: string;
  grade?: string;
  teacher?: string;
  homeAddress?: string;
  aptBldg?: string;
  homePhone?: string;
  cellPhone?: string;
  workPhone?: string;
  schoolName: string;       // the child's elementary school (dismiss-to blank)
  dateToBegin?: string;     // free text (e.g. "08/12/2026")
  printedName: string;      // parent/guardian printed name
  signedDate: string;       // YYYY-MM-DD or free text
  signaturePngDataUrl: string; // "data:image/png;base64,...."
};

export async function fillTransportationPdf(data: TransportationFormData): Promise<Uint8Array> {
  const templateBytes = readFileSync(TEMPLATE_PATH);
  const pdf = await PDFDocument.load(templateBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPages()[0];

  const put = (text: string | undefined, xLeft: number, yTop: number, size = 10) => {
    if (!text) return;
    page.drawText(String(text), { x: xLeft, y: H - yTop, size, font, color: INK });
  };

  put(data.studentName, 150, 62, 10);
  put(data.grade, 372, 64, 8);
  put(data.teacher, 452, 64, 8);
  put(data.homeAddress, 150, 98, 10);
  put(data.homePhone, 150, 120, 10);
  put(data.aptBldg, 470, 120, 8);
  put(data.cellPhone, 95, 132, 10);
  put(data.workPhone, 338, 132, 10);
  put(data.schoolName, 205, 202, 10);
  put(data.dateToBegin, 122, 631, 9);
  put(data.printedName, 55, 733, 10);
  put(data.signedDate, 555, 733, 9);

  // Drawn signature, embedded as a PNG that sits on the signature line.
  const b64 = data.signaturePngDataUrl.split(",")[1];
  if (b64) {
    const png = await pdf.embedPng(Buffer.from(b64, "base64"));
    const targetW = 120;
    const scale = targetW / png.width;
    const targetH = png.height * scale;
    page.drawImage(png, { x: 410, y: H - 738, width: targetW, height: Math.min(targetH, 34) });
  }

  return pdf.save();
}
