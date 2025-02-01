
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS down_payment DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS borrower_email TEXT,
ADD COLUMN IF NOT EXISTS borrower_phone TEXT;

UPDATE contracts 
SET down_payment = amount * 0.05
WHERE down_payment IS NULL;

ALTER TABLE contracts
ALTER COLUMN down_payment SET NOT NULL,
ALTER COLUMN borrower_email SET NOT NULL DEFAULT '',
ALTER COLUMN borrower_phone SET NOT NULL DEFAULT '';
