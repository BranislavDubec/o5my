ALTER TABLE `wallet_transactions` ADD `created_by` integer REFERENCES users(id);
