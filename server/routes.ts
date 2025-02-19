import { Router } from 'express';
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users, verificationSessions, webhookEvents, programs, rewardsBalances } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import express from 'express';
import NodeCache from 'node-cache';
import { Server as SocketIOServer } from 'socket.io';
import { smsService } from "./services/sms";
import { calculateMonthlyPayment, calculateTotalInterest } from "./services/loan-calculator";
import { logger } from "./lib/logger";
import { slackService } from "./services/slack";
import { PlaidService } from './services/plaid';
import { LedgerManager } from './services/ledger-manager';
import { shifiRewardsService } from './services/shifi-rewards';
import jwt from 'jsonwebtoken';
import { authService } from "./auth";
import type { LoginData, JWTPayload, User } from '@/types';

// Initialize LedgerManager singleton
const ledgerManager = LedgerManager.getInstance({
  minBalance: 1000,
  maxBalance: 100000,
  sweepThreshold: 500,
  sweepSchedule: '0 */15 * * * *' // Every 15 minutes
});

// Type declarations
interface RequestWithUser extends Request {
  user?: JWTPayload;
}

const router = Router();

// Custom error class for API errors
class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Request tracking middleware
const requestTrackingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = Date.now().toString(36);
  req.headers['x-request-id'] = requestId;

  logger.info(`[API] ${req.method} ${req.path}`, {
    requestId,
    query: req.query,
    body: req.body,
    headers: { ...req.headers, authorization: undefined }
  });

  next();
};

// Cache middleware
const cacheMiddleware = (duration: number) => {
  const apiCache = new NodeCache({ stdTTL: duration });

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    const key = `__express__${req.originalUrl}`;
    const cachedResponse = apiCache.get(key);

    if (cachedResponse) {
      res.send(cachedResponse);
      return;
    }

    const originalSend = res.send;
    res.send = function(body: any): any {
      apiCache.set(key, body, duration);
      return originalSend.call(this, body);
    };

    next();
  };
};

// JWT verification middleware
const verifyJWT = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  // If no token, and this is not a public endpoint, reject
  if (!token) {
    logger.info("[Auth] No token provided in request");
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    req.user = decoded;
    logger.info("[Auth] JWT verification successful:", { userId: decoded.id, role: decoded.role });
    next();
  } catch (err) {
    logger.error('[Auth] JWT verification failed:', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Auth routes - no JWT verification needed for these
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password, loginType } = req.body as LoginData;
    
    logger.debug("[Auth] Login attempt details:", {
      username,
      loginType,
      hasPassword: !!password,
      timestamp: new Date().toISOString()
    });

    if (!username || !password) {
      logger.info("[Auth] Missing credentials:", { username });
      return res.status(400).json({ error: "Username and password are required" });
    }

    // Get user from database with role check
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.username, username),
          eq(users.role, loginType)
        )
      )
      .limit(1);

    if (!user) {
      logger.info("[Auth] User not found or invalid role:", { username, loginType });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    logger.debug("[Auth] Found user:", {
      userId: user.id,
      role: user.role,
      hasStoredPassword: !!user.password,
      timestamp: new Date().toISOString()
    });

    logger.debug("[Auth] Login attempt details:", {
      username,
      loginType,
      requestHeaders: req.headers,
      timestamp: new Date().toISOString(),
      path: req.path
    });

    logger.debug("[Auth] Found user:", {
      userId: user.id,
      role: user.role,
      hasPassword: !!user.password,
      timestamp: new Date().toISOString()
    });

    // Verify password using authService
    const isValid = await authService.comparePasswords(password, user.password);

    if (!isValid) {
      logger.info("[Auth] Invalid password for user:", username);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if loginType matches user role
    if (loginType !== user.role) {
      logger.info("[Auth] Role mismatch:", { 
        expected: loginType, 
        actual: user.role,
        username,
        timestamp: new Date().toISOString()
      });
      return res.status(403).json({ 
        error: `This login is for ${loginType} accounts only.`
      });
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';
    const token = jwt.sign({
      id: user.id,
      role: user.role,
      name: user.name || undefined,
      email: user.email,
      phoneNumber: user.phoneNumber || undefined
    } as JWTPayload, jwtSecret);

    logger.info("[Auth] Login successful:", {
      userId: user.id,
      role: user.role,
      timestamp: new Date().toISOString()
    });

    // Return response
    res.json({
      token,
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      username: user.username
    });
  } catch (err) {
    logger.error("[Auth] Login error:", err);
    res.status(500).json({ error: "Internal server error during login" });
  }
});

// Register core middleware
router.use(requestTrackingMiddleware);
router.use(cacheMiddleware(300));

