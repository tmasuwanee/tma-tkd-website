/**
 * Google Ads conversion firing (2026-09-23).
 *
 * tmatkd.com is a single page app, so there is no thank you page URL and Google's
 * "Page load" conversion method never fires. Every conversion has to be reported from
 * the form's own success handler, which is what `fireAdsConversion` does.
 *
 * Until the Google Ads account exists, VITE_GOOGLE_ADS_ID is empty and every call here
 * is a no-op. Nothing breaks, nothing is reported. To switch it on:
 *   1. Create the conversion action in Google Ads and copy its send_to value,
 *      which looks like AW-123456789/AbC-D_efGh12345
 *   2. Set VITE_GOOGLE_ADS_ID=AW-123456789 in the environment
 *   3. Put the full send_to strings in CONVERSION_LABELS below
 *   4. Redeploy. Deploy time config is not code: the build must be redone for the
 *      new value to exist in the bundle.
 */

const ADS_ID = (import.meta as any).env?.VITE_GOOGLE_ADS_ID as string | undefined;

/** Full `send_to` values, one per conversion action. Fill these in from Google Ads. */
export const CONVERSION_LABELS: Record<string, string> = {
  free_month_lead: "",       // /free-month form submit, the primary action
  camp_registration: "",     // fall break / camp registration paid
};

declare global {
  interface Window { gtag?: (...args: any[]) => void; dataLayer?: any[] }
}

/**
 * Report a conversion to Google Ads. Safe to call anywhere: if the tag is missing,
 * the ID is unset, or the label is blank, it quietly does nothing.
 */
export function fireAdsConversion(action: keyof typeof CONVERSION_LABELS | string, params?: Record<string, unknown>) {
  try {
    const sendTo = CONVERSION_LABELS[action];
    if (!ADS_ID || !sendTo || typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", "conversion", { send_to: sendTo, ...params });
  } catch {
    // Tracking must never break a form submit.
  }
}
