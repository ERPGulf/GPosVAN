CREATE TABLE `InvoiceIdSequence` (
	`id` integer PRIMARY KEY NOT NULL,
	`sequence` integer DEFAULT 0
);
--> statement-breakpoint
INSERT INTO `InvoiceIdSequence` (`id`, `sequence`) VALUES (1, 0);
