import type { Express } from "express";
import { db } from "@db";
import { contracts, merchants, users, verificationSessions } from "@db/schema";
import { eq, and, lt, desc } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { authService } from "./auth";
import express from 'express';
import NodeCache from 'node-cache';
import { diditService } from "./services/didit";
import { smsService } from "./services/sms";
import { calculateMonthlyPayment, calculateTotalInterest } from "./services/loan-calculator";
import { Request, Response, NextFunction } from 'express';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { timingSafeEqual } from 'crypto'; // Import for timing-safe comparison
const logger = console; // Placeholder for a proper logger


// Define User interface to match database schema
interface User {
  id: number;
  username: string;
  password: string;
  email: string;
  name: string;
  role: string;
  phoneNumber: string | null;
  lastOtpCode: string | null;
  otpExpiry: Date | null;
  kycStatus: string;
}

const apiCache = new NodeCache({ stdTTL: 300 }); // 5 min cache

// Cleanup expired OTPs every 5 minutes
const cleanupExpiredOTPs = async () => {
  try {
    const now = new Date();
    await db
      .update(users)
      .set({
        lastOtpCode: null,
        otpExpiry: null
      })
      .where(
        and(
          eq(users.role, 'customer'),
          lt(users.otpExpiry, now)
        )
      );
    console.log('[Routes] Cleaned up expired OTPs at:', now.toISOString());
  } catch (err) {
    console.error('[Routes] Error cleaning up expired OTPs:', err);
  }
};

setInterval(cleanupExpiredOTPs, 5 * 60 * 1000);

