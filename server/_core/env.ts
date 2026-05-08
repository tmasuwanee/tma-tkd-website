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
};
