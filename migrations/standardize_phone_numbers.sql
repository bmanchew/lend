
-- Standardize phone numbers in users table
UPDATE users 
SET phone_number = CASE
  WHEN phone_number IS NULL THEN NULL
  WHEN phone_number ~ '^\+1[0-9]{10}$' THEN phone_number
  ELSE '+1' || regexp_replace(phone_number, '[^0-9]', '', 'g')
END
WHERE phone_number IS NOT NULL;

-- Standardize phone numbers in contracts table
UPDATE contracts
SET borrower_phone = CASE
  WHEN borrower_phone IS NULL THEN NULL
  WHEN borrower_phone ~ '^\+1[0-9]{10}$' THEN borrower_phone
  ELSE '+1' || regexp_replace(borrower_phone, '[^0-9]', '', 'g')
END
WHERE borrower_phone IS NOT NULL;
