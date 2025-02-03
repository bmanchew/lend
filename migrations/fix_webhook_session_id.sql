
ALTER TABLE webhook_events 
ALTER COLUMN session_id SET DEFAULT 'app',
ALTER COLUMN session_id SET NOT NULL;

UPDATE webhook_events 
SET session_id = 'app' 
WHERE session_id IS NULL;
