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
--> statement-breakpoint
DROP TABLE `offline_users`;