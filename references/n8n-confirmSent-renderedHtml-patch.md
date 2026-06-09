# n8n Dispatcher: Add `renderedHtml` to confirmSent node

**Date:** 2026-06-09  
**Why:** The `confirmSent` tRPC procedure now accepts an optional `renderedHtml` field (max 2 MB). When provided, it is stored in `leadActivities.renderedHtml` as an immutable audit snapshot of exactly what was delivered to the parent. This is required for compliance and dispute resolution.

---

## What to change in n8n

In your Sequence Dispatcher workflow, find the **HTTP Request node** that calls:

```
POST https://tmatkd.com/api/trpc/sequence.confirmSent
```

### Current body (example)

```json
{
  "json": {
    "queueId": {{ $json.queueId }},
    "status": "sent",
    "providerMessageId": {{ $json.resendMessageId }},
    "providerStatus": 200
  }
}
```

### Updated body — add `renderedHtml`

The `bodyHtml` field is returned by the **fetchAndRender** node (the `sequence.fetchAndRender` call that happens before the Resend send). Pass it through:

```json
{
  "json": {
    "queueId": {{ $json.queueId }},
    "status": "sent",
    "providerMessageId": {{ $json.resendMessageId }},
    "providerStatus": 200,
    "renderedHtml": {{ $('FetchAndRender').item.json.bodyHtml }}
  }
}
```

> **Note:** Replace `$('FetchAndRender')` with the actual node name in your workflow that calls `sequence.fetchAndRender`. The field you want is `bodyHtml` from the response.

### For failed sends

```json
{
  "json": {
    "queueId": {{ $json.queueId }},
    "status": "failed",
    "failureReason": {{ $json.errorMessage }},
    "providerStatus": {{ $json.resendStatusCode }}
  }
}
```

No `renderedHtml` needed for failed sends (nothing was delivered).

---

## Also: pass `providerMessageId` from Resend

The Resend API returns a message ID in the response body:

```json
{ "id": "re_abc123..." }
```

Make sure your n8n workflow extracts this and passes it as `providerMessageId` in the `confirmSent` call. Without it, we cannot cross-reference bounce events from the Resend webhook with specific sends.

**Resend response node → confirmSent body:**

```json
{
  "json": {
    "queueId": {{ $json.queueId }},
    "status": "sent",
    "providerMessageId": {{ $('SendViaResend').item.json.id }},
    "providerStatus": 200,
    "renderedHtml": {{ $('FetchAndRender').item.json.bodyHtml }}
  }
}
```

---

## Verification

After updating the node, trigger a test send for one lead. Then check:

```sql
SELECT id, leadId, subject, status, 
       LEFT(renderedHtml, 100) as renderedHtmlPreview,
       body
FROM leadActivities
WHERE sentBy = 'n8n_dispatcher'
ORDER BY createdAt DESC
LIMIT 3;
```

You should see `renderedHtmlPreview` populated with the first 100 chars of the email HTML.