// Public routes - no auth required
router.post("/sendOTP", async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    logger.info('[SMS] Attempting to send OTP:', { phoneNumber });
    
    // Format phone number consistently
    const formattedPhone = phoneNumber.startsWith('+1') ? phoneNumber : `+1${phoneNumber.replace(/\D/g, '')}`;
    
    // Create user if doesn't exist
    let [user] = await db.select().from(users).where(eq(users.phoneNumber, formattedPhone)).limit(1);
    
    if (!user) {
      [user] = await db.insert(users)
        .values({
          phoneNumber: formattedPhone,
          role: 'customer',
          username: formattedPhone,
          password: '',
          email: '',
          name: ''
        } as typeof users.$inferInsert)
        .returning();
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await smsService.sendSMS(formattedPhone, `Your OTP is: ${otp}`);

    await db.update(users)
      .set({
        lastOtpCode: otp,
        otpExpiry: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      })
      .where(eq(users.phoneNumber, formattedPhone));

    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    logger.error('[SMS] OTP send error:', error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/sendOTP", async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    logger.info('[SMS] Attempting to send OTP:', { phoneNumber });
    
    // Format phone number consistently
    const formattedPhone = phoneNumber.startsWith('+1') ? phoneNumber : `+1${phoneNumber.replace(/\D/g, '')}`;
    
    // Create user if doesn't exist
    let [user] = await db.select().from(users).where(eq(users.phoneNumber, formattedPhone)).limit(1);
    
    if (!user) {
      [user] = await db.insert(users)
        .values({
          phoneNumber: formattedPhone,
          role: 'customer',
          username: formattedPhone,
          password: '',
          email: '',
          name: ''
        } as typeof users.$inferInsert)
        .returning();
    }

    const otp = smsService.generateOTP();
    const sent = await smsService.sendOTP(formattedPhone, otp);

    if (sent) {
      await db.update(users)
        .set({
          lastOtpCode: otp,
          otpExpiry: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        })
        .where(eq(users.phoneNumber, formattedPhone));

      res.json({ message: "OTP sent successfully" });
    } else {
      res.status(500).json({ error: "Failed to send OTP" });
    }
  } catch (error) {
    logger.error('[SMS] OTP send error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// Public route for sending OTP
router.post("/sendOTP", async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    logger.info('[SMS] Attempting to send OTP:', { phoneNumber });
    
    // Format phone number consistently
    const formattedPhone = phoneNumber.startsWith('+1') ? phoneNumber : `+1${phoneNumber.replace(/\D/g, '')}`;
    
    // Create user if doesn't exist
    let [user] = await db.select().from(users).where(eq(users.phoneNumber, formattedPhone)).limit(1);
    
    if (!user) {
      [user] = await db.insert(users)
        .values({
          phoneNumber: formattedPhone,
          role: 'customer',
          username: formattedPhone,
          password: '',
          email: '',
          name: ''
        } as typeof users.$inferInsert)
        .returning();
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await smsService.sendSMS(formattedPhone, `Your OTP is: ${otp}`);

    await db.update(users)
      .set({
        lastOtpCode: otp,
        otpExpiry: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      })
      .where(eq(users.phoneNumber, formattedPhone));

    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    logger.error('[SMS] OTP send error:', error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// Apply JWT verification middleware for protected routes
router.use(verifyJWT);

// Protected routes below
router.get("/auth/me", async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(req.user);
  } catch (err) {
    logger.error("Error in /auth/me:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/contracts/:id/status",  async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, parseInt(id)))
      .limit(1);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const updates: Partial<typeof contracts.$inferInsert> = {
      status,
      lastPaymentId: req.body.lastPaymentId || null,
      lastPaymentStatus: req.body.lastPaymentStatus || null
    };

    const [updatedContract] = await db
      .update(contracts)
      .set(updates)
      .where(eq(contracts.id, parseInt(id)))
      .returning();

    // Update ledger if needed
    if (status === 'funded') {
      await ledgerManager.manualSweep('deposit', updatedContract.amount);
    }

    res.json(updatedContract);
  } catch (err) {
    next(err);
  }
});

router.get("/customers/:id/contracts", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const customerContracts = await db.select().from(contracts)
      .where(eq(contracts.customerId, userId))
      .orderBy(desc(contracts.createdAt));

    logger.info("Found contracts for customer:", customerContracts);
    res.json(customerContracts);
  } catch (err: any) {
    logger.error("Error fetching customer contracts:", err);
    next(err);
  }
});

router.post("/test-verification-email", async (req: RequestWithUser, res: Response) => {
  try {
    logger.info('Received test email request:', req.body);
    const testEmail = req.body.email;

    if (!testEmail) {
      return res.status(400).json({
        status: "error",
        message: "Email address is required"
      });
    }

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({
        status: "error",
        message: "SendGrid API key is not configured"
      });
    }

    logger.info('Generating verification token for:', testEmail);
    const token = await generateVerificationToken();

    logger.info('Attempting to send verification email to:', testEmail);
    const sent = await sendVerificationEmail(testEmail, token);

    if (sent) {
      logger.info('Email sent successfully to:', testEmail);
      return res.json({
        status: "success",
        message: "Verification email sent successfully"
      });
    } else {
      logger.error('Failed to send email to:', testEmail);
      return res.status(500).json({
        status: "error",
        message: "Failed to send verification email"
      });
    }
  } catch (err: any) {
    logger.error('Test verification email error:', err);
    return res.status(500).json({
      status: "error",
      message: err.message || "Failed to send test email"
    });
  }
});

router.get("/verify-sendgrid", async (req: RequestWithUser, res: Response) => {
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey || !apiKey.startsWith('SG.')) {
      return res.status(500).json({
        status: "error",
        message: "Invalid or missing SendGrid API key."
      });
    }
    const isConnected = await testSendGridConnection();
    if (isConnected) {
      res.json({
        status: "success",
        message: "SendGrid setup verified successfully."
      });
    } else {
      res.status(500).json({
        status: "error",
        message: "SendGrid setup verification failed. Check API key and connection."
      });
    }
  } catch (err: any) {
    logger.error('SendGrid verification error:', err);
    res.status(500).json({
      status: "error",
      message: err.message || "SendGrid verification failed"
    });
  }
});

