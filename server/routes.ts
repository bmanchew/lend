import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users, verificationSessions, webhookEvents, programs, rewardsBalances } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { authService } from "./auth";
import express, { RequestHandler } from 'express';
import NodeCache from 'node-cache';
import { Server as SocketIOServer } from 'socket.io';
import { DiditSessionConfig } from './services/didit';
import { diditService } from "./services/didit";
import { smsService } from "./services/sms";
import { calculateMonthlyPayment, calculateTotalInterest } from "./services/loan-calculator";
import { logger } from "./lib/logger";
import { slackService } from "./services/slack";
import { PlaidService } from './services/plaid';
import { LedgerManager } from './services/ledger-manager';
import { shifiRewardsService } from './services/shifi-rewards';
import jwt from 'jsonwebtoken';

// Type declarations
export type UserRole = 'admin' | 'merchant' | 'customer';

interface JWTPayload {
  id: number;
  role: UserRole;
  name?: string;
  email?: string;
  phoneNumber?: string;
}

type RequestWithUser = Request & {
  user?: JWTPayload;
};

// Create apiRouter at the top level
const apiRouter = express.Router();

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

// JWT verification middleware with proper type
const verifyJWT: RequestHandler = (req: RequestWithUser, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    req.user = decoded;
    next();
  } catch (err) {
    logger.error('JWT verification failed:', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Request tracking middleware with proper type
const requestTrackingMiddleware: RequestHandler = (req: RequestWithUser, res: Response, next: NextFunction) => {
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

// Cache middleware with proper type
const cacheMiddleware = (duration: number): RequestHandler => {
  const apiCache = new NodeCache({ stdTTL: duration });

  return (req, res, next) => {
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

// Error handling middleware with proper type
const errorHandlingMiddleware: RequestHandler = (err: Error | APIError, req: RequestWithUser, res: Response, next: NextFunction) => {
  const errorId = Date.now().toString(36);
  const isAPIError = err instanceof APIError;

  const errorDetails = {
    id: errorId,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    name: err.name,
    message: err.message,
    status: isAPIError ? err.status : 500,
    code: isAPIError ? err.code : undefined,
    details: isAPIError ? err.details : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };

  // Update webhook event with error
  if (req.headers['x-webhook-id']) {
    db.update(webhookEvents)
      .set({
        status: 'error',
        error: err.message,
        processedAt: new Date()
      })
      .where(eq(webhookEvents.sessionId, req.headers['x-webhook-id'] as string))
      .execute()
      .catch(console.error);
  }

  logger.error('API Error:', errorDetails);

  if (!res.headersSent) {
    res.status(errorDetails.status).json({
      status: 'error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
      errorId
    });
  }

  next();
};

export function registerRoutes(app: Express): Server {
  // Initialize ledger manager with config
  const ledgerConfig = {
    minBalance: 1000,
    maxBalance: 100000,
    sweepThreshold: 500,
    sweepSchedule: '0 */15 * * * *' // Every 15 minutes
  };

  const ledgerManager = LedgerManager.getInstance(ledgerConfig);

  // Initialize ledger sweeps
  ledgerManager.initializeSweeps().catch(error => {
    logger.error('Failed to initialize ledger sweeps:', error);
  });

  // Register middleware with proper types
  apiRouter.use(requestTrackingMiddleware);
  apiRouter.use(verifyJWT);
  apiRouter.use(errorHandlingMiddleware);


  // Protected routes with proper types
  apiRouter.get("/auth/me", verifyJWT, (req: RequestWithUser, res: Response) => {
    res.json(req.user);
  });

  apiRouter.get("/customers/:id/contracts", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.post("/test-verification-email", async (req: RequestWithUser, res: Response) => {
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

  apiRouter.get("/verify-sendgrid", async (req: RequestWithUser, res: Response) => {
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

  apiRouter.get("/test-email", async (req: RequestWithUser, res: Response) => {
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

  apiRouter.get("/merchants/by-user/:userId", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.get("/merchants/:id/contracts", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Fix the merchant creation endpoint with proper types
  apiRouter.post("/merchants/create", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.get("/merchants", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.post("/merchants/:id/programs", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.get("/merchants/:id/programs", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Fix the contracts table query with proper types
  apiRouter.get("/contracts", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Fix contract creation with proper types
  apiRouter.post("/contracts", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Fix webhook event handling with proper types
  apiRouter.post("/webhooks/process", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Rewards endpoints
  apiRouter.get("/rewards/balance", verifyJWT, async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Fix the SMS service call with proper arguments
  apiRouter.post("/merchants/:id/send-loan-application", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Fix the authentication types
  apiRouter.post("/auth/verify-otp", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.get("/auth/me", verifyJWT, async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      res.json(req.user);
    } catch (err) {
      next(err);
    }
  });

  apiRouter.post("/auth/logout", verifyJWT, async (req: RequestWithUser, res: Response, next: NextFunction) => {
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


  apiRouter.post("/auth/register", async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { username, password, email, name, role, phoneNumber } = req.body;
      if (!username || !password || !email || !name || !role || !phoneNumber) {
        return res.status(400).json({ error: "All fields are required" });
      }
      const hashedPassword = await authService.hashPassword(password);
      const user = await db.insert(users).values({
        username, password: hashedPassword, email, name, role, phoneNumber
      } as typeof users.$inferInsert).returning();
      res.json(user);
    } catch (err) {
      next(err);
    }
  });

  apiRouter.get("/rewards/transactions", verifyJWT, async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const transactions = await shifiRewardsService.getTransactionHistory(req.user.id);
      res.json(transactions);
    } catch (err) {
      next(err);
    }
  });

  // Fix rewards calculation endpoint with proper types
  apiRouter.get("/rewards/calculate", verifyJWT, async (req: RequestWithUser, res: Response, next: NextFunction) => {
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
          details = { monthsEarly, basePoints: Mathfloor(Number(amount) / 20) };
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

  // Fix the early_payment case syntax error and update the rewards calculation
  apiRouter.get("/rewards/potential", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Update contract patch endpoint
  apiRouter.patch("/contracts/:id", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Request tracking middleware (Needed for complete code)
  const requestTrackingMiddleware: RequestHandler = (req, res, next) => {
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

  // Cache middleware (Needed for complete code)
  const cacheMiddleware = (duration: number): RequestHandler => {
    const apiCache = new NodeCache({ stdTTL: duration });

    return (req, res, next) => {
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

  // Type declarations (Needed for complete code)
  type RouteHandler = (req: RequestWithUser, res: Response, next: NextFunction) => Promise<void>;

  interface RouteConfig {
    path: string;
    method: 'get' | 'post' | 'put' | 'delete';
    handler: RouteHandler;
    middleware?: any[];
    description?: string;
  }

  interface RouteGroup {
    prefix: string;
    routes: RouteConfig[];
  }

  type RequestTrackingMiddleware = (
    req: RequestWithUser,
    res: Response,
    next: NextFunction
  ) => void;


  interface PlaidContractUpdate {
    status?: string;
    plaidAccessToken?: string | null;
    plaidAccountId?: string | null;
    achVerificationStatus?: string | null;
    lastPaymentId?: string | null;
    lastPaymentStatus?: string | null;
  }

  apiRouter.post("/plaid/process-payment", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.get("/plaid/payment-status/:transferId", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.post("/plaid/verify-micro-deposits", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.post("/plaid/ledger/start-sweeps", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.post("/plaid/ledger/stop-sweeps", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.post("/plaid/ledger/manual-sweep", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.get("/plaid/ledger/balance", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  // Add new route for creating Plaid link tokens
  apiRouter.post("/plaid/create-link-token", async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

  apiRouter.use(cacheMiddleware(300)); // 5 mins cache
  app.use('/api', apiRouter);

  const httpServer = createServer(app);
  // Register error handling middleware (moved to after route registration)
  app.use(errorHandlingMiddleware as RequestHandler);
  return httpServer;
}

function calculatePotentialRewards(amount: number, monthsEarly: number, additionalPayment: number = 0): { earlyPayoff: number; additional: number } {
  // Replace with your actual reward calculation logic
  let earlyPayoff = 0;
  if (monthsEarly > 0) {
    earlyPayoff = monthsEarly * 10; // Example: 10 points per month paid early
  }
  const additional = Math.floor(additionalPayment / 20); // Example: 1 point for every $20 additional payment

  return { earlyPayoff, additional };
}
// Fix contract status update endpoint
apiRouter.post("/contracts/:id/status", verifyJWT, async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

//Missing functions (Placeholder - replace with actual implementations)
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