export function registerRoutes(app: Express) {
  setupAuth(app);
  const apiRouter = express.Router();

  // Global API error handler
  apiRouter.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('[API] Error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  });

  // Add request logging
  apiRouter.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[API] ${req.method} ${req.path}`);
    next();
  });

  // Send OTP endpoint with simplified validation
  apiRouter.post("/auth/send-otp", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        console.error('[Routes] Missing phone number');
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Basic phone formatting
      let cleanNumber = phoneNumber.replace(/\D/g, '');
      if (cleanNumber.length === 10) {
        cleanNumber = `1${cleanNumber}`; // Add country code for US numbers
      }
      cleanNumber = `+${cleanNumber}`;

      console.log('[Routes] Processing OTP request:', {
        originalNumber: phoneNumber,
        cleanNumber,
        timestamp: new Date().toISOString()
      });

      // Basic validation
      if (cleanNumber.length !== 12 || !cleanNumber.startsWith('+1')) {
        console.error('[Routes] Invalid phone number format:', {
          input: phoneNumber,
          cleaned: cleanNumber
        });
        return res.status(400).json({
          error: "Invalid phone number",
          details: "Please enter a valid 10-digit US phone number"
        });
      }

      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Find or create user with minimal fields
      let user = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, cleanNumber))
        .limit(1)
        .then(rows => rows[0]);

      if (!user) {
        [user] = await db
          .insert(users)
          .values({
            username: cleanNumber.slice(1),
            password: Math.random().toString(36).slice(-8),
            email: `${cleanNumber.slice(1)}@temp.shifi.com`,
            name: '',
            role: 'customer',
            phoneNumber: cleanNumber,
            lastOtpCode: otp,
            otpExpiry
          })
          .returning();

        console.log('[Routes] Created new user:', {
          userId: user.id,
          phone: cleanNumber
        });
      } else {
        await db
          .update(users)
          .set({
            lastOtpCode: otp,
            otpExpiry
          })
          .where(eq(users.id, user.id));

        console.log('[Routes] Updated existing user OTP:', {
          userId: user.id,
          phone: cleanNumber
        });
      }

      // Send OTP via SMS
      const sent = await smsService.sendOTP(cleanNumber, otp);

      if (sent) {
        console.log('[Routes] OTP sent successfully:', {
          userId: user.id,
          phone: cleanNumber
        });
        res.json({ success: true, userId: user.id });
      } else {
        console.error('[Routes] Failed to send OTP:', {
          userId: user.id,
          phone: cleanNumber
        });
        res.status(500).json({ error: "Failed to send OTP" });
      }
    } catch (err) {
      console.error("[Routes] Error in send-otp:", err);
      next(err);
    }
  });

  apiRouter.post("/auth/verify-otp", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, otp } = req.body;

      if (!userId || !otp) {
        console.error('[Routes] Missing verification data:', {
          hasUserId: !!userId,
          hasOtp: !!otp,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ 
          success: false,
          message: "User ID and verification code are required" 
        });
      }

      // Enhanced session validation
      if (!req.session) {
        console.error('[Routes] Invalid session state');
        return res.status(400).json({ 
          success: false,
          message: "Invalid session state" 
        });
      }

      // Rate limiting
      const otpAttempts = (req.session.otpAttempts || 0) + 1;
      req.session.otpAttempts = otpAttempts;

      if (otpAttempts > 5) {
        console.error('[Routes] Too many OTP attempts:', {
          userId,
          attempts: otpAttempts,
          timestamp: new Date().toISOString()
        });
        return res.status(429).json({ 
          success: false,
          message: "Too many attempts. Please request a new code.",
          attemptsRemaining: 0
        });
      }

      // User lookup with role verification
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, parseInt(String(userId))))
        .limit(1);

      if (!user) {
        console.error('[Routes] User not found:', { userId });
        return res.status(404).json({ 
          success: false,
          message: "User not found" 
        });
      }

      // Verify user is a customer/borrower
      if (user.role !== 'customer') {
        console.error('[Routes] Invalid user role for OTP verification:', {
          userId: user.id,
          role: user.role
        });
        return res.status(403).json({ 
          success: false,
          message: "Invalid account type for OTP verification" 
        });
      }

      // Validate OTP presence and expiry
      if (!user.lastOtpCode || !user.otpExpiry) {
        console.error('[Routes] No active OTP found:', {
          userId: user.id,
          hasOtp: !!user.lastOtpCode,
          hasExpiry: !!user.otpExpiry,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ 
          success: false,
          message: "No active verification code" 
        });
      }

      const now = new Date();
      const expiry = new Date(user.otpExpiry);

      if (now > expiry) {
        console.error('[Routes] OTP expired:', {
          userId: user.id,
          expiry: expiry.toISOString(),
          now: now.toISOString()
        });

        // Clear expired OTP
        await db
          .update(users)
          .set({
            lastOtpCode: null,
            otpExpiry: null
          })
          .where(eq(users.id, user.id));

        return res.status(400).json({ 
          success: false,
          message: "Verification code has expired" 
        });
      }

      // Normalize and validate OTP format
      const normalizedStoredOTP = user.lastOtpCode.trim();
      const normalizedInputOTP = otp.trim();

      if (!/^\d{6}$/.test(normalizedStoredOTP) || !/^\d{6}$/.test(normalizedInputOTP)) {
        console.error('[Routes] Invalid OTP format:', {
          userId: user.id,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ 
          success: false,
          message: "Invalid verification code format" 
        });
      }

      // Timing-safe comparison
      const isValid = timingSafeEqual(
        Buffer.from(normalizedStoredOTP),
        Buffer.from(normalizedInputOTP)
      );

      if (!isValid) {
        console.error('[Routes] Invalid OTP provided:', {
          userId: user.id,
          attempts: otpAttempts,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ 
          success: false,
          message: "Invalid verification code",
          attemptsRemaining: 5 - otpAttempts
        });
      }

      // Clear used OTP and reset attempts on success
      await db
        .update(users)
        .set({
          lastOtpCode: null,
          otpExpiry: null
        })
        .where(eq(users.id, user.id));

      req.session.otpAttempts = 0;

      console.log('[Routes] OTP verified successfully:', {
        userId: user.id,
        role: user.role,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        userId: user.id,
        role: user.role
      });
    } catch (err) {
      console.error("[Routes] Error in verify-otp:", err);
      next(err);
    }
  });

  // Essential routes for contracts
  apiRouter.get("/customers/:id/contracts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerContracts = await db.query.contracts.findMany({
        where: eq(contracts.customerId, parseInt(req.params.id)),
        orderBy: desc(contracts.createdAt)
      });
      res.json(customerContracts);
    } catch (err: any) {
      console.error("Error fetching customer contracts:", err);
      next(err);
    }
  });

  // Essential merchant route
  apiRouter.get("/merchants/by-user/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user || user.role !== 'merchant') {
        return res.status(403).json({ error: 'User is not a merchant' });
      }

      const [merchant] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.userId, userId))
        .limit(1);

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }

      res.json(merchant);
    } catch (err: any) {
      console.error("Error fetching merchant by user:", err);
      next(err);
    }
  });

  // Add new route for fetching merchant applications
  apiRouter.get("/merchants/:merchantId/applications", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      if (isNaN(merchantId)) {
        return res.status(400).json({ error: 'Invalid merchant ID' });
      }

      const applications = await db.query.contracts.findMany({
        where: eq(contracts.merchantId, merchantId),
        orderBy: [desc(contracts.createdAt)],
        with: {
          merchant: true,
          customer: {
            columns: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true
            }
          }
        }
      });

      console.log('[Routes] Fetched applications for merchant:', {
        merchantId,
        count: applications.length,
        timestamp: new Date().toISOString()
      });

      res.json(applications);
    } catch (err) {
      console.error("[Routes] Error fetching merchant applications:", {
        error: err,
        merchantId: req.params.merchantId,
        timestamp: new Date().toISOString()
      });
      next(err);
    }
  });

  // Add contract status update endpoint
  apiRouter.put("/contracts/:contractId/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = parseInt(req.params.contractId);
      const { status } = req.body;

      if (!contractId || !status) {
        return res.status(400).json({ error: "Contract ID and status are required" });
      }

      // Validate status
      const validStatuses = ['pending_review', 'approved', 'rejected', 'active'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // Update contract status
      const [updatedContract] = await db
        .update(contracts)
        .set({
          status,
          // Add timestamp for status change
          updatedAt: new Date()
        })
        .where(eq(contracts.id, contractId))
        .returning();

      if (!updatedContract) {
        return res.status(404).json({ error: "Contract not found" });
      }

      console.log('[Routes] Contract status updated:', {
        contractId,
        oldStatus: updatedContract.status,
        newStatus: status,
        timestamp: new Date().toISOString()
      });

      res.json(updatedContract);
    } catch (err) {
      console.error("[Routes] Error updating contract status:", {
        error: err,
        contractId: req.params.contractId,
        timestamp: new Date().toISOString()
      });
      next(err);
    }
  });

  // Add loan application endpoint
  apiRouter.post("/merchants/:merchantId/send-loan-application", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const {
        firstName,
        lastName,
        email,
        phone,
        program,
        amount,
        salesRepEmail
      } = req.body;

      if (!merchantId || !email || !phone || !amount) {
        return res.status(400).json({ error: "Required fields are missing" });
      }

      // Create a new user for the borrower if they don't exist
      let [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!existingUser) {
        [existingUser] = await db
          .insert(users)
          .values({
            username: email,
            password: Math.random().toString(36).slice(-8),
            email: email,
            name: `${firstName} ${lastName}`,
            role: 'customer',
            phoneNumber: phone,
          })
          .returning();

        console.log('[Routes] Created new user for loan application:', {
          userId: existingUser.id,
          email,
          timestamp: new Date().toISOString()
        });
      }

      // Generate unique contract number
      const contractNumber = `LN${Date.now()}`;

      // Create the contract
      const [contract] = await db
        .insert(contracts)
        .values({
          merchantId,
          customerId: existingUser.id,
          contractNumber,
          amount: amount.toString(),
          term: 36, // Default term
          interestRate: "24.99", // Default rate
          status: "pending_review",
          borrowerEmail: email,
          borrowerPhone: phone,
          active: true
        })
        .returning();

      console.log('[Routes] Created new loan application:', {
        contractId: contract.id,
        merchantId,
        customerId: existingUser.id,
        contractNumber,
        timestamp: new Date().toISOString()
      });

      res.json(contract);
    } catch (err) {
      console.error("[Routes] Error creating loan application:", {
        error: err,
        timestamp: new Date().toISOString()
      });
      next(err);
    }
  });

  app.use("/api", apiRouter);
}