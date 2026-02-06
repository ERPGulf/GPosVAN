CREATE TABLE `Barcode` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_code` text,
	`uom` text,
	`product_id` integer,
	FOREIGN KEY (`product_id`) REFERENCES `Product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `Category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`is_disabled` integer
);
--> statement-breakpoint
CREATE TABLE `offline_users` (
	`name` text PRIMARY KEY NOT NULL,
	`offline_username` text,
	`shop_name` text,
	`password` text,
	`custom_cashier_name` text,
	`actual_user_name` text,
	`branch_address` text,
	`print_template` text,
	`custom_print_format` text,
	`custom_is_admin` integer,
	`pos_profiles` text
);
--> statement-breakpoint
CREATE TABLE `Product` (
	`id` integer PRIMARY KEY NOT NULL,
	`item_id` text,
	`name` text,
	`localized_english_name` text,
	`item_code` text,
	`price` real,
	`tax_percentage` real,
	`is_disabled` integer,
	`category_id` text,
	FOREIGN KEY (`category_id`) REFERENCES `Category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `UnitOfMeasure` (
	`id` text PRIMARY KEY NOT NULL,
	`uom` text,
	`conversion_factor` real,
	`amount` real,
	`is_price_editable` integer,
	`is_quantity_editable` integer,
	`last_updated` integer,
	`product_id` integer,
	FOREIGN KEY (`product_id`) REFERENCES `Product`(`id`) ON UPDATE no action ON DELETE no action
);
