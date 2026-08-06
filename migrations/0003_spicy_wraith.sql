ALTER TABLE `events` ADD `opponent_id` integer REFERENCES opponents(id);--> statement-breakpoint
ALTER TABLE `opponents` ADD `description` text;