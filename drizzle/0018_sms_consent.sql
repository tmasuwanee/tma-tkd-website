-- 2026-06-08: CTIA-compliant SMS consent fields for Twilio toll-free
-- verification (Error 30446 fix).
-- Adds 4 fields to BOTH leads and campRegistrations so we can prove
-- explicit, time-stamped consent if Twilio audits.

ALTER TABLE `leads` ADD `smsConsent` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `smsConsentAt` timestamp;--> statement-breakpoint
ALTER TABLE `leads` ADD `smsConsentIp` varchar(64);--> statement-breakpoint
ALTER TABLE `leads` ADD `smsConsentText` text;--> statement-breakpoint

ALTER TABLE `campRegistrations` ADD `smsConsent` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campRegistrations` ADD `smsConsentAt` timestamp;--> statement-breakpoint
ALTER TABLE `campRegistrations` ADD `smsConsentIp` varchar(64);--> statement-breakpoint
ALTER TABLE `campRegistrations` ADD `smsConsentText` text;
