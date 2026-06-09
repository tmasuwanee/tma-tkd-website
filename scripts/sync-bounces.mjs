/**
 * Targeted bounce sync script (2026-06-09 v3)
 *
 * Approach: fetch only the first page of Resend emails (most recent 100),
 * which covers tonight's blast window (2026-06-09 20:xx UTC).
 * Filter to bounced, match by recipient email to leads table,
 * then mark future queue rows as failed and write bounce activity rows.
 *
 * Run: node -r dotenv/config scripts/sync-bounces.mjs
 */

import mysql from 'mysql2/promise';

const RESEND_KEY = process.env.RESEND_API_KEY;
const DB_URL = process.env.DATABASE_URL;

if (!RESEND_KEY) { console.error('RESEND_API_KEY not set'); process.exit(1); }
if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 1. Fetch tonight's emails from Resend (first 2 pages = 200 most recent) ──
console.log('Fetching recent emails from Resend API...');
let allEmails = [];

for (let offset = 0; offset < 300; offset += 100) {
  await sleep(250); // stay under 5 req/s
  const url = `https://api.resend.com/emails?limit=100&offset=${offset}`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${RESEND_KEY}` } });
  if (!resp.ok) {
    const err = await resp.text();
    console.error('Resend API error:', resp.status, err);
    break;
  }
  const data = await resp.json();
  const batch = data.data ?? [];
  allEmails = allEmails.concat(batch);
  console.log(`  Fetched ${allEmails.length} total`);
  if (!data.has_more || batch.length < 100) break;
}

// Scope to tonight's window (2026-06-09 20:00 UTC onward)
const windowStart = '2026-06-09 20:00:00';
const tonightEmails = allEmails.filter(e => e.created_at >= windowStart);
console.log(`\nTonight's emails (after ${windowStart} UTC): ${tonightEmails.length}`);

const bounced = tonightEmails.filter(e => e.last_event === 'bounced');
console.log(`Bounced tonight: ${bounced.length}`);

if (bounced.length === 0) {
  console.log('No bounces to sync. Exiting.');
  process.exit(0);
}

// Build map: email → [resend email objects]
const bounceMap = new Map();
for (const e of bounced) {
  const to = Array.isArray(e.to) ? e.to[0] : e.to;
  if (!to) continue;
  const key = to.toLowerCase().trim();
  if (!bounceMap.has(key)) bounceMap.set(key, []);
  bounceMap.get(key).push(e);
}
console.log(`Unique bounced addresses: ${bounceMap.size}`);
for (const [email] of bounceMap) console.log(`  - ${email}`);

// ── 2. Connect to DB and process each bounced address ───────────────────────
const conn = await mysql.createConnection(DB_URL);
console.log('\nConnected to database.');

let queueUpdated = 0;
let activitiesInserted = 0;
let leadsNotFound = 0;

for (const [email, events] of bounceMap) {
  // Find the lead
  const [leadRows] = await conn.execute(
    'SELECT id, email FROM leads WHERE LOWER(email) = ? LIMIT 1',
    [email]
  );
  if (!leadRows.length) {
    console.log(`  No lead found for ${email}`);
    leadsNotFound++;
    continue;
  }
  const lead = leadRows[0];

  // Mark all future scheduled/pending queue rows for this lead as failed
  const [updateResult] = await conn.execute(
    `UPDATE leadSequenceQueue
     SET status = 'failed',
         failedAt = NOW(),
         failureReason = 'hard_bounce'
     WHERE leadId = ?
       AND status IN ('scheduled', 'pending')`,
    [lead.id]
  );
  queueUpdated += updateResult.affectedRows;

  // Write bounce activity row (idempotent via externalId)
  for (const ev of events) {
    const externalId = `resend_bounce_${ev.id}`;
    try {
      await conn.execute(
        `INSERT INTO leadActivities
           (leadId, type, direction, subject, body, sentBy, status, externalId, createdAt)
         VALUES (?, 'email', 'outbound', ?, ?, 'resend_bounce_sync', 'bounced', ?, NOW())`,
        [
          lead.id,
          ev.subject?.slice(0, 255) ?? null,
          `Hard bounce. Resend message ID: ${ev.id}. Sent: ${ev.created_at}`,
          externalId,
        ]
      );
      activitiesInserted++;
      console.log(`  ✓ ${email} (lead ${lead.id}): bounce recorded, queue rows blocked=${updateResult.affectedRows}`);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        console.log(`  ↩ ${email}: bounce already recorded (duplicate)`);
      } else {
        console.error(`  Activity insert error for ${email}:`, e.message);
      }
    }
  }
}

await conn.end();

console.log(`
=== Bounce Sync Complete ===
Bounced addresses processed : ${bounceMap.size}
Leads not found             : ${leadsNotFound}
Future queue rows blocked   : ${queueUpdated}
Bounce activity rows added  : ${activitiesInserted}
`);
