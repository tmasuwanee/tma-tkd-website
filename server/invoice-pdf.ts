import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Builds a TMA-branded invoice / paid-receipt PDF from a set of line items.
 * Same layout as the one-off Toby invoice, generalized so the dashboard can
 * generate one per customer. Handles page breaks if there are many line items.
 */

const NAVY = rgb(0.102, 0.176, 0.353);
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.85, 0.86, 0.9);
const GREEN = rgb(0.16, 0.5, 0.34);
const W = 612, H = 792, M = 54;

export type InvoiceItem = { date: string; description: string; ref?: string; amountCents: number };
export type InvoiceData = {
  billTo: string;
  subtitle?: string;         // e.g. "Summer Camp 2026"
  invoiceNo: string;
  invoiceDate: string;       // human readable
  status?: string;           // "Paid in full" (default) etc.
  items: InvoiceItem[];
  notes?: string[];          // free-text note lines
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([W, H]);

  const T = (p: PDFPage, t: string, x: number, yTop: number, size: number, f: PDFFont = font, color = INK) =>
    p.drawText(t, { x, y: H - yTop, size, font: f, color });
  const R = (p: PDFPage, t: string, xRight: number, yTop: number, size: number, f: PDFFont = font, color = INK) =>
    p.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: H - yTop, size, font: f, color });

  const header = (p: PDFPage) => {
    p.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: NAVY });
    T(p, "TOP MARTIAL ARTS SUWANEE", M, 44, 18, bold, rgb(1, 1, 1));
    T(p, "2005 Lawrenceville Suwanee Rd, Suwanee, GA 30024", M, 62, 9.5, font, rgb(0.75, 0.82, 0.93));
    T(p, "(770) 277-3009  ·  tmatkd.com  ·  tmasuwanee@gmail.com", M, 76, 9.5, font, rgb(0.75, 0.82, 0.93));
    R(p, "INVOICE", W - M, 46, 22, bold, rgb(1, 1, 1));
    R(p, (data.status ?? "Paid in full").toUpperCase().includes("PAID") ? "PAID" : "", W - M, 68, 11, bold, rgb(0.55, 0.85, 0.66));
  };

  header(page);
  let y = 132;
  const labelRight = W - M - 130;
  T(page, "BILL TO", M, y, 9, bold, MUTED);
  T(page, data.billTo || "-", M, y + 18, 13, bold, INK);
  if (data.subtitle) T(page, data.subtitle, M, y + 34, 10.5, font, MUTED);
  R(page, "Invoice #", labelRight, y, 9, bold, MUTED);
  R(page, data.invoiceNo, W - M, y, 10, font, INK);
  R(page, "Date", labelRight, y + 16, 9, bold, MUTED);
  R(page, data.invoiceDate, W - M, y + 16, 10, font, INK);
  R(page, "Status", labelRight, y + 32, 9, bold, MUTED);
  R(page, data.status ?? "Paid in full", W - M, y + 32, 10, font, GREEN);

  y = 200;
  const tableHead = (p: PDFPage, yTop: number) => {
    p.drawRectangle({ x: M, y: H - (yTop + 6), width: W - 2 * M, height: 24, color: rgb(0.95, 0.96, 0.98) });
    T(p, "DATE", M + 10, yTop + 10, 9, bold, MUTED);
    T(p, "DESCRIPTION", M + 100, yTop + 10, 9, bold, MUTED);
    R(p, "REF #", W - M - 130, yTop + 10, 9, bold, MUTED);
    R(p, "AMOUNT", W - M - 10, yTop + 10, 9, bold, MUTED);
  };
  tableHead(page, y);
  y += 24;

  let total = 0;
  for (const it of data.items) {
    total += it.amountCents;
    if (y > H - 150) { page = pdf.addPage([W, H]); header(page); y = 132; tableHead(page, y); y += 24; }
    y += 22;
    T(page, it.date, M + 10, y, 10);
    T(page, it.description.slice(0, 60), M + 100, y, 9.5);
    R(page, it.ref || "", W - M - 130, y, 10, font, MUTED);
    R(page, money(it.amountCents), W - M - 10, y, 10.5, bold);
    page.drawLine({ start: { x: M, y: H - (y + 9) }, end: { x: W - M, y: H - (y + 9) }, thickness: 0.75, color: LINE });
  }

  if (y > H - 200) { page = pdf.addPage([W, H]); header(page); y = 132; }
  y += 34;
  R(page, "Subtotal", W - M - 130, y, 10, font, MUTED);
  R(page, money(total), W - M - 10, y, 10.5, font);
  y += 18;
  R(page, "Amount paid", W - M - 130, y, 10, font, MUTED);
  R(page, money(total), W - M - 10, y, 10.5, font);
  y += 6;
  page.drawLine({ start: { x: W - M - 220, y: H - (y + 8) }, end: { x: W - M, y: H - (y + 8) }, thickness: 1, color: NAVY });
  y += 26;
  R(page, "MASTER TOTAL", W - M - 130, y, 11, bold, NAVY);
  R(page, money(total), W - M - 10, y, 15, bold, NAVY);
  y += 16;
  R(page, "Balance due: $0.00", W - M - 10, y, 9.5, font, GREEN);

  const notes = data.notes ?? ["Thank you for training with Top Martial Arts Suwanee."];
  if (notes.length) {
    y += 54;
    page.drawLine({ start: { x: M, y: H - y }, end: { x: W - M, y: H - y }, thickness: 0.75, color: LINE });
    y += 16;
    T(page, "Notes", M, y, 9, bold, MUTED);
    for (const n of notes) { y += 15; T(page, n.slice(0, 95), M, y, 9.5, font, MUTED); }
  }
  T(page, "Top Martial Arts Suwanee  ·  (770) 277-3009  ·  tmatkd.com", M, H - 40, 8.5, font, MUTED);

  return pdf.save();
}
