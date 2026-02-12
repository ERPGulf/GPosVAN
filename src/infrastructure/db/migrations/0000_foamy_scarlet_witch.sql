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
CREATE TABLE `Customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`phone_no` text,
	`is_default` integer,
	`is_disabled` integer,
	`vat_number` text,
	`address_line_1` text,
	`address_line_2` text,
	`building_no` text,
	`po_box_no` text,
	`city` text,
	`company` text,
	`customer_group` text,
	`customer_registration_no` text,
	`customer_registration_type` text,
	`sync_status` text DEFAULT 'synced'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Customers_phone_no_unique` ON `Customers` (`phone_no`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `Users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text,
	`password` text,
	`email` text,
	`address` text,
	`shop_name` text,
	`invoice_template` text,
	`is_admin` integer,
	`pos_profile` text,
	`cashier_name` text
);
