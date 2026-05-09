/**
 * Meta Conversions API (CAPI) helper
 *
 * Fires server-side events to Facebook so the ad algorithm gets accurate
 * conversion signals even when the browser pixel is blocked.
 *
 * Events fired:
 *  - Lead      → when a new free-class inquiry is submitted
 *  - Purchase  → when a lead's pipeline stage moves to "enrolled"
 *
 * Deduplication: we set event_id = leadId (string) on both the CAPI event
 * and the browser pixel so Facebook merges them and doesn't double-count.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import crypto from "crypto";
import { ENV } from "./_core/env";

const CAPI_URL = "https://graph.facebook.com/v19.0";

/** SHA-256 hash a string (required for PII fields sent to Meta) */
function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

interface LeadEventData {
  leadId: number;
  name: string;
  email: string;
  phone: string;
  programInterest: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  eventSourceUrl?: string;
}

interface PurchaseEventData {
  leadId: number;
  email: string;
  phone?: string | null;
  valueUsd: number;
}

/**
 * Fire a Lead event to Meta CAPI.
 * Call this immediately after a new lead is saved to the database.
 */
export async function fireLeadEvent(data: LeadEventData): Promise<void> {
  if (!ENV.facebookPixelId || !ENV.facebookCapiToken) {
    console.log("[Meta CAPI] Skipping Lead event — FACEBOOK_PIXEL_ID or FACEBOOK_CAPI_TOKEN not set");
    return;
  }

  const nameParts = data.name.trim().split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") || firstName;

  const payload = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        event_id: String(data.leadId), // dedup key — must match browser pixel event_id
        event_source_url: data.eventSourceUrl ?? "https://tmatkd.com/free-class",
        action_source: "website",
        user_data: {
          em: [sha256(data.email)],
          ph: [sha256(data.phone.replace(/\D/g, ""))],
          fn: [sha256(firstName)],
          ln: [sha256(lastName)],
          external_id: [sha256(String(data.leadId))],
        },
        custom_data: {
          program_interest: data.programInterest,
          utm_source: data.utmSource ?? "",
          utm_medium: data.utmMedium ?? "",
          utm_campaign: data.utmCampaign ?? "",
          utm_content: data.utmContent ?? "",
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `${CAPI_URL}/${ENV.facebookPixelId}/events?access_token=${ENV.facebookCapiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      console.error("[Meta CAPI] Lead event failed:", JSON.stringify(json));
    } else {
      console.log(`[Meta CAPI] Lead event sent for leadId=${data.leadId}`, json);
    }
  } catch (err) {
    console.error("[Meta CAPI] Lead event error:", err);
  }
}

/**
 * Fire a Purchase event to Meta CAPI.
 * Call this when a lead's pipeline stage is updated to "enrolled".
 */
export async function firePurchaseEvent(data: PurchaseEventData): Promise<void> {
  if (!ENV.facebookPixelId || !ENV.facebookCapiToken) {
    console.log("[Meta CAPI] Skipping Purchase event — FACEBOOK_PIXEL_ID or FACEBOOK_CAPI_TOKEN not set");
    return;
  }

  const userDataFields: Record<string, string[]> = {
    em: [sha256(data.email)],
    external_id: [sha256(String(data.leadId))],
  };
  if (data.phone) {
    userDataFields.ph = [sha256(data.phone.replace(/\D/g, ""))];
  }

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `purchase_${data.leadId}`,
        event_source_url: "https://tmatkd.com/admin/registrations",
        action_source: "website",
        user_data: userDataFields,
        custom_data: {
          value: data.valueUsd,
          currency: "USD",
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `${CAPI_URL}/${ENV.facebookPixelId}/events?access_token=${ENV.facebookCapiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      console.error("[Meta CAPI] Purchase event failed:", JSON.stringify(json));
    } else {
      console.log(`[Meta CAPI] Purchase event sent for leadId=${data.leadId}, value=$${data.valueUsd}`, json);
    }
  } catch (err) {
    console.error("[Meta CAPI] Purchase event error:", err);
  }
}
