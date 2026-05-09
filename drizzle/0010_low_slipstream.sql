CREATE TABLE `facebook_ad_insights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`campaignId` varchar(64),
	`campaignName` varchar(255),
	`adsetId` varchar(64),
	`adsetName` varchar(255),
	`adId` varchar(64),
	`adName` varchar(255),
	`spend` varchar(32) DEFAULT '0',
	`impressions` int DEFAULT 0,
	`clicks` int DEFAULT 0,
	`leads` int DEFAULT 0,
	`costPerLead` varchar(32) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `facebook_ad_insights_id` PRIMARY KEY(`id`)
);
