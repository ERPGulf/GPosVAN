CREATE TABLE `SalesReturn` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_number` text,
	`invoice_id` text,
	`customer_id` text,
	`pih` text,
	`qr_path` text,
	`xml_path` text,
	`reason` text,
	`created_on` integer NOT NULL,
	`is_synced` integer DEFAULT false,
	`synced_on` integer,
	`shift_id` text,
	`user_id` text,
	`pos_profile` text,
	`sales_return_id` text,
	`is_error` integer DEFAULT false,
	`error_message` text,
	`is_error_synced` integer DEFAULT false,
	`error_sync_time` integer
);
--> statement-breakpoint
CREATE TABLE `SalesReturnItems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_code` text,
	`item_name` text,
	`quantity` real DEFAULT 0,
	`rate` real DEFAULT 0,
	`tax_rate` real DEFAULT 0,
	`uom` text,
	`discount_type` text,
	`discount_value` real DEFAULT 0,
	`min_qty` integer DEFAULT 0,
	`max_qty` integer DEFAULT 0,
	`sales_return_id` text,
	FOREIGN KEY (`sales_return_id`) REFERENCES `SalesReturn`(`id`) ON UPDATE no action ON DELETE no action
);
