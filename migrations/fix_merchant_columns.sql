
-- Add active column to programs if not exists
ALTER TABLE programs ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Add notes column to contracts if not exists
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS notes TEXT;
