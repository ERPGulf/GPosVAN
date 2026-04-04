CREATE TABLE `Invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text,
	`invoice_no` text,
	`customer_id` text,
	`customer_purchase_order` integer DEFAULT 0,
	`discount` real DEFAULT 0,
	`previous_invoice_hash` text,
	`is_synced` integer DEFAULT false,
	`date_time` integer NOT NULL,
	`sync_date_time` integer,
	`pos_profile` text,
	`loyality_customer_name` text,
	`loyality_customer_mobile` text,
	`shift_id` text,
	`user_id` text,
	`is_error` integer DEFAULT false,
	`is_error_synced` integer DEFAULT false,
	`error_sync_time` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `InvoiceItems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_code` text,
	`item_name` text,
	`quantity` real DEFAULT 0,
	`rate` real DEFAULT 0,
	`tax_percentage` real DEFAULT 0,
	`unit_of_measure` text,
	`invoice_entity_id` text,
	`discount_type` text,
	`min_qty` integer DEFAULT 0,
	`max_qty` integer DEFAULT 0,
	`discount_value` real DEFAULT 0,
	FOREIGN KEY (`invoice_entity_id`) REFERENCES `Invoice`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `InvoicePayments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode_of_payment` text,
	`amount` real DEFAULT 0,
	`invoice_entity_id` text,
	`user_id` text,
	`transaction_id` text,
	`create_at` integer,
	FOREIGN KEY (`invoice_entity_id`) REFERENCES `Invoice`(`id`) ON UPDATE no action ON DELETE no action
);
