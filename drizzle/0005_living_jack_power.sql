ALTER TABLE `campRegistrations` ADD `isDeleted` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campRegistrations` ADD `deletedAt` timestamp;