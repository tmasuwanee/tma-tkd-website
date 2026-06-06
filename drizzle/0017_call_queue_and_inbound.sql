-- 2026-06-06: Daily Call Queue + inbound activity tracking
-- Two new columns on leadActivities (direction, externalId) for tagging email
-- replies and other inbound events. New dailyCallQueue table feeds the
-- /admin "Today's Calls" tab.

ALTER TABLE `leadActivities` ADD `direction` enum('outbound','inbound') DEFAULT 'outbound' NOT NULL;--> statement-breakpoint
ALTER TABLE `leadActivities` ADD `externalId` varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_external_id_uniq` ON `leadActivities` (`externalId`);--> statement-breakpoint
CREATE INDEX `activity_lead_idx` ON `leadActivities` (`leadId`,`createdAt`);--> statement-breakpoint

CREATE TABLE `dailyCallQueue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`queueDate` varchar(10) NOT NULL,
	`score` int NOT NULL,
	`reason` text,
	`vertical` varchar(100),
	`status` enum('pending','answered','voicemail','no_answer','booked','not_interested','callback_later','skipped') DEFAULT 'pending' NOT NULL,
	`outcomeNotes` text,
	`calledAt` timestamp,
	`calledBy` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dailyCallQueue_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
ALTER TABLE `dailyCallQueue` ADD CONSTRAINT `dailyCallQueue_leadId_leads_id_fk` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX `call_queue_lead_date_uniq` ON `dailyCallQueue` (`leadId`,`queueDate`);--> statement-breakpoint
CREATE INDEX `call_queue_date_status_idx` ON `dailyCallQueue` (`queueDate`,`status`);
