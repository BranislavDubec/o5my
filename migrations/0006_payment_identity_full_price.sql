ALTER TABLE payments ADD COLUMN full_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN identity TEXT;
UPDATE payments SET full_price = amount WHERE full_price = 0;