router.get("/test-email", async (req: RequestWithUser, res: Response) => {
  try {
    const isConnected = await testSendGridConnection();
    if (isConnected) {
      res.json({
        status: "success",
        message: "SendGrid connection successful"
      });
    } else {
      res.status(500).json({
        status: "error",
        message: "SendGrid connection failed. See logs for details."
      });
    }
  } catch (err: any) {
    logger.error('SendGrid test error:', err);
    res.status(500).json({
      status: "error",
      message: err.message || "SendGrid test failed"
    });
  }
});

router.get("/merchants/by-user/:userId", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.userId);
    logger.info("[Merchant Lookup] Attempting to find merchant for userId:", userId);

    if (isNaN(userId)) {
      logger.info("[Merchant Lookup] Invalid userId provided:", req.params.userId);
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    logger.info("[Merchant Lookup] Executing query for userId:", userId);
    const merchantResults = await db
      .select()
      .from(merchants)
      .where(eq(merchants.userId, userId))
      .limit(1);

    logger.info("[Merchant Lookup] Query results:", merchantResults);
    logger.info("[Merchant Lookup] Query results:", merchantResults);

    const [merchant] = merchantResults;

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    logger.info("Found merchant:", merchant);
    res.json(merchant);
  } catch (err: any) {
    logger.error("Error fetching merchant by user:", err);
    next(err);
  }
});

router.get("/merchants/:id/contracts", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const merchantContracts = await db.query.contracts.findMany({
      where: eq(contracts.merchantId, parseInt(req.params.id)),
      with: {
        customer: true,
      },
    });
    res.json(merchantContracts);
  } catch (err: any) {
    logger.error("Error fetching merchant contracts:", err);
    next(err);
  }
});

router.post("/merchants/create", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    logger.info("[Merchant Creation] Received request:", {
      body: req.body,
      timestamp: new Date().toISOString()
    });

    const { companyName, email, phoneNumber, address, website } = req.body;
    const tempPassword = Math.random().toString(36).slice(-8);

    // Validate required fields
    if (!email || !companyName) {
      logger.error("[Merchant Creation] Missing required fields");
      return res.status(400).json({ error: 'Email and company name are required' });
    }

    // Check for existing user first
    logger.info("[Merchant Creation] Checking for existing user with email:", email);
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let merchantUser;
    if (existingUser.length > 0) {
      // Update existing user to merchant role
      [merchantUser] = await db
        .update(users)
        .set({ role: 'merchant' })
        .where(eq(users.id, existingUser[0].id))
        .returning();
      logger.info("[Merchant Creation] Updated existing user to merchant:", merchantUser);
    } else {

      logger.info("[Merchant Creation] Generated temporary password");
      const hashedPassword = await authService.hashPassword(tempPassword);

      logger.info("[Merchant Creation] Creating new merchant user account");
      [merchantUser] = await db
        .insert(users)
        .values({
          username: email,
          password: hashedPassword,
          email,
          name: companyName,
          role: 'merchant',
          phoneNumber
        } as typeof users.$inferInsert)
        .returning();
    }

    logger.info("[Merchant Creation] Created merchant user:", {
      id: merchantUser.id,
      email: merchantUser.email,
      role: merchantUser.role
    });

    // Create merchant record
    const [merchant] = await db
      .insert(merchants)
      .values({
        userId: merchantUser.id,
        companyName,
        address,
        website,
        status: 'active'
      } as typeof merchants.$inferInsert)
      .returning();

    // Send login credentials via email
    await sendMerchantCredentials(email, email, tempPassword);

    res.status(201).json({ merchant, user: merchantUser });
  } catch (err) {
    logger.error("Error creating merchant:", err);
    next(err);
  }
});

