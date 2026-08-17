ALTER TABLE `bank_transactions` ADD `reconciled_user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD `reconciled_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD `reconciled_at` text;--> statement-breakpoint
UPDATE `bank_transactions`
SET `reconciled_user_id` = (
  SELECT `payments`.`user_id`
  FROM `payments`
  WHERE `payments`.`id` = `bank_transactions`.`matched_payment_id`
),
`reconciled_at` = `synced_at`,
`sync_error` = CASE
  WHEN `sync_error` = 'amount_mismatch' THEN NULL
  ELSE `sync_error`
END
WHERE `matched_payment_id` IS NOT NULL
  AND `reconciled_at` IS NULL;--> statement-breakpoint
UPDATE `payments`
SET `status` = 'paid'
WHERE `id` IN (
  SELECT `matched_payment_id`
  FROM `bank_transactions`
  WHERE `matched_payment_id` IS NOT NULL
);
