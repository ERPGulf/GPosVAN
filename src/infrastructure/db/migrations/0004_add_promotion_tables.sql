CREATE TABLE `Promotions` (
	`PromotionId` text PRIMARY KEY NOT NULL,
	`Disabled` integer DEFAULT false,
	`ValidFrom` integer NOT NULL,
	`ValidUpto` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `PromotionItems` (
	`ItemId` text PRIMARY KEY NOT NULL,
	`ItemCode` text NOT NULL,
	`ItemName` text,
	`DiscountType` text,
	`MinQty` integer DEFAULT 0,
	`MaxQty` integer DEFAULT 0,
	`DiscountPercentage` real DEFAULT 0,
	`DiscountPrice` real DEFAULT 0,
	`Rate` real DEFAULT 0,
	`UomId` text,
	`uom` text,
	`CreateOn` integer,
	`UpdatedOn` integer,
	`PromotionId` text,
	FOREIGN KEY (`PromotionId`) REFERENCES `Promotions`(`PromotionId`) ON UPDATE no action ON DELETE no action
);
