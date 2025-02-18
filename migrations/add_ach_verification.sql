-- Add ACH verification columns to contracts table
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS plaid_access_token TEXT,
ADD COLUMN IF NOT EXISTS plaid_account_id TEXT,
ADD COLUMN IF NOT EXISTS ach_verification_status TEXT DEFAULT 'pending';