router.get("/merchants", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  logger.info("[Merchants] Fetching all merchants");
  try {
    const allMerchants = await db
      .select({
        merchant: merchants,
        user: users,
        program: programs
      })
      .from(merchants)
      .leftJoin(users, eq(merchants.userId, users.id))
      .leftJoin(programs, eq(merchants.id, programs.merchantId));

    const merchantsMap = new Map();
    allMerchants.forEach(row => {
      if (!merchantsMap.has(row.merchant.id)) {
        merchantsMap.set(row.merchant.id, {
          ...row.merchant,
          user: row.user,
          programs: []
        });
      }
      if (row.program) {
        merchantsMap.get(row.merchant.id).programs.push(row.program);
      }
    });

    const merchantsWithPrograms = Array.from(merchantsMap.values());

    res.json(merchantsWithPrograms);
  } catch (err: any) {
    logger.error("Error fetching all merchants:", err);
    next(err);
  }
});

router.post("/merchants/:id/programs", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    logger.info("[Programs] Creating new program:", req.body);
    const { name, term, interestRate } = req.body;
    const merchantId = parseInt(req.params.id);

    const [program] = await db.insert(programs).values({
      merchantId,
      name,
      term,
      interestRate,
    } as typeof programs.$inferInsert).returning();

    res.json(program);
  } catch (err: any) {
    logger.error("Error creating program:", err);
    next(err);
  }
});

router.get("/merchants/:id/programs", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const merchantId = parseInt(req.params.id);
    const merchantPrograms = await db
      .select()
      .from(programs)
      .where(eq(programs.merchantId, merchantId));
    res.json(merchantPrograms);
  } catch (err: any) {
    logger.error("Error fetching merchant programs:", err);
    next(err);
  }
});

router.get("/contracts", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { status, merchantId } = req.query;

    // Start with base query
    const baseQuery = db
      .select({
        contract: contracts,
        merchant: merchants,
        user: users
      })
      .from(contracts)
      .leftJoin(merchants, eq(contracts.merchantId, merchants.id))
      .leftJoin(users, eq(contracts.customerId, users.id));

    // Build conditions array for filtering
    const conditions = [];
    if (status) {
      conditions.push(eq(contracts.status, status as string));
    }
    if (merchantId) {
      conditions.push(eq(contracts.merchantId, parseInt(merchantId as string)));
    }

    // Apply conditions if any exist
    const query = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const allContracts = await query.orderBy(desc(contracts.createdAt));

    logger.info("[Routes] Successfully fetched contracts:", { count: allContracts.length });
    res.json(allContracts);
  } catch (err) {
    logger.error("[Routes] Error fetching contracts:", err);
    next(err);
  }
});

