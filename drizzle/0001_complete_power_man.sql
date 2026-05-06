CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentName` varchar(255) NOT NULL,
	`kidName` varchar(255) NOT NULL,
	`kidAge` varchar(50) NOT NULL,
	`programInterest` varchar(255) NOT NULL,
	`motivation` varchar(255),
	`email` varchar(320) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`additionalNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
