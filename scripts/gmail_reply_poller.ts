#!/usr/bin/env tsx
/**
 * Gmail Reply Poller (2026-06-06)
 *
 * Polls the TMA Gmail inbox every N minutes (default: every 5 min via cron).
 * For each new message:
 *   1. Extract sender email, subject, plain-text body, Gmail messageId
 *   2. POST to /api/trpc/inbound.emailReply (shared-secret protected)
 *   3. Server matches the sender email to a lead and writes an inbound
 *      activity row. Unique index on externalId stops double-processing.
 *
 * Designed to run from n8n's "Execute Command" node, or from a Cloud Scheduler
 * job, or locally as `tsx scripts/gmail_reply_poller.ts`. Idempotent.
 *
 * Required env:
 *   TMA_GMAIL_CLIENT_ID        OAuth2 client id (Google Cloud Console)
 *   TMA_GMAIL_CLIENT_SECRET    OAuth2 client secret
 *   TMA_GMAIL_REFRESH_TOKEN    OAuth refresh token from the inbox we're polling
 *   TMA_GMAIL_INBOX_EMAIL      Display only — included in logs
 *   GMAIL_POLLER_SHARED_SECRET Matches the env var on the API server
 *   TMA_API_BASE               https://tmatkd.com (defaults to this)
 *
 * Persists last-processed timestamp in a small JSON state file so we only
 * fetch new messages each run.
 */
import fs from "node:fs";
import path from "node:path";

const STATE_FILE = path.resolve(process.cwd(), ".gmail_poller_state.json");
const API_BASE = (process.env.TMA_API_BASE ?? "https://tmatkd.com").replace(/\/+$/, "");

type State = { lastInternalDate: number; processedIds: string[] };

function loadState(): State {
  if (!fs.existsSync(STATE_FILE)) return { lastInternalDate: 0, processedIds: [] };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { lastInternalDate: 0, processedIds: [] };
  }
}

function saveState(s: State) {
  // Cap processedIds at last 500 so the file doesn't grow forever
  s.processedIds = s.processedIds.slice(-500);
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

async function refreshAccessToken(): Promise<string> {
  const clientId = process.env.TMA_GMAIL_CLIENT_ID;
  const clientSecret = process.env.TMA_GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.TMA_GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing TMA_GMAIL_CLIENT_ID / TMA_GMAIL_CLIENT_SECRET / TMA_GMAIL_REFRESH_TOKEN");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!resp.ok) {
    throw new Error(`Token refresh failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

async function listMessages(accessToken: string, sinceInternalDate: number): Promise<string[]> {
  // Build the search query. `newer_than:7d` keeps the API call efficient.
  const q = encodeURIComponent("category:primary newer_than:7d -from:noreply -from:mailer-daemon");
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=50`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`list failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as { messages?: { id: string }[] };
  return (data.messages ?? []).map(m => m.id);
}

interface GmailMessage {
  id: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
    parts?: Array<{ mimeType: string; body: { data?: string }; parts?: any[] }>;
    body?: { data?: string };
    mimeType: string;
  };
}

async function getMessage(accessToken: string, id: string): Promise<GmailMessage> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`get failed: ${resp.status} ${await resp.text()}`);
  return await resp.json() as GmailMessage;
}

function decodeBase64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractBody(msg: GmailMessage): string {
  // Prefer text/plain; fall back to first text/html stripped of tags.
  function walk(part: any): string | null {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      for (const p of part.parts) {
        const found = walk(p);
        if (found) return found;
      }
    }
    return null;
  }
  function walkHtml(part: any): string | null {
    if (part.mimeType === "text/html" && part.body?.data) {
      return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    if (part.parts) {
      for (const p of part.parts) {
        const found = walkHtml(p);
        if (found) return found;
      }
    }
    return null;
  }
  const text = walk(msg.payload);
  if (text) return text;
  const html = walkHtml(msg.payload);
  if (html) return html;
  if (msg.payload.body?.data) return decodeBase64Url(msg.payload.body.data);
  return "";
}

function extractFromEmail(msg: GmailMessage): string | null {
  const fromHeader = msg.payload.headers.find(h => h.name.toLowerCase() === "from");
  if (!fromHeader) return null;
  // "Display Name <email@x.com>" or just "email@x.com"
  const match = fromHeader.value.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader.value).trim().toLowerCase();
}

function extractSubject(msg: GmailMessage): string {
  const h = msg.payload.headers.find(h => h.name.toLowerCase() === "subject");
  return h?.value ?? "(no subject)";
}

async function postReplyToServer(args: {
  fromEmail: string; subject: string; body: string; gmailMessageId: string; receivedAt: Date;
}): Promise<{ matched: number }> {
  const secret = process.env.GMAIL_POLLER_SHARED_SECRET;
  if (!secret) throw new Error("Missing GMAIL_POLLER_SHARED_SECRET");
  const payload = {
    json: {
      secret,
      fromEmail: args.fromEmail,
      subject: args.subject,
      body: args.body,
      gmailMessageId: args.gmailMessageId,
      receivedAtIso: args.receivedAt.toISOString(),
    },
  };
  const resp = await fetch(`${API_BASE}/api/trpc/inbound.emailReply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`POST failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as any;
  return data?.result?.data?.json ?? data?.result?.data ?? { matched: 0 };
}

async function main() {
  const state = loadState();
  const inbox = process.env.TMA_GMAIL_INBOX_EMAIL ?? "(unknown inbox)";
  console.log(`[gmail-poller] start; inbox=${inbox}; lastInternalDate=${state.lastInternalDate}`);

  const accessToken = await refreshAccessToken();
  const ids = await listMessages(accessToken, state.lastInternalDate);
  console.log(`[gmail-poller] ${ids.length} message id(s) returned`);

  let processed = 0, matched = 0, skipped = 0, errored = 0;
  let maxInternalDate = state.lastInternalDate;

  for (const id of ids) {
    if (state.processedIds.includes(id)) { skipped++; continue; }
    try {
      const msg = await getMessage(accessToken, id);
      const internalDate = parseInt(msg.internalDate, 10);
      if (internalDate <= state.lastInternalDate) { skipped++; continue; }

      const fromEmail = extractFromEmail(msg);
      if (!fromEmail) { skipped++; continue; }

      const subject = extractSubject(msg);
      const body = extractBody(msg);
      const result = await postReplyToServer({
        fromEmail, subject, body,
        gmailMessageId: id,
        receivedAt: new Date(internalDate),
      });

      processed++;
      if (result.matched > 0) {
        matched++;
        console.log(`[gmail-poller] matched ${fromEmail} -> lead ${result.matched}`);
      }
      state.processedIds.push(id);
      if (internalDate > maxInternalDate) maxInternalDate = internalDate;
    } catch (e: any) {
      errored++;
      console.error(`[gmail-poller] error on ${id}: ${e?.message ?? e}`);
    }
  }

  state.lastInternalDate = maxInternalDate;
  saveState(state);

  console.log(`[gmail-poller] done; processed=${processed} matched=${matched} skipped=${skipped} errored=${errored}`);
}

main().catch(e => { console.error(e); process.exit(1); });
