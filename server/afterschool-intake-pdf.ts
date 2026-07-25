import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { AFTERSCHOOL_WAIVER_SECTIONS } from "@shared/afterschoolWaiver";

/**
 * Generates the signed After School enrollment + waiver PDF from scratch (no
 * template). It lays out every intake answer, the full waiver text with the
 * parent's initials per section, and their drawn signature. This PDF is the
 * authoritative signed record: it is stored, emailed to the parent + staff, and
 * attached to the waivers dashboard row.
 *
 * pdf-lib has no auto-wrap or page-flow, so this file implements a minimal
 * top-down cursor with word wrapping and page breaks.
 */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

const NAVY = rgb(0.102, 0.176, 0.353); // #1a2d5a
const RED = rgb(0.769, 0.118, 0.227); // #c41e3a
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.85, 0.85, 0.88);

export type AfterschoolIntakeData = {
  children: { name: string; dob?: string; gender?: string }[];
  childrenAddress?: string;
  parentEmail: string;
  legalCustody?: string;
  primaryPhone: string;
  mother?: { name?: string; phone?: string; address?: string; workPhone?: string; cellPhone?: string };
  father?: { name?: string; phone?: string; address?: string; cellPhone?: string };
  pickupAuth: { name: string; phone?: string }[];
  custodialGuardianName: string;
  aboutChild: { specialNeeds?: string; hadSeizures?: boolean; hasTantrums?: boolean; tantrumHandling?: string };
  pickupDays: string[];
  planLabel: string;
  includeUniform: boolean;
  includeSupplyFee: boolean;
  earlyBird: boolean;
  startDate?: string;
  waiverInitials: Record<string, string>;
  signedName: string;
  signedRelationship?: string;
  signedDate: string;
  signaturePngDataUrl: string;
};

