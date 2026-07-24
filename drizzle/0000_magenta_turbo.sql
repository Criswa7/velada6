CREATE TABLE `event_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`lock_at` text NOT NULL,
	`manual_locked` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`alias` text NOT NULL,
	`alias_key` text NOT NULL,
	`edit_token_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_alias_key_idx` ON `participants` (`alias_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `participants_edit_token_hash_idx` ON `participants` (`edit_token_hash`);--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` text NOT NULL,
	`fight_id` integer NOT NULL,
	`winner_slug` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `predictions_participant_fight_idx` ON `predictions` (`participant_id`,`fight_id`);--> statement-breakpoint
CREATE TABLE `results` (
	`fight_id` integer PRIMARY KEY NOT NULL,
	`winner_slug` text NOT NULL,
	`updated_at` text NOT NULL
);
