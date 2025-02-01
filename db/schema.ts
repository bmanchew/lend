import { pgTable, serial, varchar, timestamp, text, boolean, integer, decimal, real } from 'drizzle-orm/pg-core';

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
  phoneNumber: varchar('phone_number', { length: 50 }),
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
  merchantId: integer('merchant_id').references(() => merchants.id),
  customerId: integer('customer_id').references(() => users.id),
  contractNumber: varchar('contract_number', { length: 255 }),
  amount: decimal('amount', { precision: 10, scale: 2 }),
  term: integer('term'),
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }),
  downPayment: decimal('down_payment', { precision: 10, scale: 2 }),
  monthlyPayment: decimal('monthly_payment', { precision: 10, scale: 2 }),
  totalInterest: decimal('total_interest', { precision: 10, scale: 2 }),
  status: varchar('status', { length: 50 }),
  notes: text('notes'),
  underwritingStatus: varchar('underwriting_status', { length: 50 }),
  borrowerEmail: varchar('borrower_email', { length: 255 }),
  borrowerPhone: varchar('borrower_phone', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow()
});

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
  payload: text('payload'),
  status: varchar('status', { length: 50 }),
  error: text('error'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow()
});

export type SelectUser = typeof users.$inferSelect;
export type SelectMerchant = typeof merchants.$inferSelect;
export type SelectContract = typeof contracts.$inferSelect;
export type SelectProgram = typeof programs.$inferSelect;
export type SelectVerificationSession = typeof verificationSessions.$inferSelect;
export type SelectWebhookEvent = typeof webhookEvents.$inferSelect;