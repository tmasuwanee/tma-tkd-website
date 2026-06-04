ALTER TABLE `studioAssets` ADD `tags` text;--> statement-breakpoint
UPDATE `studioAssets` SET `tags` = JSON_ARRAY(`vertical`) WHERE `tags` IS NULL;
