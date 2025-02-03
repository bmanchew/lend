
-- Add error column to webhook_events if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name='webhook_events' AND column_name='error') THEN
        ALTER TABLE webhook_events ADD COLUMN error TEXT;
    END IF;
END $$;
