CREATE TABLE `studioAssets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vertical` enum('afterschool','tkd','kickboxing','bjj','summer_camp','spring_break_camp','camps_general','all_programs') NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`contentType` varchar(100) NOT NULL,
	`sizeBytes` int NOT NULL,
	`kind` enum('photo','video') NOT NULL,
	`caption` text,
	`minorReleaseOnFile` boolean NOT NULL DEFAULT false,
	`uploadedByEmail` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `studioAssets_id` PRIMARY KEY(`id`),
	CONSTRAINT `studioAssets_storageKey_unique` UNIQUE(`storageKey`)
);
--> statement-breakpoint
CREATE INDEX `studio_vertical_idx` ON `studioAssets` (`vertical`,`createdAt`);--> statement-breakpoint
CREATE INDEX `studio_kind_idx` ON `studioAssets` (`kind`);
