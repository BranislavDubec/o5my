ALTER TABLE `users` ADD `kit_number` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_kit_number_unique` ON `users` (`kit_number`);