
-- Add underwriting_status column to contracts if not exists
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS underwriting_status VARCHAR(50);

-- Add active column to programs if not exists
ALTER TABLE programs ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
