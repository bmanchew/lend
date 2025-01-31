import { pgTable, text, serial, timestamp, integer, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "merchant", "customer"] }).notNull(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  plaidAccessToken: text("plaid_access_token"),
  kycStatus: text("kyc_status", { enum: ["pending", "verified", "failed"] }),
  phoneNumber: text("phone_number"),
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
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  term: integer("term").notNull(), // in months
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  status: text("status", {
    enum: ["pending", "active", "completed", "defaulted", "cancelled"]
  }).notNull(),
  creditScore: integer("credit_score"),
  plaidPaymentToken: text("plaid_payment_token"),
  signedDocumentUrl: text("signed_document_url"),
  createdAt: timestamp("created_at").defaultNow(),
  activatedAt: timestamp("activated_at"),
  completedAt: timestamp("completed_at"),
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  contracts: many(contracts, { relationName: "customer_contracts" }),
  notifications: many(notifications),
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

// Schemas for validation
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

// Types for TypeScript
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