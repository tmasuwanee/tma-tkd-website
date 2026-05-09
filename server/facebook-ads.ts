/**
 * Facebook Marketing API integration
 *
 * Pulls ad performance data (spend, impressions, clicks, leads, CPL)
 * from the Facebook Marketing API and stores it in the facebook_ad_insights
 * MySQL table for offline querying by Claude, Codex, and n8n.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 *
 * Required secrets (set in Settings → Secrets):
 *   FACEBOOK_MARKETING_API_TOKEN  — long-lived access token with ads_read permission
 *   FACEBOOK_AD_ACCOUNT_ID        — your ad account ID (e.g. act_123456789)
 */

import { getDb } from "./db";
import { facebookAdInsights } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { gte, desc } from "drizzle-orm";

const GRAPH_URL = "https://graph.facebook.com/v19.0";

interface AdInsightRow {
  date_start: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
}

function extractLeads(actions?: AdInsightRow["actions"]): number {
  if (!actions) return 0;
  const leadAction = actions.find(
    (a) => a.action_type === "lead" || a.action_type === "offsite_conversion.fb_pixel_lead"
  );
  return leadAction ? parseInt(leadAction.value, 10) : 0;
}

function extractCostPerLead(cpa?: AdInsightRow["cost_per_action_type"]): string {
  if (!cpa) return "0";
  const leadCpa = cpa.find(
    (a) => a.action_type === "lead" || a.action_type === "offsite_conversion.fb_pixel_lead"
  );
  return leadCpa?.value ?? "0";
}

/**
 * Pull the last N days of ad insights from Facebook Marketing API
 * and upsert them into the facebook_ad_insights table.
 */
export async function syncAdInsights(days: number = 7): Promise<{ synced: number; error?: string }> {
  if (!ENV.facebookMarketingApiToken || !ENV.facebookAdAccountId) {
    return { synced: 0, error: "FACEBOOK_MARKETING_API_TOKEN or FACEBOOK_AD_ACCOUNT_ID not set" };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = new Date().toISOString().split("T")[0];

  const params = new URLSearchParams({
    access_token: ENV.facebookMarketingApiToken,
    level: "ad",
    fields: [
      "date_start",
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "spend",
      "impressions",
      "clicks",
      "actions",
      "cost_per_action_type",
    ].join(","),
    time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
    time_increment: "1",
    limit: "500",
  });

  const accountId = ENV.facebookAdAccountId.startsWith("act_")
    ? ENV.facebookAdAccountId
    : `act_${ENV.facebookAdAccountId}`;

  try {
    const res = await fetch(`${GRAPH_URL}/${accountId}/insights?${params.toString()}`);
    const json = (await res.json()) as { data?: AdInsightRow[]; error?: { message: string } };

    if (!res.ok || json.error) {
      console.error("[Facebook Ads] API error:", json.error?.message ?? JSON.stringify(json));
      return { synced: 0, error: json.error?.message ?? "Unknown API error" };
    }

    const rows = json.data ?? [];
    if (rows.length === 0) {
      return { synced: 0 };
    }

    const db = await getDb();
    if (!db) return { synced: 0, error: "Database not available" };

    let synced = 0;
    for (const row of rows) {
      await db
        .insert(facebookAdInsights)
        .values({
          date: row.date_start,
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          adsetId: row.adset_id,
          adsetName: row.adset_name,
          adId: row.ad_id,
          adName: row.ad_name,
          spend: row.spend,
          impressions: parseInt(row.impressions, 10) || 0,
          clicks: parseInt(row.clicks, 10) || 0,
          leads: extractLeads(row.actions),
          costPerLead: extractCostPerLead(row.cost_per_action_type),
        })
        .onDuplicateKeyUpdate({
          set: {
            spend: row.spend,
            impressions: parseInt(row.impressions, 10) || 0,
            clicks: parseInt(row.clicks, 10) || 0,
            leads: extractLeads(row.actions),
            costPerLead: extractCostPerLead(row.cost_per_action_type),
          },
        });
      synced++;
    }

    console.log(`[Facebook Ads] Synced ${synced} rows for ${sinceStr} → ${untilStr}`);
    return { synced };
  } catch (err) {
    console.error("[Facebook Ads] Sync error:", err);
    return { synced: 0, error: String(err) };
  }
}

/**
 * Query stored ad insights from MySQL for the last N days.
 * Used by /api/ads/insights endpoint.
 */
export async function getAdInsights(days: number = 7) {
  const db = await getDb();
  if (!db) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  return db
    .select()
    .from(facebookAdInsights)
    .where(gte(facebookAdInsights.date, sinceStr))
    .orderBy(desc(facebookAdInsights.date));
}
