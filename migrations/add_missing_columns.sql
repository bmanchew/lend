
-- Add missing columns to contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS borrower_email TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS borrower_phone TEXT;