router.post("/contracts", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const {
      merchantId,
      customerDetails,
      amount,
      term,
      interestRate,
      downPayment = 0,
      notes = ''
    } = req.body;

    // Create customer user record with proper types
    const [customer] = await db.insert(users).values({
      username: customerDetails.email,
      password: Math.random().toString(36).slice(-8),
      email: customerDetails.email,
      name: `${customerDetails.firstName} ${customerDetails.lastName}`,
      role: 'customer',
      phoneNumber: customerDetails.phone,
      plaidAccessToken: null,
      kycStatus: 'pending',
      lastOtpCode: null,
      otpExpiry: null,
      faceIdHash: null
    } as typeof users.$inferInsert).returning();

    const monthlyPayment = calculateMonthlyPayment(amount, interestRate, term);
    const totalInterest = calculateTotalInterest(monthlyPayment, amount, term);
    const contractNumber = `LN${Date.now()}`;

    // Insert contract with proper types
    const [newContract] = await db.insert(contracts).values({
      merchantId: merchantId,
      customerId: customer.id,
      contractNumber: contractNumber,
      amount: amount.toString(),
      term: term,
      interestRate: interestRate.toString(),
      downPayment: downPayment.toString(),
      monthlyPayment: monthlyPayment.toString(),
      totalInterest: totalInterest.toString(),
      status: 'pending_review',
      notes: notes,
      underwritingStatus: 'pending',
      borrowerEmail: customerDetails.email,
      borrowerPhone: customerDetails.phone,
      active: true,
      lastPaymentId: null,
      lastPaymentStatus: null
    } as typeof contracts.$inferInsert).returning();

    // Get merchant details for notifications
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);

    if (!merchant) {
      throw new Error('Merchant not found');
    }

    // Send Slack notifications
    await slackService.notifyLoanApplication({
      merchantName: merchant.companyName,
      customerName: `${customerDetails.firstName} ${customerDetails.lastName}`,
      amount,
      phone: customerDetails.phone
    });

    // Emit contract update event
    global.io?.to(`merchant_${merchantId}`).emit('contract_update', {
      type: 'new_application',
      contractId: newContract.id,
      status: 'pending_review'
    });

    res.json(newContract);
  } catch (err) {
    logger.error("[Routes] Error creating contract:", err);
    next(err);
  }
});

router.post("/webhooks/process", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { eventType, sessionId, payload } = req.body;

    await db.insert(webhookEvents).values({
      eventType,
      sessionId,
      status: 'pending',
      payload: JSON.stringify(payload),
      error: null,
      retryCount: 0,
      processedAt: null
    } as typeof webhookEvents.$inferInsert);

    res.json({ status: 'success' });
  } catch (err) {
    next(err);
  }
});

router.get("/rewards/balance", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const balance = await shifiRewardsService.getBalance(req.user.id);
    const [balanceData] = await db
      .select()
      .from(rewardsBalances)
      .where(eq(rewardsBalances.userId, req.user.id))
      .limit(1);

    res.json({
      balance: balance,
      lifetimeEarned: balanceData?.lifetimeEarned || 0
    });
  } catch (err) {
    next(err);
  }
});

router.post("/merchants/:id/send-loan-application", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const requestId = Date.now().toString(36);
  const debugLog = (message: string, data?: any) => {
    logger.info(`[LoanApplication][${requestId}] ${message}`, data || "");
  };

  debugLog('Received application request', {
    body: req.body,
    merchantId: req.params.id,
    timestamp: new Date().toISOString()
  });

  try {
    // Enhanced phone number validation and formatting
    let phone = req.body.phone?.replace(/[^0-9+]/g, ''); // Keep + sign but remove other non-digits
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    debugLog('Initial phone cleaning', {
      original: req.body.phone,
      cleaned: phone
    });

    // Handle various phone formats
    if (phone.startsWith('+1')) {
      phone = phone.substring(2);
    } else if (phone.startsWith('1')) {
      phone = phone.substring(1);
    }

    if (phone.length !== 10) {
      logger.error('[LoanApplication] Invalid phone number format', {
        originalPhone: req.body.phone,
        cleanedPhone: phone,
        length: phone.length,
        requestId
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Please provide a 10-digit US phone number.'
      });
    }

    const formattedPhone = `+1${phone}`;
    debugLog('Formatted phone number', {
      original: req.body.phone,
      intermediate: phone,
      formatted: formattedPhone
    });

    //// Get merchant info for the SMS
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, parseInt(req.params.id)))
      .limit(1);

    if (!merchant) {
      logger.error('[LoanApplication] Merchant not found', {
        merchantId: req.params.id,
        requestId
      });
      return res.status(404).json({
        success: false,
        error: 'Merchant not found'
      });
    }

    // Generate application URL with proper encoding
    const appUrl = process.env.APP_URL || '';
    if (!appUrl) {
      logger.error('[LoanApplication] Missing APP_URL environment variable');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
    }

    const baseUrl = appUrl.replace(/\/$/, ''); // Remove trailing slash if present
    const applicationUrl = `${baseUrl}/apply/${encodeURIComponent(formattedPhone)}`;

    debugLog('Generated application URL', {
      baseUrl,
      applicationUrl,
      phone: formattedPhone
    });

    // Store webhook event before sending SMS
    await db.insert(webhookEvents).values({
      eventType: 'loan_application_attempt',
      sessionId: requestId,
      status: 'pending',
      payload: JSON.stringify({
        merchantId: parseInt(req.params.id),
        merchantName: merchant.companyName,
        phone: formattedPhone,
        applicationUrl,
        timestamp: new Date().toISOString(),
        requestId
      }),
      error: null,
      retryCount: 0,
      processedAt: null
    } as typeof webhookEvents.$inferInsert);



