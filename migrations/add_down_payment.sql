
CREATE TABLE IF NOT EXISTS contracts_new AS SELECT * FROM contracts;

DROP TABLE contracts;

CREATE TABLE contracts (
    id serial PRIMARY KEY,
    merchant_id integer REFERENCES merchants(id) NOT NULL,
    customer_id integer REFERENCES users(id) NOT NULL,
    contract_number text UNIQUE NOT NULL,
    amount decimal(10,2) NOT NULL,
    term integer NOT NULL,
    interest_rate decimal(5,2) NOT NULL,
    down_payment decimal(10,2) NOT NULL,
    monthly_payment decimal(10,2) NOT NULL,
    total_interest decimal(10,2) NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    credit_score integer,
    plaid_payment_token text,
    signed_document_url text,
    created_at timestamp DEFAULT NOW(),
    sent_at timestamp,
    accepted_at timestamp,
    activated_at timestamp,
    completed_at timestamp,
    notes text,
    borrower_email text NOT NULL,
    borrower_phone text NOT NULL,
    underwriting_status text,
    underwriting_notes text
);

INSERT INTO contracts 
SELECT 
    id,
    merchant_id,
    customer_id,
    contract_number,
    amount,
    term,
    interest_rate,
    amount * 0.05 as down_payment,
    monthly_payment,
    total_interest,
    status,
    credit_score,
    plaid_payment_token,
    signed_document_url,
    created_at,
    sent_at,
    accepted_at,
    activated_at,
    completed_at,
    notes,
    borrower_email,
    borrower_phone,
    underwriting_status,
    underwriting_notes
FROM contracts_new;

DROP TABLE contracts_new;
