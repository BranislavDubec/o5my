INSERT INTO team_responsibilities (section, title, kind, status, owner, notes, quantity, usable_quantity, location, sort_order, created_at, updated_at)
SELECT 'Administratíva', 'Klubová administratíva', 'responsibility', 'ok', 'Krši, Lukáš', '• komunikácia s Poliakom
• prihlášky a registrácie
• prestupy', NULL, NULL, NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_responsibilities_seeded_v1');
--> statement-breakpoint
INSERT INTO team_responsibilities (section, title, kind, status, owner, notes, quantity, usable_quantity, location, sort_order, created_at, updated_at)
SELECT 'Finance', 'Kontrola platieb', 'responsibility', 'ok', 'Vedúci', '• platby vykonáva vedúci
• kontrola, kto zaplatil a kto nezaplatil
• výber peňazí za tréning mimo tímu', NULL, NULL, NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_responsibilities_seeded_v1');
--> statement-breakpoint
INSERT INTO team_responsibilities (section, title, kind, status, owner, notes, quantity, usable_quantity, location, sort_order, created_at, updated_at)
SELECT 'Výbava', 'Taška a náhradná výbava', 'inventory', 'ok', 'Braňo', 'Obsah tašky:
• 2 dresy
• žlté rozlišky
• pár červených a 1 zelená rozliška
• coach tabuľa
• pumpa
• pokladnička (~200 Kč)
• brankárske rukavice

U Braňa:
• staré dresy Mara a Varič
• brankárske veci Horníka
• ďalšie kusy oblečenia', 1, 1, NULL, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_responsibilities_seeded_v1');
--> statement-breakpoint
INSERT INTO team_responsibilities (section, title, kind, status, owner, notes, quantity, usable_quantity, location, sort_order, created_at, updated_at)
SELECT 'Výbava', 'Lekárnička', 'inventory', 'attention', 'Braňo', '• mraziace spreje
• dezinfekcia a peroxid
• obväzy
• náplasti a ošetrenie odrenín
• lepiaca páska
• textilná páska — treba doplniť novú
• rukavice', 1, 1, NULL, 3, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_responsibilities_seeded_v1');
--> statement-breakpoint
INSERT INTO team_responsibilities (section, title, kind, status, owner, notes, quantity, usable_quantity, location, sort_order, created_at, updated_at)
SELECT 'Výbava', 'Balóny', 'inventory', 'attention', 'Braňo', '• približne 4 kusy
• z toho 2 použiteľné
• 1 balón od Slavoja', 4, 2, NULL, 4, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_responsibilities_seeded_v1');
--> statement-breakpoint
INSERT INTO team_responsibilities (section, title, kind, status, owner, notes, quantity, usable_quantity, location, sort_order, created_at, updated_at)
SELECT 'Zápasy', 'Organizácia zápasov', 'responsibility', 'ok', NULL, '• anketa účasti na zápas
• zápis v IS FAČR', NULL, NULL, NULL, 5, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_responsibilities_seeded_v1');
--> statement-breakpoint
INSERT INTO team_responsibilities (section, title, kind, status, owner, notes, quantity, usable_quantity, location, sort_order, created_at, updated_at)
SELECT 'Zápasy', 'Zapisovač gólov', 'responsibility', 'ok', 'Braňo', NULL, NULL, NULL, NULL, 6, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_responsibilities_seeded_v1');
--> statement-breakpoint
INSERT INTO team_responsibilities (section, title, kind, status, owner, notes, quantity, usable_quantity, location, sort_order, created_at, updated_at)
SELECT 'Zápasy', 'Zapisovač asistencií', 'responsibility', 'ok', 'Krši', NULL, NULL, NULL, NULL, 7, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_responsibilities_seeded_v1');
--> statement-breakpoint
INSERT INTO app_settings (key, value)
SELECT 'team_responsibilities_seeded_v1', '1'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_responsibilities_seeded_v1');

--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Náhradné dresy', 'ok', 2, 2, NULL, NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Žlté rozlišky', 'ok', NULL, NULL, NULL, NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Červené rozlišky', 'ok', 2, 2, NULL, 'Pár kusov', 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Zelená rozliška', 'ok', 1, 1, NULL, NULL, 3, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Coach tabuľa', 'ok', 1, 1, NULL, NULL, 4, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Pumpa', 'ok', 1, 1, NULL, NULL, 5, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Brankárske rukavice', 'ok', 1, 1, NULL, NULL, 6, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Staré dresy Mara a Varič', 'ok', 2, 2, 'u Braňa', NULL, 7, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Brankárske veci Horníka', 'ok', NULL, NULL, 'u Braňa', NULL, 8, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Ďalšie kusy oblečenia', 'ok', NULL, NULL, 'u Braňa', NULL, 9, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Taška a náhradná výbava' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Mraziace spreje', 'ok', NULL, NULL, NULL, NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Lekárnička' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Dezinfekcia a peroxid', 'ok', NULL, NULL, NULL, NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Lekárnička' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Obväzy', 'ok', NULL, NULL, NULL, NULL, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Lekárnička' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Náplasti na odreniny', 'ok', NULL, NULL, NULL, NULL, 3, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Lekárnička' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Lepiaca páska', 'ok', NULL, NULL, NULL, NULL, 4, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Lekárnička' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Textilná páska', 'attention', NULL, NULL, NULL, 'Treba doplniť novú', 5, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Lekárnička' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Rukavice', 'ok', NULL, NULL, NULL, NULL, 6, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Lekárnička' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Tímové balóny', 'attention', 4, 2, NULL, NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Balóny' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO team_inventory_items (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
SELECT r.id, 'Balón od Slavoja', 'ok', 1, 1, NULL, NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM team_responsibilities r
WHERE r.title = 'Balóny' AND r.kind = 'inventory'
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');
--> statement-breakpoint
INSERT INTO app_settings (key, value)
SELECT 'team_inventory_items_seeded_v1', '1'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'team_inventory_items_seeded_v1');

--> statement-breakpoint
INSERT INTO cash_transactions (type, amount, description, created_by, created_at)
SELECT 'income', 200, 'Počiatočný stav pokladničky (odhad)', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'cashbox_initialized_v1')
  AND NOT EXISTS (SELECT 1 FROM cash_transactions);
--> statement-breakpoint
DELETE FROM team_inventory_items
WHERE name = 'Pokladnička'
  AND responsibility_id IN (
    SELECT id FROM team_responsibilities
    WHERE title = 'Taška a náhradná výbava'
  )
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'cashbox_initialized_v1');
--> statement-breakpoint
INSERT INTO app_settings (key, value)
SELECT 'cashbox_initialized_v1', '1'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'cashbox_initialized_v1');

--> statement-breakpoint
-- Payment IDs are stable numeric values and therefore make safe, unique
-- variable symbols. Normalize older name-based symbols once here (previously
-- this ran on every startup in storage.ts).
UPDATE payments
SET variable_symbol = CAST(id AS TEXT)
WHERE variable_symbol IS NULL
   OR TRIM(variable_symbol) = ''
   OR variable_symbol GLOB '*[^0-9]*';