// Send SMS with enhanced error handling
    const smsResult = await smsService.sendLoanApplicationLink(
      formattedPhone,
      applicationUrl,
      merchant.companyName,
      {
        requestId,
        merchantName: merchant.companyName
      }
    );

    if (!smsResult.success) {
      // Update webhook event with error
      await db.update(webhookEvents)
        .set({
          status: 'failed',
          error: smsResult.error,
          processedAt: new Date()
        })
        .where(eq(webhookEvents.sessionId, requestId));

      logger.error('[LoanApplication] Failed to send SMS', {
        error: smsResult.error,
        phone: formattedPhone,
        requestId
      });

      // Provide more user-friendly error message based on error type
      let userErrorMessage = 'Failed to send application link';
      if (smsResult.error?.includes('Invalid \'To\' Phone Number')) {
        userErrorMessage = 'Please provide a valid mobile phone number that can receive SMS messages';
      } else if (smsResult.error?.includes('unsubscribed')) {
        userErrorMessage = 'This phone number has opted out of receiving messages. Please use a different number or contact support.';
      }

      return res.status(400).json({
        success: false,
        error: userErrorMessage,
        details: process.env.NODE_ENV === 'development' ? smsResult.error : undefined
      });
    }

    // Update webhook event with success
    await db.update(webhookEvents)
      .set({
        status: 'sent',
        processedAt: new Date()
      })
      .where(eq(webhookEvents.sessionId, requestId));

    debugLog('Successfully sent application link', {
      phone: formattedPhone,
      url: applicationUrl
    });

    return res.json({
      success: true,
      message: 'Application link sent successfully'
    });

  } catch (error) {
    logger.error('[LoanApplication] Unexpected error', {
      error,
      requestId
    });

    // Update webhook event with error
    await db.update(webhookEvents)
      .set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        processedAt: new Date()
      })
      .where(eq(webhookEvents.sessionId, requestId));

    next(error);
  }
});

router.post("/auth/verify-otp", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber, otp } = req.body;
    if (!phoneNumber || !otp) {
      return res.status(400).json({ error: "Phone number and OTP are required" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if OTP is valid and not expired
    if (!user.lastOtpCode || !user.otpExpiry || user.lastOtpCode !== otp || new Date() > user.otpExpiry) {
      return res.status(401).json({ error: "Invalid or expired OTP" });
    }

    // Generate JWT token with proper UserRole type
    const token = await authService.generateJWT({
      id: user.id,
      role: user.role as UserRole,
      name: user.name || '',
      email: user.email,
      phoneNumber: user.phoneNumber || ''
    });

    res.json({ token });

  } catch (err) {
    next(err);
  }
});

router.get("/auth/me", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(req.user);
  } catch (err) {
    next(err);
  }
});

router.post("/auth/logout", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.session.destroy(err => {
      if (err) {
        next(err);
      } else {
        res.json({ success: true });
      }
    });
  } catch (err) {
    next(err);
  }
});
router.post("/auth/register", async (req: RequestWithUser, res: Response, nextFunction) => {
  try {
    const { username, password, email, name, role, phoneNumber } = req.body;
    if (!username || !password || !email || !name || !role || !phoneNumber) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const hashedPassword= await authService.hashPassword(password);
    const user = await db.insert(users).values({
      username, password: hashedPassword, email, name, role,phoneNumber
    } as typeof users.$inferInsert).returning();
    res.json(user);
  } catch(err) {
    next(err);
  }
});

router.get("/rewards/transactions", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });}

    const transactions = await shifiRewardsService.getTransactionHistory(req.user.id);
    res.json(transactions);
  } catch (err) {
    next(err);
  }
});

router.get("/rewards/calculate", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { type, amount } = req.query;

    if (!type || !amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    let totalPoints = 0;
    let details: Record<string, any> = {};

    switch (type) {
      case 'down_payment':
        totalPoints = Math.floor(Number(amount) / 10); // Basic reward for down payment
        details = { basePoints: totalPoints };
        break;

      case 'early_payment':
        const monthsEarly = parseInt(req.query.monthsEarly as string) || 0;
        const earlyPayoff = Math.floor(Number(amount) * (1 + (monthsEarly * 0.1)));
        totalPoints = earlyPayoff;
        details = { monthsEarly, basePoints: Math.floor(Number(amount) / 20) };
        break;

      case 'additional_payment':
        const additionalPoints = Math.floor(Number(amount) / 25);
        totalPoints = additionalPoints;
        details = { basePoints: additionalPoints };
        break;

      default:
        return res.status(400).json({ error: 'Invalid reward type' });
    }

    res.json({
      totalPoints,
      details,
      type,
      amount: Number(amount)
    });
  } catch (err) {
    next(err);
  }
});

