/**
 * Christmas in July sale pricing — SINGLE SOURCE OF TRUTH.
 *
 * Imported by BOTH the client (to display the cart) and the server (to compute
 * the amount actually charged). The server never trusts a client-sent price: it
 * recomputes the total from the raw selections via computeOrder(). Keeping the
 * catalog here means the two can never drift apart.
 *
 * If you change a price, change it here and nowhere else.
 */

export type Product = {
  key: string;
  name: string;
  price: number;
  image?: string;
};

export type Program = {
  key: string;
  name: string;
  monthlyPrice: number;
};

export type DurationOption = {
  months: 3 | 6;
  label: string;
  discount: number;
};

export const PRODUCTS: Product[] = [
  { key: "tshirt", name: "TMA T-Shirt", price: 30 },
  { key: "uniform", name: "Taekwondo Uniform", price: 60 },
  { key: "kicking-paddle", name: "Kicking Paddle", price: 35 },
  { key: "nunchucks", name: "Nunchucks", price: 25 },
  { key: "belt-rack", name: "Belt Rack", price: 48 },
  { key: "kickboxing-shorts", name: "Kickboxing Shorts", price: 35, image: "/proshop/kickboxing-shorts.png" },
  { key: "kickboxing-shin-gloves", name: "Kickboxing Shin Pads + Gloves", price: 75, image: "/proshop/kickboxing-shin-gloves.png" },
  { key: "kickboxing-tee", name: "Kickboxing Tee Shirt", price: 30, image: "/proshop/kickboxing-tee.png" },
  { key: "bjj-gi", name: "BJJ Gi", price: 150 },
  { key: "rebreakable-board", name: "Rebreakable Board", price: 40 },
];

// Flat sale-price overrides that bypass the standard 20% off.
export const PRODUCT_OVERRIDES: Record<string, number> = {
  tshirt: 20, // Sale price override (regular $30 → sale $20)
};

export const MARTIAL_ARTS_PROGRAMS: Program[] = [
  { key: "tkd-2x", name: "Taekwondo 2x/week", monthlyPrice: 179 },
  { key: "tkd-3x", name: "Taekwondo 3x/week", monthlyPrice: 199 },
  { key: "kickboxing", name: "Kickboxing", monthlyPrice: 159 },
  { key: "bjj", name: "Brazilian Jiu-Jitsu (BJJ)", monthlyPrice: 159 },
];

export const AFTERSCHOOL_PROGRAMS: Program[] = [
  { key: "afterschool-5", name: "Afterschool 5 days/week", monthlyPrice: 540 },
  { key: "afterschool-3", name: "Afterschool 3 days/week", monthlyPrice: 500 },
];

export const DURATIONS: DurationOption[] = [
  { months: 3, label: "3-Month Package", discount: 0.05 },
  { months: 6, label: "6-Month Package", discount: 0.1 },
];

export const ADDITIONAL_KID_MONTHLY_DISCOUNT = 20;
export const MAX_ADDITIONAL_KIDS = 4;
export const MAX_PRODUCT_QTY = 5;

export const PRIVATE_LESSONS_PRICE = 200;
export const PRIVATE_LESSONS_REGULAR = 375;
export const BELT_TESTING_PRICE = 250;
export const BELT_TESTING_REGULAR = 300;

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

/** Standard 20% off. */
export function salePrice(price: number) {
  return roundMoney(price * 0.8);
}

/** Sale price for a product key, honoring flat overrides. */
export function productSalePrice(product: Product) {
  const override = PRODUCT_OVERRIDES[product.key];
  return override !== undefined ? override : salePrice(product.price);
}

export function clampQuantity(value: number) {
  return Math.max(0, Math.min(MAX_PRODUCT_QTY, value));
}

export function computePackageTotals(monthlyPrice: number, duration: DurationOption) {
  const regularTotal = roundMoney(monthlyPrice * duration.months);
  const saleTotal = roundMoney(regularTotal * (1 - duration.discount));
  const savings = roundMoney(regularTotal - saleTotal);
  return { regularTotal, saleTotal, savings };
}

export function getPackageSelection(
  programs: Program[],
  programKey: string | null | undefined,
  months: 3 | 6 | null | undefined
) {
  const program = programs.find(item => item.key === programKey);
  const duration = DURATIONS.find(item => item.months === months);
  if (!program || !duration) return null;
  return { program, duration, ...computePackageTotals(program.monthlyPrice, duration) };
}

/** Each additional child: $20/mo off the original tuition, then the package discount. */
export function getAdditionalKidSelection(
  programs: Program[],
  programKey: string | null | undefined,
  months: 3 | 6 | null | undefined
) {
  const program = programs.find(item => item.key === programKey);
  const duration = DURATIONS.find(item => item.months === months);
  if (!program || !duration) return null;
  const monthlyPrice = Math.max(0, program.monthlyPrice - ADDITIONAL_KID_MONTHLY_DISCOUNT);
  return { program, duration, monthlyPrice, ...computePackageTotals(monthlyPrice, duration) };
}

