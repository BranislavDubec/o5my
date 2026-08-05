ALTER TABLE `users` ADD `terms_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `terms_accepted_at` text;