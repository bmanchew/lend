
-- Allow null session_id in webhook_events
ALTER TABLE webhook_events ALTER COLUMN session_id DROP NOT NULL;
