CREATE TABLE `Shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_local_id` text,
	`user_id` text,
	`opening_cash` real DEFAULT 0,
	`shift_start_date` integer NOT NULL,
	`closing_shift_date` integer,
	`closing_cash` real DEFAULT 0,
	`closing_expected_cash` real DEFAULT 0,
	`closing_expected_card` real DEFAULT 0,
	`closing_card` real DEFAULT 0,
	`claimed_loyality_amount` real DEFAULT 0,
	`is_opening_synced` integer DEFAULT false,
	`is_closing_synced` integer DEFAULT false,
	`shift_opening_id` text,
	`branch` text,
	`is_shift_closed` integer DEFAULT false,
	`sales_return` real DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `ShiftsIdSequence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`sequence` integer DEFAULT 0
);
