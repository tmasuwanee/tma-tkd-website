ALTER TABLE `campRegistrations` ADD `addExtendedCare` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campRegistrations` DROP COLUMN `addEarlyPickup`;--> statement-breakpoint
ALTER TABLE `campRegistrations` DROP COLUMN `addLatePickup`;