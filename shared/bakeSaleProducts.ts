/**
 * Bake sale product configuration (2026-09-14).
 *
 * THIS FILE IS THE ONLY PLACE TO EDIT PRODUCTS, PRICES, OR AVAILABILITY.
 * The server imports it and recalculates every total from it, so a price
 * changed here changes both what the page shows and what Stripe charges.
 * Nothing the browser sends about price or name is ever trusted.
 *
 * Money is integer cents everywhere. 300 = $3.00.
 *
 * To sell out an item mid-event: set active:false and redeploy, or just tell
 * people at the table. To add an item: copy a block, give it a new id.
 *
 * Optional `image` is a path under client/public. Drop the photo at that exact
 * path and it appears on the card. If the file is missing the card still
 * renders correctly (the image hides itself on load error), so it is safe to
 * ship before the photos are in place.
 */
export type BakeSaleProduct = {
  id: string;
  name: string;
  description: string;
  unitAmount: number;      // integer cents
  active: boolean;
  sortOrder: number;
  allergenWarning?: string;
  image?: string;
  maxQuantity?: number;    // per-product cap, defaults to DEFAULT_MAX_QUANTITY
};

export const bakeSaleConfig = {
  eventName: "Top Martial Arts Bake Sale",
  currency: "usd",

  // Header banner. Same art as the printed flyer so the phone screen and the
  // table match. Set to null to fall back to the plain navy header.
  bannerImage: "/site-media/bake-sale/banner.jpg",
  cause: "Supporting our competing students and demo team.",

  // Set showGoal:false to hide the progress area entirely.
  goal: {
    showGoal: false,
    label: "Fundraiser goal",
    targetAmount: 50000,   // $500.00
    raisedAmount: 0,       // update by hand, this page does not read Stripe totals
  },

  products: [
    {
      id: "large-cookie",
      name: "Large Cookie",
      description: "Chocolate chunk, oatmeal raisin, or white chocolate macadamia. Pick your flavor at the table.",
      unitAmount: 300,
      active: true,
      sortOrder: 1,
      allergenWarning: "Contains wheat, egg, milk, soy. May contain tree nuts.",
      image: "/site-media/bake-sale/large-cookie.jpg",
    },
    {
      id: "two-cookie-bundle",
      name: "Two Large Cookies",
      description: "Any two flavors. Saves you a dollar.",
      unitAmount: 500,
      active: true,
      sortOrder: 2,
      allergenWarning: "Contains wheat, egg, milk, soy. May contain tree nuts.",
      image: "/site-media/bake-sale/assorted-cookies.jpg",
    },
    {
      id: "mini-cookie-bag",
      name: "Mini Cookie Bag",
      description: "Four mini chocolate chip cookies, bagged and tied.",
      unitAmount: 400,
      active: true,
      sortOrder: 3,
      allergenWarning: "Contains wheat, egg, milk, soy.",
      image: "/site-media/bake-sale/mini-cookie-bag.jpg",
    },
    {
      id: "beignet-bag",
      name: "Chocolate Hazelnut Beignets",
      description: "Two mini beignets filled with chocolate hazelnut, dusted with powdered sugar.",
      unitAmount: 500,
      active: true,
      sortOrder: 4,
      allergenWarning: "Contains hazelnuts, wheat, egg, milk, soy. Made on equipment that also processes peanuts and tree nuts.",
      image: "/site-media/bake-sale/beignets.jpg",
    },
  ] satisfies BakeSaleProduct[] as BakeSaleProduct[],

  // Preset "add a little extra" buttons, in cents. Never preselected.
  contributionOptions: [100, 300, 500, 1000],
};

// ─── Server-side guardrails (also used by the client to keep the UI honest) ───
export const DEFAULT_MAX_QUANTITY = 20;          // per product, per order
export const MAX_LINE_ITEMS = 10;                // distinct products per order
export const MIN_CONTRIBUTION_CENTS = 100;       // $1
export const MAX_CONTRIBUTION_CENTS = 50000;     // $500
export const MAX_ORDER_CENTS = 100000;           // $1,000 sanity ceiling

export const CONTRIBUTION_LINE_NAME = "Bake Sale Fundraiser Contribution";

/** Active products in display order. */
export function activeBakeSaleProducts(): BakeSaleProduct[] {
  return bakeSaleConfig.products
    .filter(p => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Trusted lookup. Returns undefined for unknown or inactive ids. */
export function findActiveProduct(id: string): BakeSaleProduct | undefined {
  return bakeSaleConfig.products.find(p => p.id === id && p.active);
}

export function maxQuantityFor(p: BakeSaleProduct): number {
  return p.maxQuantity ?? DEFAULT_MAX_QUANTITY;
}

/** $3.00 from 300. Single formatter so the page and the emails agree. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
