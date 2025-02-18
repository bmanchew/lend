-- Add payment tracking columns to contracts table
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS last_payment_id TEXT,
ADD COLUMN IF NOT EXISTS last_payment_status TEXT;
