CREATE TABLE `outfit_photos` (
	`participant_id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outfit_photos_storage_key_idx` ON `outfit_photos` (`storage_key`);--> statement-breakpoint
CREATE TABLE `outfit_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`opened_at` text,
	`closed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outfit_votes` (
	`voter_key` text PRIMARY KEY NOT NULL,
	`candidate_participant_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`candidate_participant_id`) REFERENCES `outfit_photos`(`participant_id`) ON UPDATE no action ON DELETE cascade
);
