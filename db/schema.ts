import { pgTable, text, timestamp, integer, decimal, boolean, serial, varchar, json } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';

export const insertUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  email: z.string().email(),
  role: z.enum(['admin', 'customer', 'merchant']),
  name: z.string().optional(),
  phoneNumber: z.string().optional(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 255 }).notNull(),
  password: varchar('password', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  plaidAccessToken: varchar('plaid_access_token', { length: 255 }),
  kycStatus: varchar('kyc_status', { length: 50 }),
  phoneNumber: varchar('phone_number', { length: 12 }).unique(),
  lastOtpCode: varchar('last_otp_code', { length: 6 }),
  otpExpiry: timestamp('otp_expiry'),
  faceIdHash: text('face_id_hash')
});

export const merchants = pgTable('merchants', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  ein: varchar('ein', { length: 255 }),
  address: varchar('address', { length: 255 }),
  website: varchar('website', { length: 255 }),
  status: varchar('status', { length: 50 }).default('active'),
  reserveBalance: decimal('reserve_balance', { precision: 10, scale: 2 }).default('0'),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow()
});

export const programs = pgTable('programs', {
  id: serial('id').primaryKey(),
  merchantId: integer('merchant_id').references(() => merchants.id),
  name: varchar('name', { length: 255 }).notNull(),
  term: integer('term').notNull(),
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }).notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow()
});

export const contracts = pgTable('contracts', {
  id: serial('id').primaryKey(),
  merchantId: integer('merchant_id').notNull().references(() => merchants.id),
  customerId: integer('customer_id').notNull().references(() => users.id),
  contractNumber: text('contract_number').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  term: integer('term').notNull(),
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }).notNull(),
  downPayment: decimal('down_payment', { precision: 10, scale: 2 }),
  monthlyPayment: decimal('monthly_payment', { precision: 10, scale: 2 }),
  totalInterest: decimal('total_interest', { precision: 10, scale: 2 }),
  status: varchar('status', { length: 50, enum: ['pending', 'active', 'completed', 'cancelled', 'defaulted'] })
    .notNull()
    .default('pending'),
  notes: text('notes'),
  underwritingStatus: varchar('underwriting_status', { length: 50, enum: ['pending', 'approved', 'rejected', 'review'] })
    .default('pending'),
  borrowerEmail: text('borrower_email'),
  borrowerPhone: text('borrower_phone'),
  lastPaymentId: text('last_payment_id'),
  lastPaymentStatus: varchar('last_payment_status', { length: 50, enum: ['success', 'failed', 'pending'] }),
  createdAt: timestamp('created_at').defaultNow(),
  active: boolean('active').default(true)
});

export const contractRelations = relations(contracts, ({ one }) => ({
  merchant: one(merchants, {
    fields: [contracts.merchantId],
    references: [merchants.id],
  }),
  customer: one(users, {
    fields: [contracts.customerId],
    references: [users.id],
  }),
}));

export const verificationSessions = pgTable('verification_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }),
  features: text('features'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const webhookEvents = pgTable('webhook_events', {
  id: serial('id').primaryKey(),
  eventType: varchar('event_type', { length: 255 }).notNull(),
  sessionId: varchar('session_id', { length: 255 }).notNull().default('app'),
  status: varchar('status', { length: 50 }).default('pending'),
  payload: json('payload'),
  error: text('error'),
  retryCount: integer('retry_count').default(0),
  nextRetryAt: timestamp('next_retry_at'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow()
});

export const rewardsBalances = pgTable('rewards_balances', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  balance: integer('balance').notNull().default(0),
  lifetimeEarned: integer('lifetime_earned').notNull().default(0),
  lastUpdated: timestamp('last_updated').defaultNow(),
  createdAt: timestamp('created_at').defaultNow()
});

export const rewardsTransactions = pgTable('rewards_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  contractId: integer('contract_id').references(() => contracts.id),
  amount: integer('amount').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  description: text('description').notNull(),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow()
});

export const rewardsRedemptions = pgTable('rewards_redemptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  transactionId: integer('transaction_id').references(() => rewardsTransactions.id),
  productName: varchar('product_name', { length: 255 }).notNull(),
  coinsSpent: integer('coins_spent').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const rewardsBalancesRelations = relations(rewardsBalances, ({ one }) => ({
  user: one(users, {
    fields: [rewardsBalances.userId],
    references: [users.id],
  })
}));

export const rewardsTransactionsRelations = relations(rewardsTransactions, ({ one }) => ({
  user: one(users, {
    fields: [rewardsTransactions.userId],
    references: [users.id],
  }),
  contract: one(contracts, {
    fields: [rewardsTransactions.contractId],
    references: [contracts.id],
  })
}));

export const rewardsRedemptionsRelations = relations(rewardsRedemptions, ({ one }) => ({
  user: one(users, {
    fields: [rewardsRedemptions.userId],
    references: [users.id],
  }),
  transaction: one(rewardsTransactions, {
    fields: [rewardsRedemptions.transactionId],
    references: [rewardsTransactions.id],
  })
}));

export type SelectUser = typeof users.$inferSelect;
export type SelectMerchant = typeof merchants.$inferSelect;
export type SelectContract = typeof contracts.$inferSelect;
export type SelectProgram = typeof programs.$inferSelect;
export type SelectVerificationSession = typeof verificationSessions.$inferSelect;
export type SelectWebhookEvent = typeof webhookEvents.$inferSelect;
export type SelectRewardsBalance = typeof rewardsBalances.$inferSelect;
export type SelectRewardsTransaction = typeof rewardsTransactions.$inferSelect;
export type SelectRewardsRedemption = typeof rewardsRedemptions.$inferSelect;