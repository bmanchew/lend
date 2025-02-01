
-- Add active column if not exists
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
