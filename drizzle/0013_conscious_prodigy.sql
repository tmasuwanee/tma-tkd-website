CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`checkedInAt` timestamp NOT NULL DEFAULT (now()),
	`classDate` varchar(20) NOT NULL,
	`loggedBy` enum('kiosk','staff') NOT NULL DEFAULT 'kiosk',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `leads` MODIFY COLUMN `pipelineStage` enum('new_lead','contacted','trial_scheduled','trial_paid','trial_attended','enrolled','no_show','no_show_final','lost') NOT NULL DEFAULT 'new_lead';--> statement-breakpoint
ALTER TABLE `students` ADD `lastPromotedAt` timestamp;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;