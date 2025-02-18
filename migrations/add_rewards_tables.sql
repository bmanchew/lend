-- Create rewards_balances table
CREATE TABLE IF NOT EXISTS rewards_balances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    balance INTEGER NOT NULL DEFAULT 0,
    lifetime_earned INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create rewards_transactions table
CREATE TABLE IF NOT EXISTS rewards_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    contract_id INTEGER REFERENCES contracts(id),
    amount INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create rewards_redemptions table
CREATE TABLE IF NOT EXISTS rewards_redemptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    transaction_id INTEGER REFERENCES rewards_transactions(id),
    product_name VARCHAR(255) NOT NULL,
    coins_spent INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_rewards_balances_user_id ON rewards_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_transactions_user_id ON rewards_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_transactions_contract_id ON rewards_transactions(contract_id);
CREATE INDEX IF NOT EXISTS idx_rewards_redemptions_user_id ON rewards_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_redemptions_transaction_id ON rewards_redemptions(transaction_id);
