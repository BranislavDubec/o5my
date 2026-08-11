-- Schema changes through 0015 were authored manually. This no-op migration
-- records the generated current-schema snapshot without applying them twice.
UPDATE app_settings SET value = value WHERE 0;
