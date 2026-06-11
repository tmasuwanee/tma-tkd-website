/**
 * Telegram staff notifications for TMA.
 *
 * Sends to the TMA Staff chat (or group) so the team gets pinged about
 * new leads, voice-agent call hand-offs, trial-day reminders, and
 * did-they-show prompts. Mirrors the Slack integration pattern.
 *
 * Env (set in production Secrets):
 *   TMA_TELEGRAM_BOT_TOKEN     — the @TMAStaffBot token
 *   TMA_TELEGRAM_STAFF_CHAT_ID — the chat id to send to (Arfa's DM or a group)
 *
 * Non-fatal by design: a Telegram outage must never break a booking or a
 * lead submission. Failures are logged, not thrown.
 */

export async function sendTelegramMessage(text: string): Promise<{ ok: boolean }> {
  const token = process.env.TMA_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TMA_TELEGRAM_STAFF_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] TMA_TELEGRAM_BOT_TOKEN or TMA_TELEGRAM_STAFF_CHAT_ID not set; skipping send");
    return { ok: false };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[telegram] sendMessage responded ${res.status}: ${await res.text().catch(() => "")}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[telegram] send failed (non-fatal):", err);
    return { ok: false };
  }
}
