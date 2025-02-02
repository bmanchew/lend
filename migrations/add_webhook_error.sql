
-- Add error column to webhook_events table
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS error TEXT;
-- Add error column as nullable
ALTER TABLE webhook_events ALTER COLUMN error DROP NOT NULL;
