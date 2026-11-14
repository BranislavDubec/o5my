CREATE TABLE `poll_votes_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `poll_id` integer NOT NULL,
  `option_id` integer NOT NULL,
  `user_id` integer NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`option_id`) REFERENCES `poll_options`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `poll_votes_new` (`id`, `poll_id`, `option_id`, `user_id`, `created_at`)
SELECT `id`, `poll_id`, `option_id`, `user_id`, `created_at` FROM `poll_votes`;
--> statement-breakpoint
DROP TABLE `poll_votes`;
--> statement-breakpoint
ALTER TABLE `poll_votes_new` RENAME TO `poll_votes`;
