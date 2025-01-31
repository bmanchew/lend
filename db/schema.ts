import { pgTable, text, serial, timestamp, integer, boolean, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "merchant", "customer"] }).notNull(),
  email: text("email").unique().notNull(),
  phone: text("phone").unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  plaidAccessToken: text("plaid_access_token"),
  kycStatus: text("kyc_status", { enum: ["pending", "verified", "failed"] }),
  faceIdHash: text("face_id_hash"),
});

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  companyName: text("company_name").notNull(),
  status: text("status", { enum: ["active", "suspended"] }).default("active"),
  reserveBalance: decimal("reserve_balance", { precision: 10, scale: 2 }).default("0"),
});

export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  customerId: integer("customer_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  term: integer("term").notNull(), // months
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  status: text("status", { enum: ["pending", "active", "completed", "defaulted"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  signedAt: timestamp("signed_at"),
  plaidPaymentToken: text("plaid_payment_token"),
  creditScore: integer("credit_score"),
  documents: jsonb("documents"),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => contracts.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  status: text("status", { enum: ["pending", "paid", "late", "failed"] }).notNull(),
});

export const merchantReps = pgTable("merchant_reps", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: text("role", { enum: ["admin", "sales"] }).notNull(),
  active: boolean("active").default(true),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  contracts: many(contracts),
  merchantReps: many(merchantReps),
}));

export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  user: one(users, {
    fields: [merchants.userId],
    references: [users.id],
  }),
  contracts: many(contracts),
  reps: many(merchantReps),
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

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;
export type SelectMerchant = typeof merchants.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;
export type SelectContract = typeof contracts.$inferSelect;
