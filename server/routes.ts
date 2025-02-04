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

  // Add OTP endpoint with enhanced logging
apiRouter.post("/auth/send-otp", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber } = req.body;
    const requestTime = new Date().toISOString();

    console.log('[OTP] Received OTP request:', {
      timestamp: requestTime,
      phoneNumber,
      headers: {
        userAgent: req.headers['user-agent'],
        platform: req.headers['sec-ch-ua-platform'],
        mobile: req.headers['sec-ch-ua-mobile']
      }
    });

    if (!phoneNumber) {
      console.error('[OTP] Missing phone number:', {
        timestamp: requestTime,
        body: req.body
      });
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Basic phone formatting with logging
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.length === 10) {
      cleanNumber = `1${cleanNumber}`; // Add country code for US numbers
    }
    cleanNumber = `+${cleanNumber}`;

    console.log('[OTP] Phone number processing:', {
      timestamp: requestTime,
      originalNumber: phoneNumber,
      cleanNumber,
      validationSteps: {
        digitsOnly: phoneNumber.replace(/\D/g, ''),
        addedCountryCode: cleanNumber.length === 10,
        finalFormat: cleanNumber
      }
    });

    // Basic validation with detailed logging
    if (cleanNumber.length !== 12 || !cleanNumber.startsWith('+1')) {
      console.error('[OTP] Phone validation failed:', {
        timestamp: requestTime,
        input: phoneNumber,
        cleaned: cleanNumber,
        validationErrors: {
          length: cleanNumber.length !== 12,
          prefix: !cleanNumber.startsWith('+1'),
          format: 'Invalid phone number format'
        }
      });
      return res.status(400).json({
        error: "Invalid phone number",
        details: "Please enter a valid 10-digit US phone number"
      });
    }

    // Generate OTP with entropy logging
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    console.log('[OTP] Generated new OTP:', {
      timestamp: requestTime,
      otpLength: otp.length,
      expiryTime: otpExpiry.toISOString(),
      timeToLive: '5 minutes'
    });

    // Find or create user with enhanced logging
    let user = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, cleanNumber))
      .limit(1)
      .then(rows => rows[0]);

    if (!user) {
      console.log('[OTP] Creating new user:', {
        timestamp: requestTime,
        phone: cleanNumber,
        userType: 'customer'
      });

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

      console.log('[OTP] New user created:', {
        timestamp: requestTime,
        userId: user.id,
        phone: cleanNumber,
        otpSet: true,
        expirySet: true
      });
    } else {
      console.log('[OTP] Updating existing user:', {
        timestamp: requestTime,
        userId: user.id,
        phone: cleanNumber,
        previousOtpExpiry: user.otpExpiry
      });

      await db
        .update(users)
        .set({
          lastOtpCode: otp,
          otpExpiry
        })
        .where(eq(users.id, user.id));

      console.log('[OTP] User OTP updated:', {
        timestamp: requestTime,
        userId: user.id,
        newExpiryTime: otpExpiry.toISOString()
      });
    }

    // Send OTP via SMS with result logging
    const sent = await smsService.sendOTP(cleanNumber, otp);

    if (sent) {
      console.log('[OTP] SMS sent successfully:', {
        timestamp: requestTime,
        userId: user.id,
        phone: cleanNumber,
        otpExpiry: otpExpiry.toISOString()
      });
      res.json({ success: true, userId: user.id });
    } else {
      console.error('[OTP] SMS delivery failed:', {
        timestamp: requestTime,
        userId: user.id,
        phone: cleanNumber
      });
      res.status(500).json({ error: "Failed to send OTP" });
    }
  } catch (err) {
    console.error("[OTP] Error in send-otp:", {
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined
    });
    next(err);
  }
});

