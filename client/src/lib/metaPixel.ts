/**
 * Meta pixel helpers (2026-10-01).
 *
 * The pixel base code lives in client/index.html and fires PageView on every load.
 * This file fires the events that actually matter for ad optimisation.
 *
 * Why it exists: the Fall 2026 taekwondo campaign spent its first ten days optimising for
 * "landing page views" because there was no pixel at all, so Meta had no way to see who
 * signed up and no way to look for more people like them. A Lead event is the thing a
 * conversions campaign optimises toward.
 *
 * Deduplication: the server already sends a Lead to the Conversions API with
 * event_id = the lead row id (see server/meta-capi.ts). Passing the SAME id here as
 * `eventID` is what tells Meta the browser event and the server event are one conversion
 * rather than two. If the id is missing we still fire, because a possible double count is
 * better than a missing conversion, but it should normally be present.
 */

declare global {
  interface Window { fbq?: (...args: any[]) => void }
}

function ready() {
  return typeof window !== "undefined" && typeof window.fbq === "function";
}

/** Someone landed on an offer page and could plausibly convert. */
export function fireMetaViewContent(params?: Record<string, unknown>) {
  try {
    if (!ready()) return;
    window.fbq!("track", "ViewContent", params ?? {});
  } catch {
    // Tracking must never break a page.
  }
}

/** A form was submitted successfully. `leadId` comes back from leads.submit. */
export function fireMetaLead(leadId?: string, params?: Record<string, unknown>) {
  try {
    if (!ready()) return;
    window.fbq!("track", "Lead", params ?? {}, leadId ? { eventID: String(leadId) } : undefined);
  } catch {
    // Tracking must never break a form submit.
  }
}
