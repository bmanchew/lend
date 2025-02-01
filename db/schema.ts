import { pgTable, text, serial, timestamp, integer, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "merchant", "customer"] }).notNull(),
  email: text("email").unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  plaidAccessToken: text("plaid_access_token"),
  kycStatus: text("kyc_status", { enum: ["pending", "verified", "failed"] }),
  phoneNumber: text("phone_number").unique(),
  lastOtpCode: text("last_otp_code"),
  otpExpiry: timestamp("otp_expiry"),
  lastOtpCode: text("last_otp_code"),
  otpExpiry: timestamp("otp_expiry"),
  faceIdHash: text("face_id_hash"),
});

export const verificationSessions = pgTable("verification_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionId: text("session_id").notNull(),
  status: text("status", {
    enum: ["initialized", "retrieved", "confirmed", "declined", "Approved", "Declined"]
  }).notNull(),
  features: text("features").notNull(),
  documentData: jsonb("document_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
  expiresAt: timestamp("expires_at"),
  retryCount: integer("retry_count").default(0),
  errorMessage: text("error_message"),
});

export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status", {
    enum: ["pending", "processed", "failed", "retrying"]
  }).notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  retryCount: integer("retry_count").default(0),
  nextRetryAt: timestamp("next_retry_at"),
  errorMessage: text("error_message"),
});

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  companyName: text("company_name").notNull(),
  status: text("status", { enum: ["active", "suspended"] }).default("active").notNull(),
  reserveBalance: decimal("reserve_balance", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  customerId: integer("customer_id").references(() => users.id).notNull(),
  contractNumber: text("contract_number").unique().notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  term: integer("term").notNull(), // in months
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  downPayment: decimal("down_payment", { precision: 10, scale: 2 }).notNull(),
  monthlyPayment: decimal("monthly_payment", { precision: 10, scale: 2 }).notNull(),
  totalInterest: decimal("total_interest", { precision: 10, scale: 2 }).notNull(),
  status: text("status", {
    enum: ["draft", "sent", "accepted", "rejected", "active", "defaulted", "completed", "cancelled"]
  }).notNull().default("draft"),
  creditScore: integer("credit_score"),
  plaidPaymentToken: text("plaid_payment_token"),
  signedDocumentUrl: text("signed_document_url"),
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  acceptedAt: timestamp("accepted_at"),
  activatedAt: timestamp("activated_at"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  borrowerEmail: text("borrower_email").notNull(),
  borrowerPhone: text("borrower_phone").notNull(),
  underwritingStatus: text("underwriting_status", {
    enum: ["pending", "approved", "rejected"]
  }),
  underwritingNotes: text("underwriting_notes")
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => contracts.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  status: text("status", {
    enum: ["scheduled", "processing", "completed", "failed"]
  }).notNull(),
  plaidPaymentId: text("plaid_payment_id"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: text("type", {
    enum: ["payment_due", "payment_received", "contract_offer", "kyc_update"]
  }).notNull(),
  status: text("status", {
    enum: ["pending", "sent", "failed"]
  }).notNull(),
  channel: text("channel", {
    enum: ["email", "sms"]
  }).notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
});

export const usersRelations = relations(users, ({ many }) => ({
  contracts: many(contracts, { relationName: "customer_contracts" }),
  notifications: many(notifications),
  verificationSessions: many(verificationSessions),
}));

export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  user: one(users, {
    fields: [merchants.userId],
    references: [users.id],
  }),
  contracts: many(contracts),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [contracts.merchantId],
    references: [merchants.id],
  }),
  customer: one(users, {
    fields: [contracts.customerId],
    references: [users.id],
  }),
  payments: many(payments),
}));

export const verificationSessionsRelations = relations(verificationSessions, ({ one }) => ({
  user: one(users, {
    fields: [verificationSessions.userId],
    references: [users.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertMerchantSchema = createInsertSchema(merchants);
export const selectMerchantSchema = createSelectSchema(merchants);
export const insertContractSchema = createInsertSchema(contracts);
export const selectContractSchema = createSelectSchema(contracts);
export const insertPaymentSchema = createInsertSchema(payments);
export const selectPaymentSchema = createSelectSchema(payments);
export const insertNotificationSchema = createInsertSchema(notifications);
export const selectNotificationSchema = createSelectSchema(notifications);
export const insertVerificationSessionSchema = createInsertSchema(verificationSessions);
export const selectVerificationSessionSchema = createSelectSchema(verificationSessions);
export const insertWebhookEventSchema = createInsertSchema(webhookEvents);
export const selectWebhookEventSchema = createSelectSchema(webhookEvents);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;
export type SelectMerchant = typeof merchants.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;
export type SelectContract = typeof contracts.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;
export type SelectPayment = typeof payments.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type SelectNotification = typeof notifications.$inferSelect;
export type InsertVerificationSession = typeof verificationSessions.$inferInsert;
export type SelectVerificationSession = typeof verificationSessions.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;
export type SelectWebhookEvent = typeof webhookEvents.$inferSelect;