// Verify OTP endpoint with enhanced logging
apiRouter.post("/auth/verify-otp", async (req: Request, res: Response, next: NextFunction) => {
  const requestTime = new Date().toISOString();
  try {
    const { userId, otp } = req.body;

    console.log('[OTP-Verify] Received verification request:', {
      timestamp: requestTime,
      userId,
      hasOtp: !!otp,
      sessionId: req.session.id
    });

    if (!userId || !otp) {
      console.error('[OTP-Verify] Missing verification data:', {
        timestamp: requestTime,
        hasUserId: !!userId,
        hasOtp: !!otp,
        sessionId: req.session.id
      });
      return res.status(400).json({ 
        success: false,
        message: "User ID and verification code are required" 
      });
    }

    // Enhanced session validation logging
    if (!req.session) {
      console.error('[OTP-Verify] Invalid session state:', {
        timestamp: requestTime,
        sessionId: req.session?.id,
        userId
      });
      return res.status(400).json({ 
        success: false,
        message: "Invalid session state" 
      });
    }

    // Rate limiting with detailed logging
    const otpAttempts = (req.session.otpAttempts || 0) + 1;
    req.session.otpAttempts = otpAttempts;

    console.log('[OTP-Verify] Attempt count:', {
      timestamp: requestTime,
      userId,
      attemptNumber: otpAttempts,
      sessionId: req.session.id
    });

    if (otpAttempts > 5) {
      console.error('[OTP-Verify] Rate limit exceeded:', {
        timestamp: requestTime,
        userId,
        attempts: otpAttempts,
        sessionId: req.session.id
      });
      return res.status(429).json({ 
        success: false,
        message: "Too many attempts. Please request a new code.",
        attemptsRemaining: 0
      });
    }

    // User lookup with enhanced logging
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(String(userId))))
      .limit(1);

    if (!user) {
      console.error('[OTP-Verify] User not found:', {
        timestamp: requestTime,
        userId,
        sessionId: req.session.id
      });
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    console.log('[OTP-Verify] User found:', {
      timestamp: requestTime,
      userId: user.id,
      role: user.role,
      kycStatus: user.kycStatus,
      hasOtp: !!user.lastOtpCode,
      hasExpiry: !!user.otpExpiry
    });

    // Role verification logging
    if (user.role !== 'customer') {
      console.error('[OTP-Verify] Invalid user role:', {
        timestamp: requestTime,
        userId: user.id,
        role: user.role,
        sessionId: req.session.id
      });
      return res.status(403).json({ 
        success: false,
        message: "Invalid account type for OTP verification" 
      });
    }

    // KYC status check with logging
    if (user.kycStatus !== 'approved' && user.kycStatus !== 'pending') {
      console.error('[OTP-Verify] Invalid KYC status:', {
        timestamp: requestTime,
        userId: user.id,
        kycStatus: user.kycStatus,
        sessionId: req.session.id
      });
      return res.status(403).json({
        success: false,
        message: "Please complete your identity verification first",
        requiresKyc: true
      });
    }

    // OTP validation logging
    if (!user.lastOtpCode || !user.otpExpiry) {
      console.error('[OTP-Verify] No active OTP:', {
        timestamp: requestTime,
        userId: user.id,
        hasOtp: !!user.lastOtpCode,
        hasExpiry: !!user.otpExpiry,
        sessionId: req.session.id
      });
      return res.status(400).json({ 
        success: false,
        message: "No active verification code" 
      });
    }

    const now = new Date();
    const expiry = new Date(user.otpExpiry);

    console.log('[OTP-Verify] Checking OTP expiry:', {
      timestamp: requestTime,
      userId: user.id,
      otpExpiry: expiry.toISOString(),
      currentTime: now.toISOString(),
      isExpired: now > expiry
    });

    if (now > expiry) {
      console.error('[OTP-Verify] OTP expired:', {
        timestamp: requestTime,
        userId: user.id,
        expiry: expiry.toISOString(),
        currentTime: now.toISOString()
      });

      // Clear expired OTP
      await db
        .update(users)
        .set({
          lastOtpCode: null,
          otpExpiry: null
        })
        .where(eq(users.id, user.id));

      console.log('[OTP-Verify] Cleared expired OTP:', {
        timestamp: requestTime,
        userId: user.id
      });

      return res.status(400).json({ 
        success: false,
        message: "Verification code has expired" 
      });
    }

    // OTP format validation with logging
    const normalizedStoredOTP = user.lastOtpCode.trim();
    const normalizedInputOTP = otp.trim();

    const isValidFormat = /^\d{6}$/.test(normalizedStoredOTP) && /^\d{6}$/.test(normalizedInputOTP);

    console.log('[OTP-Verify] OTP format validation:', {
      timestamp: requestTime,
      userId: user.id,
      isValidFormat,
      inputLength: normalizedInputOTP.length,
      expectedLength: 6
    });

    if (!isValidFormat) {
      console.error('[OTP-Verify] Invalid OTP format:', {
        timestamp: requestTime,
        userId: user.id,
        sessionId: req.session.id
      });
      return res.status(400).json({ 
        success: false,
        message: "Invalid verification code format" 
      });
    }

    // Timing-safe comparison with logging
    const isValid = timingSafeEqual(
      Buffer.from(normalizedStoredOTP),
      Buffer.from(normalizedInputOTP)
    );

    console.log('[OTP-Verify] OTP verification result:', {
      timestamp: requestTime,
      userId: user.id,
      isValid,
      attempts: otpAttempts
    });

    if (!isValid) {
      console.error('[OTP-Verify] Invalid OTP:', {
        timestamp: requestTime,
        userId: user.id,
        attempts: otpAttempts,
        remainingAttempts: 5 - otpAttempts
      });
      return res.status(400).json({ 
        success: false,
        message: "Invalid verification code",
        attemptsRemaining: 5 - otpAttempts
      });
    }

    // Clear used OTP and update session
    await db
      .update(users)
      .set({
        lastOtpCode: null,
        otpExpiry: null
      })
      .where(eq(users.id, user.id));

    console.log('[OTP-Verify] Cleared used OTP:', {
      timestamp: requestTime,
      userId: user.id
    });

    req.session.otpAttempts = 0;
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.kycStatus = user.kycStatus;
    req.session.verified = true;
    req.session.verifiedAt = new Date().toISOString();

    console.log('[OTP-Verify] Updated session state:', {
      timestamp: requestTime,
      userId: user.id,
      sessionId: req.session.id,
      role: user.role,
      kycStatus: user.kycStatus,
      verifiedAt: req.session.verifiedAt
    });

    res.json({
      success: true,
      userId: user.id,
      role: user.role,
      kycStatus: user.kycStatus,
      requiresKyc: user.kycStatus === 'pending'
    });

  } catch (err) {
    console.error("[OTP-Verify] Error in verify-otp:", {
      timestamp: requestTime,
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
      sessionId: req.session?.id
    });
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

// Update the loan application endpoint to send SMS notification
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

    console.log('[Loan-App] Processing new application:', {
      timestamp: new Date().toISOString(),
      merchantId,
      email,
      phone,
      amount
    });

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
          kycStatus: 'pending', // Set initial KYC status
        })
        .returning();

      console.log('[Loan-App] Created new user:', {
        timestamp: new Date().toISOString(),
        userId: existingUser.id,
        email,
        kycStatus: 'pending'
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

    console.log('[Loan-App] Created new contract:', {
      timestamp: new Date().toISOString(),
      contractId: contract.id,
      merchantId,
      customerId: existingUser.id,
      contractNumber
    });

    // Get merchant details for SMS
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);

    if (!merchant) {
      throw new Error('Merchant not found');
    }

    // Generate application URL
    const applicationUrl = `${process.env.APP_URL || 'https://shi-fi-lend-brandon263.replit.app'}/application/${contract.id}`;

    // Send SMS notification with application link
    const smsResult = await smsService.sendLoanApplicationLink(
      phone,
      merchant.businessName || 'ShiFi',
      applicationUrl,
      existingUser.id
    );

    console.log('[Loan-App] SMS notification result:', {
      timestamp: new Date().toISOString(),
      success: smsResult.success,
      phone,
      userId: existingUser.id,
      contractId: contract.id
    });

    if (!smsResult.success) {
      console.error('[Loan-App] Failed to send SMS notification:', {
        timestamp: new Date().toISOString(),
        error: smsResult.error,
        phone,
        userId: existingUser.id
      });
    }

    res.json({
      ...contract,
      smsNotification: smsResult.success
    });
  } catch (err) {
    console.error("[Loan-App] Error creating application:", {
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined
    });
    next(err);
  }
});

app.use("/api", apiRouter);
}