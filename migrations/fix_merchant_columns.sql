
-- Add active column to merchants if not exists
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS reserve_balance DECIMAL(10,2) DEFAULT 0;

-- Add total_interest column to contracts if not exists
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS total_interest DECIMAL(10,2);