export async function buildAfterschoolIntakePdf(data: AfterschoolIntakeData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const ensure = (h: number) => {
    if (y - h < MARGIN) newPage();
  };

  // word-wrap a string to CONTENT_W (or a given width) at a font size
  const wrap = (text: string, f: PDFFont, size: number, width = CONTENT_W): string[] => {
    const words = String(text).replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(test, size) > width && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };

  const drawParagraph = (text: string, opts: { size?: number; f?: PDFFont; color?: typeof INK; gap?: number; x?: number; width?: number } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.f ?? font;
    const color = opts.color ?? INK;
    const x = opts.x ?? MARGIN;
    const lh = size * 1.35;
    for (const ln of wrap(text, f, size, opts.width ?? CONTENT_W - (x - MARGIN))) {
      ensure(lh);
      page.drawText(ln, { x, y: y - size, size, font: f, color });
      y -= lh;
    }
    y -= opts.gap ?? 0;
  };

  const sectionHeading = (title: string) => {
    ensure(26);
    y -= 6;
    page.drawText(title, { x: MARGIN, y: y - 11, size: 11.5, font: bold, color: NAVY });
    y -= 15;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LINE });
    y -= 8;
  };

  // label: value row (label bold, value normal, wrapped). If the label is too
  // wide for the label column, the value stacks on the next line (indented) so
  // the two never overlap.
  const field = (label: string, value?: string) => {
    const size = 9.5;
    const lh = size * 1.35;
    const labelColW = 150;
    const val = (value && value.trim()) || "—";
    const labelWidth = bold.widthOfTextAtSize(label, size);
    if (labelWidth > labelColW - 8) {
      ensure(lh);
      page.drawText(label, { x: MARGIN, y: y - size, size, font: bold, color: MUTED });
      y -= lh;
      for (const ln of wrap(val, font, size, CONTENT_W - 12)) {
        ensure(lh);
        page.drawText(ln, { x: MARGIN + 12, y: y - size, size, font, color: INK });
        y -= lh;
      }
      y -= 2;
      return;
    }
    const lines = wrap(val, font, size, CONTENT_W - labelColW);
    const blockH = Math.max(lines.length, 1) * lh;
    ensure(blockH);
    page.drawText(label, { x: MARGIN, y: y - size, size, font: bold, color: MUTED });
    lines.forEach((ln, i) => {
      page.drawText(ln, { x: MARGIN + labelColW, y: y - size - i * lh, size, font, color: INK });
    });
    y -= blockH + 2;
  };

  // ── Header ─────────────────────────────────────────────────────────────────
  page.drawText("TOP MARTIAL ARTS SUWANEE", { x: MARGIN, y: y - 16, size: 16, font: bold, color: NAVY });
  y -= 22;
  page.drawText("After School Program — Enrollment, Waiver & Authorization", { x: MARGIN, y: y - 12, size: 11, font, color: RED });
  y -= 16;
  page.drawText(`Signed ${data.signedDate}  ·  ${data.parentEmail}`, { x: MARGIN, y: y - 10, size: 9, font, color: MUTED });
  y -= 16;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
  y -= 6;

  // ── Children ─────────────────────────────────────────────────────────────────
  sectionHeading("Child / Student Identification");
  data.children.forEach((c, i) => {
    field(`Child ${i + 1} name`, c.name);
    field("Date of birth", c.dob);
    field("Gender", c.gender);
  });
  field("Children's address", data.childrenAddress);

  // ── Parents / guardians ─────────────────────────────────────────────────────
  sectionHeading("Parent / Guardian Contacts");
  field("Parent email", data.parentEmail);
  field("Primary phone", data.primaryPhone);
  field("Who has legal custody?", data.legalCustody);
  if (data.mother && Object.values(data.mother).some(Boolean)) {
    field("Mother's name", data.mother.name);
    field("Phone", data.mother.phone);
    field("Home address", data.mother.address);
    field("Work phone", data.mother.workPhone);
    field("Cell phone", data.mother.cellPhone);
  }
  if (data.father && Object.values(data.father).some(Boolean)) {
    field("Father's name", data.father.name);
    field("Phone", data.father.phone);
    field("Home address", data.father.address);
    field("Cell phone", data.father.cellPhone);
  }

  // ── Pickup authorization ─────────────────────────────────────────────────────
  sectionHeading("Pick-Up Authorization");
  drawParagraph(
    "The child will be released only to the person authorized, in writing, by the custodial parent(s) or legal guardian(s). The following people are authorized to remove the child from the facility in case of illness, accident, or injury if for some reason the custodial parent(s) or legal guardian(s) cannot be reached.",
    { size: 9, color: MUTED, gap: 4 },
  );
  data.pickupAuth.forEach((p, i) => {
    field(`Authorized person ${i + 1}`, p.phone ? `${p.name}  ·  ${p.phone}` : p.name);
  });
  field("Custodial parent / guardian", data.custodialGuardianName);

  // ── About the child ─────────────────────────────────────────────────────────
  sectionHeading("Getting to Know Your Child");
  field("Special needs / meds / allergies", data.aboutChild.specialNeeds);
  field("Ever had / suspected seizures?", data.aboutChild.hadSeizures ? "Yes" : "No");
  field("Has temper tantrums?", data.aboutChild.hasTantrums ? "Yes" : "No");
  if (data.aboutChild.hasTantrums) field("How they are handled", data.aboutChild.tantrumHandling);

  // ── Program selection ─────────────────────────────────────────────────────────
  sectionHeading("Program Selection");
  field("Plan", data.planLabel);
  field("Anticipated start date", data.startDate);
  field("Pick-up days", data.pickupDays.length ? data.pickupDays.join(", ") : "—");
  field("Uniform ($50)", data.includeUniform ? "Yes" : "No");
  field("Supply fee ($65/yr)", data.includeSupplyFee ? "Yes" : "No");
  if (data.earlyBird) field("Early bird", "50% off first month (registered by July 31)");

  // ── Waiver + policies with initials ──────────────────────────────────────────
  sectionHeading("Waiver, Release & Policies");
  drawParagraph("The parent / guardian initialed each section below to acknowledge and agree.", { size: 9, color: MUTED, gap: 4 });
  for (const s of AFTERSCHOOL_WAIVER_SECTIONS) {
    ensure(30);
    const initials = (data.waiverInitials[s.key] || "").toUpperCase();
    // title row with initials pill on the right
    page.drawText(s.title, { x: MARGIN, y: y - 10.5, size: 10.5, font: bold, color: NAVY });
    const pill = `Initialed: ${initials || "—"}`;
    const pw = bold.widthOfTextAtSize(pill, 9);
    page.drawText(pill, { x: PAGE_W - MARGIN - pw, y: y - 10, size: 9, font: bold, color: RED });
    y -= 16;
    for (const para of s.body) drawParagraph(para, { size: 9, gap: 3 });
    y -= 4;
  }

  // ── Signature ─────────────────────────────────────────────────────────────────
  ensure(90);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LINE });
  y -= 10;
  page.drawText("Electronic Signature", { x: MARGIN, y: y - 11, size: 11, font: bold, color: NAVY });
  y -= 22;

  const b64 = data.signaturePngDataUrl.split(",")[1];
  if (b64) {
    try {
      const png = await pdf.embedPng(Buffer.from(b64, "base64"));
      const targetW = 200;
      const scale = targetW / png.width;
      const h = Math.min(png.height * scale, 56);
      ensure(h + 24);
      page.drawImage(png, { x: MARGIN, y: y - h, width: targetW, height: h });
      y -= h + 2;
    } catch {
      /* ignore bad signature image */
    }
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 220, y }, thickness: 0.75, color: LINE });
  y -= 12;
  const who = data.signedRelationship ? `${data.signedName}  (${data.signedRelationship})` : data.signedName;
  page.drawText(who, { x: MARGIN, y: y - 9, size: 9.5, font, color: INK });
  page.drawText(`Date: ${data.signedDate}`, { x: MARGIN + 260, y: y - 9, size: 9.5, font, color: INK });
  y -= 18;
  drawParagraph(
    "This document was signed electronically. By typing initials and drawing a signature, the parent / guardian agreed to the terms above with the same effect as a handwritten signature.",
    { size: 7.5, color: MUTED },
  );

  return pdf.save();
}
