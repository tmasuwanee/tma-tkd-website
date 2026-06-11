-- 2026-06-11: Automation controls / kill switch.
-- One row per pausable automation. /admin/controls toggles `enabled`;
-- n8n workflows + the website check it before running.

CREATE TABLE `automationControls` (
	`controlKey` varchar(64) NOT NULL,
	`label` varchar(255) NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedBy` varchar(255),
	CONSTRAINT `automationControls_controlKey` PRIMARY KEY(`controlKey`)
);
--> statement-breakpoint

-- Seed the known automations (all enabled by default)
INSERT INTO `automationControls` (`controlKey`, `label`, `enabled`) VALUES
  ('email_dispatcher',     'Email Sequence Dispatcher (sends nurture emails)', 1),
  ('fb_lead_sync',         'Facebook Lead Ads Sync', 1),
  ('noshow_recovery',      'Trial No-Show Recovery', 1),
  ('sequence_enrollment',  'New-Lead Sequence Enrollment', 1),
  ('voice_agent_inbound',  'Inbound Voice Agent (answers calls)', 1),
  ('voice_agent_outbound', 'Outbound Voice Agent (makes calls)', 1),
  ('telegram_reminders',   'Telegram Staff Reminders (8am / 8:30pm)', 1),
  ('daily_call_queue',     'Daily Call Queue Generator', 1);
