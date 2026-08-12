export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // TMA custom integrations
  tmaStripeSecretKey: process.env.TMA_STRIPE_SECRET_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
  googleSheetsId: process.env.GOOGLE_SHEETS_ID ?? "",
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
  leadNotificationEmail: process.env.LEAD_NOTIFICATION_EMAIL ?? "",
  // n8n automation webhook — set N8N_WEBHOOK_URL in Secrets once you create the n8n workflow
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? "",
  // Attendance kiosk password gate
  attendanceKioskPassword: process.env.ATTENDANCE_KIOSK_PASSWORD ?? "",
  // Meta / Facebook integrations — set these in Secrets
  facebookPixelId: process.env.FACEBOOK_PIXEL_ID ?? "",
  facebookCapiToken: process.env.FACEBOOK_CAPI_TOKEN ?? "",
  facebookMarketingApiToken: process.env.FACEBOOK_MARKETING_API_TOKEN ?? "",
  facebookAdAccountId: process.env.FACEBOOK_AD_ACCOUNT_ID ?? "",
  // 2026-06-06: Gmail reply poller shared secret. Required for /api/trpc/inbound.emailReply.
  // The poller (scripts/gmail_reply_poller.ts) sends this in the input payload.
  gmailPollerSharedSecret: process.env.GMAIL_POLLER_SHARED_SECRET ?? "",
  // 2026-06-09: Resend webhook signing secret. Set in Resend dashboard → Webhooks → Signing secret.
  // Used to verify POST /api/resend-webhook requests are genuinely from Resend.
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "",
  // 2026-06-10: Voice agent (Retell) tool auth + Telegram staff notifications.
  // VOICE_AGENT_SHARED_SECRET gates /api/voice/* (Retell sends it as x-voice-secret).
  // TMA_TELEGRAM_* power staff alerts (new leads, call hand-offs, trial reminders).
  voiceAgentSharedSecret: process.env.VOICE_AGENT_SHARED_SECRET ?? "",
  telegramBotToken: process.env.TMA_TELEGRAM_BOT_TOKEN ?? "",
  telegramStaffChatId: process.env.TMA_TELEGRAM_STAFF_CHAT_ID ?? "",
  // 2026-08-11: recurring tuition (Stripe Subscriptions). See
  // docs/STRIPE_TUITION_SETUP.md. tmaStripeWebhookSecret verifies POST
  // /api/stripe/webhook (Stripe Dashboard → Developers → Webhooks → signing
  // secret). The two price ids are the afterschool monthly recurring Prices.
  // IMPORTANT: enrollment creates a subscription ONLY when the matching price id
  // is set, so an unconfigured deploy behaves exactly as before (no subscription).
  tmaStripeWebhookSecret: process.env.TMA_STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceAfterschool45: process.env.STRIPE_PRICE_AFTERSCHOOL_4_5 ?? "",
  stripePriceAfterschool23: process.env.STRIPE_PRICE_AFTERSCHOOL_2_3 ?? "",
  // 2026-08-11: server-side admin auth (Phase 1). adminPassword is verified on
  // the server now (not just in the client bundle); falls back to the historical
  // shared password so nothing breaks before ADMIN_PASSWORD is set in Secrets.
  // adminAuthEnforce is the kill-switch: gated admin procedures only REQUIRE the
  // admin session when this is "true", so deploying the gate changes nothing
  // until it is enabled + verified on preview. See docs/ADMIN_AUTH_PLAN.md.
  adminPassword: process.env.ADMIN_PASSWORD ?? "Keep9oing!",
  adminAuthEnforce: process.env.ADMIN_AUTH_ENFORCE === "true",
  // 2026-08-11: read-only AI assistant. The @ai-sdk/openai provider reads
  // OPENAI_API_KEY from process.env directly; we surface it here only for a
  // helpful "not configured" error. Model is overridable. See docs/AI_ASSISTANT_SPEC.md.
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  assistantModel: process.env.OPENAI_ASSISTANT_MODEL ?? "gpt-4o-mini",
};