router.get("/rewards/potential", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const amount = parseFloat(req.query.amount as string);
    const type = req.query.type as string;

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    let totalPoints = 0;
    const details: Record<string, any> = {}; // Fix letdetails typo

    switch (type) {
      case 'down_payment':
        totalPoints = Math.floor(amount / 10); // Basic reward for down payment
        details.basePoints = totalPoints;
        break;

      case 'early_payment':
        const monthsEarly = parseInt(req.query.monthsEarly as string) || 0;
        const earlyPayoff = Math.floor(amount * (1 + (monthsEarly * 0.1)));
        totalPoints = earlyPayoff;
        details.monthsEarly = monthsEarly;
        details.basePoints = Math.floor(amount / 20);
        details.multiplier = 1 + (monthsEarly * 0.1);
        break;

      case 'additional_payment':
        const additionalPoints = Math.floor(amount / 25) * 2;
        totalPoints = additionalPoints;
        details.basePoints = Math.floor(amount / 25);
        details.multiplier = 2;
        break;

      default:
        return res.status(400).json({ error: 'Invalid reward type' });
    }

    res.json({
      points: totalPoints,
      details,
      type,
      amount
    });
  } catch (err) {
    next(err);
  }
});

// Update PlaidContractUpdate interface to match schema
interface PlaidContractUpdate {
  status?: string;
  plaidAccessToken?: string | null;
  plaidAccountId?: string | null;
  achVerificationStatus?: string | null;
  lastPaymentId?: string | null;
  lastPaymentStatus?: string | null;
}

router.patch("/contracts/:id", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const contractId = parseInt(req.params.id);
    const updates: Partial<typeof contracts.$inferInsert> = {};

    // Map the updates with proper typing
    if (req.body.status) updates.status = req.body.status;
    if ('plaid_access_token' in req.body) updates.plaidAccessToken = req.body.plaid_access_token;
    if ('plaid_account_id' in req.body) updates.plaidAccountId = req.body.plaid_account_id;
    if ('ach_verification_status' in req.body) updates.achVerificationStatus = req.body.ach_verification_status;
    if ('last_payment_id' in req.body) updates.lastPaymentId = req.body.last_payment_id;
    if ('last_payment_status' in req.body) updates.lastPaymentStatus = req.body.last_payment_status;

    const [updatedContract] = await db
      .update(contracts)
      .set(updates)
      .where(eq(contracts.id, contractId))
      .returning();

    res.json(updatedContract);
  } catch (err) {
    next(err);
  }
});

router.post("/plaid/process-payment", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { public_token, account_id, amount, contractId, requireAchVerification } = req.body;

    // Exchange public token for access token
    const tokenResponse = await PlaidService.exchangePublicToken(public_token);
    const accessToken = tokenResponse.access_token;

    // If ACH verification is required, initiate micro-deposits
    if (requireAchVerification) {
      await PlaidService.initiateAchVerification(accessToken, account_id);

      // Store the verification details in the database
      await db.update(contracts)
        .set({
          status: 'ach_verification_pending',
          plaid_access_token: accessToken,
          plaid_account_id: account_id,
          ach_verification_status: 'pending'
        })
        .where(eq(contracts.id, contractId));

      return res.json({
        status: 'pending',
        achConfirmationRequired: true,
        message: 'ACH verification initiated'
      });
    }

    // If no verification required or already verified, proceed with payment
    const transfer = await PlaidService.createTransfer({
      accessToken,
      accountId: account_id,
      amount: amount.toString(),
      description: `Contract ${contractId} Payment`,
      achClass: 'ppd'
    });

    // Update contract with transfer details
    await db.update(contracts)
      .set({
        status: 'payment_processing',
        lastPaymentId: transfer.id,
        lastPaymentStatus: transfer.status
      })
      .where(eq(contracts.id, contractId));

    res.json({
      status: transfer.status,
      transferId: transfer.id
    });

  } catch (err) {
    logger.error('Error processing Plaid payment:', err);
    next(err);
  }
});

