
-- Drop the column if it exists to avoid errors
ALTER TABLE webhook_events DROP COLUMN IF EXISTS error;

-- Add error column
ALTER TABLE webhook_events ADD COLUMN error TEXT;
