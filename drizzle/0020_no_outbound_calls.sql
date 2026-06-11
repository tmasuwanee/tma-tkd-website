-- 2026-06-11: outbound voice opt-out flag.
-- Set when a caller on an OUTBOUND agent call asks for a human. The outbound
-- voice scheduler skips these leads; inbound/email/SMS are unaffected.

ALTER TABLE `leads` ADD `noOutboundCalls` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `leads` ADD `noOutboundCallsAt` timestamp;
