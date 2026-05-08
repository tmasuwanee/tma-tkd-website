CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`program` varchar(255),
	`enrollmentDate` varchar(50),
	`beltRank` varchar(100),
	`status` varchar(50),
	`emergencyContact` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `pipelineStage` enum('new_lead','contacted','trial_scheduled','trial_paid','trial_attended','enrolled','lost') DEFAULT 'new_lead' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `trialPaidAmount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `leads` ADD `internalNotes` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `utmSource` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `utmMedium` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `utmCampaign` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `utmContent` varchar(255);