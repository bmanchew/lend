
CREATE TABLE IF NOT EXISTS programs (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER NOT NULL REFERENCES merchants(id),
    name TEXT NOT NULL,
    term INTEGER NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
