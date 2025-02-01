
-- Fix merchants table
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Fix contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS total_interest DECIMAL DEFAULT 0;