router.get("/plaid/payment-status/:transferId", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { transferId } = req.params;

    // Get transfer status from Plaid
    const transfer = await PlaidService.getTransfer(transferId);

    // Get contract details
    const [contract] = await db.select()
      .from(contracts)
      .where(eq(contracts.lastPaymentId, transferId))
      .limit(1);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check if ACH verification is still pending
    const achConfirmationRequired = contract.ach_verification_status === 'pending';
    const achConfirmed = contract.ach_verification_status === 'verified';

    // Update contract with latest status
    await db.update(contracts)
      .set({ lastPaymentStatus: transfer.status })
      .where(eq(contracts.id, contract.id));

    res.json({
      status: transfer.status,
      achConfirmationRequired,
      achConfirmed
    });

  } catch (err) {
    logger.error('Error checking payment status:', err);
    next(err);
  }
});

router.post("/plaid/verify-micro-deposits", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { contractId, amounts } = req.body;

    // Get contract details
    const [contract] = await db.select()
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .limit(1);

    if (!contract || !contract.plaid_access_token || !contract.plaid_account_id) {
      return res.status(404).json({ error: 'Contract or Plaid details not found' });
    }

    // Verify micro-deposits with Plaid
    await PlaidService.verifyMicroDeposits(
      contract.plaid_access_token,
      contract.plaid_account_id,
      amounts
    );

    // Update contract verification status
    await db.update(contracts)
      .set({ ach_verification_status: 'verified' })
      .where(eq(contracts.id, contractId));

    res.json({ status: 'success', message: 'ACH verification completed' });

  } catch (err) {
    logger.error('Error verifying micro-deposits:', err);
    next(err);
  }
});

router.post("/plaid/ledger/start-sweeps", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
      return res.status(400).json({
        status: 'error',
        message: 'Sweep access token not configured'
      });
    }

    await ledgerManager.initializeSweeps();
    res.json({
      status: 'success',
      message: 'Ledger sweep monitoring started'
    });
  } catch (error: any) {
    logger.error('Failed to start sweeps:', error);
    next(error);
  }
});

router.post("/plaid/ledger/stop-sweeps", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    ledgerManager.stopSweeps();
    res.json({
      status: 'success',
      message: 'Ledger sweep monitoring stopped'
    });
  } catch (error: any) {
    logger.error('Failed to stop sweeps:', error);
    next(error);
  }
});

router.post("/plaid/ledger/manual-sweep", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const { type, amount } = req.body;

    if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
      return res.status(400).json({
        status: 'error',
        message: 'Sweep access token not configured'
      });
    }

    if (!['withdraw', 'deposit'].includes(type)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid sweep type. Must be either "withdraw" or "deposit".'
      });
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid amount. Must be a positive number.'
      });
    }

    const result = await ledgerManager.manualSweep(type, amount.toString());
    res.json(result);
  } catch (error: any) {
    logger.error('Manual sweep failed:', error);
    next(error);
  }
});

router.get("/plaid/ledger/balance", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
      return res.status(400).json({
        status: 'error',
        message: 'Sweep access token not configured'
      });
    }

    const balance = await PlaidService.getLedgerBalance();
    res.json({
      status: 'success',
      data: balance
    });
  } catch (error: any) {
    logger.error('Failed to fetch ledger balance:', error);
    next(error);
  }
});

router.post("/plaid/create-link-token", async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    logger.info('Creating Plaid link token for user:', { userId });
    const linkToken = await PlaidService.createLinkToken(userId.toString());

    res.json({
      status: 'success',
      linkToken: linkToken.link_token
    });
  } catch (err) {
    logger.error('Error creating Plaid link token:', err);
    next(err);
  }
});

// Helper function declarations
async function generateVerificationToken(): Promise<string> {
  throw new Error("Function not implemented.");
}

async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  throw new Error("Function not implemented.");
}

async function sendMerchantCredentials(email: string, username: string, password: string): Promise<void> {
  throw new Error("Function not implemented.");
}

async function testSendGridConnection(): Promise<boolean> {
  throw new Error("Function not implemented.");
}

declare global {
  namespace Express {
    interface User {
      id: number;
      role: string;
      email?: string;
      name?: string;
      phoneNumber?: string;
    }

    interface Request {
      user?: User;
    }
  }
  var io: SocketIOServer;
}

export type VerificationStatus = 'initialized' | 'retrieved' | 'confirmed' | 'declined' | 'Approved' | 'Declined';

export interface DiditWebhookPayload {
  session_id: string;
  status: VerificationStatus;
  created_at: number;
  timestamp: number;
  userId: string;
  data?: {
    verificationStatus: string;
    documentData?: any;
  };
  error?: {
    code: string;
    message: string;
  };
  vendor_data?: string;
  decision?: {
    kyc?: {
      document_data?: any;
    };
  };
}

export type UserRole = 'admin' | 'merchant' | 'customer';

export default router;