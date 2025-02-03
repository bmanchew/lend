
-- Allow null session_id in webhook_events
ALTER TABLE webhook_events ALTER COLUMN session_id DROP NOT NULL;

-- Add session_id default if missing
ALTER TABLE webhook_events 
  ALTER COLUMN session_id SET DEFAULT 'app';

-- Update existing null values
UPDATE webhook_events 
SET session_id = 'app' 
WHERE session_id IS NULL;
