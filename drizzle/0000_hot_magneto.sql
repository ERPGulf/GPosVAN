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