/** Raw cart state. This is what the client sends; it contains NO prices. */
export type OrderSelections = {
  quantities?: Record<string, number>;
  maProgram?: string | null;
  maDuration?: 3 | 6 | null;
  afterschoolProgram?: string | null;
  afterschoolDuration?: 3 | 6 | null;
  afterschoolAdditionalKids?: number;
  additionalKidNames?: string[];
  privateLessons?: boolean;
  beltTesting?: boolean;
};

export type OrderLine = { label: string; amount: number };

/**
 * Authoritative order computation. The server calls this to decide what to
 * charge; the client calls it to render the summary. Same input, same output.
 */
export function computeOrder(sel: OrderSelections): { lines: OrderLine[]; total: number } {
  const lines: OrderLine[] = [];

  // Pro shop
  const quantities = sel.quantities ?? {};
  for (const product of PRODUCTS) {
    const qty = clampQuantity(Math.floor(Number(quantities[product.key] ?? 0)) || 0);
    if (qty <= 0) continue;
    const unit = productSalePrice(product);
    const lineTotal = roundMoney(unit * qty);
    lines.push({
      label: `Pro shop: ${product.name} x ${qty} at ${formatMoney(unit)} each`,
      amount: lineTotal,
    });
  }

  // Martial arts tuition package
  const ma = getPackageSelection(MARTIAL_ARTS_PROGRAMS, sel.maProgram, sel.maDuration);
  if (ma) {
    lines.push({
      label: `Martial arts package: ${ma.program.name}, ${ma.duration.label} (regular ${formatMoney(ma.regularTotal)}, save ${formatMoney(ma.savings)})`,
      amount: ma.saleTotal,
    });
  }

  // Afterschool tuition package (first child)
  const as = getPackageSelection(AFTERSCHOOL_PROGRAMS, sel.afterschoolProgram, sel.afterschoolDuration);
  if (as) {
    lines.push({
      label: `Afterschool package: ${as.program.name}, ${as.duration.label} (regular ${formatMoney(as.regularTotal)}, save ${formatMoney(as.savings)})`,
      amount: as.saleTotal,
    });
  }

  // Afterschool additional children. Only valid alongside a first-child package.
  const extraKids = Math.max(
    0,
    Math.min(MAX_ADDITIONAL_KIDS, Math.floor(Number(sel.afterschoolAdditionalKids ?? 0)) || 0)
  );
  if (as && extraKids > 0) {
    const extra = getAdditionalKidSelection(AFTERSCHOOL_PROGRAMS, sel.afterschoolProgram, sel.afterschoolDuration);
    if (extra) {
      const names = (sel.additionalKidNames ?? [])
        .slice(0, extraKids)
        .map((n, i) => (String(n ?? "").trim() || `child ${i + 2}`))
        .join(", ");
      lines.push({
        label: `Afterschool additional children (${extraKids}${names ? `: ${names}` : ""}) at ${formatMoney(extra.monthlyPrice)}/mo each, ${extra.duration.label}`,
        amount: roundMoney(extra.saleTotal * extraKids),
      });
    }
  }

  if (sel.privateLessons) {
    lines.push({
      label: `Bundle of 5 Private Lessons (regular ${formatMoney(PRIVATE_LESSONS_REGULAR)})`,
      amount: PRIVATE_LESSONS_PRICE,
    });
  }

  if (sel.beltTesting) {
    lines.push({
      label: `Belt Testing Bundle, Buy 5 Get 1 Free (value ${formatMoney(BELT_TESTING_REGULAR)})`,
      amount: BELT_TESTING_PRICE,
    });
  }

  const total = roundMoney(lines.reduce((sum, l) => sum + l.amount, 0));
  return { lines, total };
}

/** Cents, for Stripe. */
export function computeOrderCents(sel: OrderSelections): number {
  return Math.round(computeOrder(sel).total * 100);
}

/** Plain-text order summary stored on the lead / emailed to staff. */
export function buildOrderSummary(sel: OrderSelections, notes?: string): string {
  const { lines, total } = computeOrder(sel);
  const out = [
    "Christmas in July Sale order",
    "Sale dates: July 13-17, 2026",
    "",
    "Selected items:",
  ];
  if (lines.length === 0) out.push("No sale items selected.");
  lines.forEach(l => out.push(`${l.label} = ${formatMoney(l.amount)}`));
  out.push("");
  out.push(`Grand total: ${formatMoney(total)}`);
  if (notes && notes.trim()) {
    out.push("");
    out.push(`Customer notes: ${notes.trim()}`);
  }
  return out.join("\n");
}
