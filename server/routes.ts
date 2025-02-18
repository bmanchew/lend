import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users, verificationSessions, webhookEvents, programs, rewardsBalances } from "@db/schema"; // Added import for rewardsBalances
import { eq, and, desc } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { authService } from "./auth";
import { testSendGridConnection, sendVerificationEmail, generateVerificationToken, sendMerchantCredentials } from "./services/email";
import express from 'express';
import NodeCache from 'node-cache';
import morgan from 'morgan';
import { Server as SocketIOServer } from 'socket.io';
import { DiditSessionConfig } from './services/didit';
import { diditService } from "./services/didit";
import { smsService } from "./services/sms";
import { calculateMonthlyPayment, calculateTotalInterest } from "./services/loan-calculator";
import { logger } from "./lib/logger";
import { slackService } from "./services/slack"; // Add import for slack service
import { PlaidService } from './services/plaid';
import { LedgerManager } from './services/ledger-manager';
import { shifiRewardsService } from './services/shifi-rewards'; // Added import for shifiRewardsService


// Global type declarations
declare global {
  namespace Express {
    interface User {
      id: number;
      role: string;
      email?: string;
      name?: string;
      phoneNumber?: string;
      platform?: string;
      kycStatus?: string;
      otpExpiry?: Date | null;
      lastOtpCode?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
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

// Route type definitions with improved typing
type RouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

interface RouteConfig {
  path: string;
  method: 'get' | 'post' | 'put' | 'delete';
  handler: RouteHandler;
  middleware?: any[];
  description?: string;
}

// Route grouping by domain
interface RouteGroup {
  prefix: string;
  routes: RouteConfig[];
}

// Middleware type declarations
type RequestTrackingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

type ErrorHandlingMiddleware = (
  err: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction
) => void;

// Request tracking middleware
const requestTrackingMiddleware: RequestTrackingMiddleware = (req, res, next) => {
  const requestId = Date.now().toString(36);
  req.headers['x-request-id'] = requestId;

  console.log(`[API] ${req.method} ${req.path}`, {
    requestId,
    query: req.query,
    body: req.body,
    headers: { ...req.headers, authorization: undefined }
  });

  next();
};

// Cache middleware
const cacheMiddleware = (duration: number): RequestTrackingMiddleware => {
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
    res.send = function (body: any): any {
      apiCache.set(key, body, duration);
      return originalSend.call(this, body);
    };
    next();
  };
};

export function registerRoutes(app: Express): Server {
  const apiRouter = express.Router();

  // Add proper error handling middleware
  const errorHandlingMiddleware: ErrorHandlingMiddleware = (err: Error | APIError, req: Request, res: Response, next: NextFunction) => {
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

  // Register middleware
  apiRouter.use(requestTrackingMiddleware);
  apiRouter.use(errorHandlingMiddleware);


  apiRouter.get("/customers/:id/contracts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      const customerContracts = await db.select().from(contracts)
        .where(eq(contracts.customerId, userId))
        .orderBy(desc(contracts.createdAt));

      console.log("Found contracts for customer:", customerContracts);
      res.json(customerContracts);
    } catch (err: any) {
      console.error("Error fetching customer contracts:", err);
      next(err);
    }
  });

  apiRouter.post("/test-verification-email", async (req: Request, res: Response) => {
    try {
      console.log('Received test email request:', req.body);
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

      console.log('Generating verification token for:', testEmail);
      const token = await generateVerificationToken();

      console.log('Attempting to send verification email to:', testEmail);
      const sent = await sendVerificationEmail(testEmail, token);

      if (sent) {
        console.log('Email sent successfully to:', testEmail);
        return res.json({
          status: "success",
          message: "Verification email sent successfully"
        });
      } else {
        console.error('Failed to send email to:', testEmail);
        return res.status(500).json({
          status: "error",
          message: "Failed to send verification email"
        });
      }
    } catch (err: any) {
      console.error('Test verification email error:', err);
      return res.status(500).json({
        status: "error",
        message: err.message || "Failed to send test email"
      });
    }
  });

  apiRouter.get("/verify-sendgrid", async (req: Request, res: Response) => {
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
      console.error('SendGrid verification error:', err);
      res.status(500).json({
        status: "error",
        message: err.message || "SendGrid verification failed"
      });
    }
  });

  apiRouter.get("/test-email", async (req: Request, res: Response) => {
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
      console.error('SendGrid test error:', err);
      res.status(500).json({
        status: "error",
        message: err.message || "SendGrid test failed"
      });
    }
  });

  apiRouter.get("/merchants/by-user/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.userId);
      console.log("[Merchant Lookup] Attempting to find merchant for userId:", userId);

      if (isNaN(userId)) {
        console.log("[Merchant Lookup] Invalid userId provided:", req.params.userId);
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      console.log("[Merchant Lookup] Executing query for userId:", userId);
      const merchantResults = await db
        .select()
        .from(merchants)
        .where(eq(merchants.userId, userId))
        .limit(1);

      console.log("[Merchant Lookup] Query results:", merchantResults);

      console.log("[Merchant Lookup] Query results:", merchantResults);

      const [merchant] = merchantResults;

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }

      console.log("Found merchant:", merchant);
      res.json(merchant);
    } catch (err: any) {
      console.error("Error fetching merchant by user:", err);
      next(err);
    }
  });

  apiRouter.get("/merchants/:id/contracts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const merchantContracts = await db.query.contracts.findMany({
        where: eq(contracts.merchantId, parseInt(req.params.id)),
        with: {
          customer: true,
        },
      });
      res.json(merchantContracts);
    } catch (err: any) {
      console.error("Error fetching merchant contracts:", err);
      next(err);
    }
  });

  // Fix the merchant creation endpoint with proper types
  apiRouter.post("/merchants/create", async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("[Merchant Creation] Received request:", {
        body: req.body,
        timestamp: new Date().toISOString()
      });

      const { companyName, email, phoneNumber, address, website } = req.body;
      const tempPassword = Math.random().toString(36).slice(-8);

      // Validate required fields
      if (!email || !companyName) {
        console.error("[Merchant Creation] Missing required fields");
        return res.status(400).json({ error: 'Email and company name are required' });
      }

      // Check for existing user first
      console.log("[Merchant Creation] Checking for existing user with email:", email);
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
        console.log("[Merchant Creation] Updated existing user to merchant:", merchantUser);
      } else {

        console.log("[Merchant Creation] Generated temporary password");
        const hashedPassword = await authService.hashPassword(tempPassword);

        console.log("[Merchant Creation] Creating new merchant user account");
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

      console.log("[Merchant Creation] Created merchant user:", {
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
      console.error("Error creating merchant:", err);
      next(err);
    }
  });

  apiRouter.get("/merchants", async (req: Request, res: Response, next: NextFunction) => {
    console.log("[Merchants] Fetching all merchants");
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
      console.error("Error fetching all merchants:", err);
      next(err);
    }
  });

  apiRouter.post("/merchants/:id/programs", async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("[Programs] Creating new program:", req.body);
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
      console.error("Error creating program:", err);
      next(err);
    }
  });

  apiRouter.get("/merchants/:id/programs", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const merchantId = parseInt(req.params.id);
      const merchantPrograms = await db
        .select()
        .from(programs)
        .where(eq(programs.merchantId, merchantId));
      res.json(merchantPrograms);
    } catch (err: any) {
      console.error("Error fetching merchant programs:", err);
      next(err);
    }
  });

  // Fix the contracts table query with proper types
  apiRouter.get("/contracts", async (req: Request, res: Response, next: NextFunction) => {
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

      console.log("[Routes] Successfully fetched contracts:", { count: allContracts.length });
      res.json(allContracts);
    } catch (err) {
      console.error("[Routes] Error fetching contracts:", err);
      next(err);
    }
  });

  // Fix contract creation with proper types
  apiRouter.post("/contracts", async (req: Request, res: Response, next: NextFunction) => {
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
      console.error("[Routes] Error creating contract:", err);
      next(err);
    }
  });

  // Fix webhook event handling with proper types
  apiRouter.post("/webhooks/process", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventType, sessionId, payload } = req.body;

      await db.insert(webhookEvents).values({
        eventType,
        sessionId,
        status: 'pending',
        payload,
        error: null,
        retryCount: 0,
        nextRetryAt: null,
        processedAt: null
      } as typeof webhookEvents.$inferInsert);

      res.json({ status: 'success' });
    } catch (err) {
      next(err);
    }
  });

  // Add rewards endpoints with proper types
  apiRouter.get("/rewards/balance", async (req: Request, res: Response, next: NextFunction) => {
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

  apiRouter.post("/merchants/:id/send-loan-application", async (req: Request, res: Response, next: NextFunction) => {
    const requestId = Date.now().toString(36);
    const debugLog = (message: string, data?: any) => {
      console.log(`[LoanApplication][${requestId}] ${message}`, data || "");
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
        session_id: requestId,
        event_type: 'loan_application_attempt',
        status: 'pending',
        error: null,
        error_message: null,
        payload: JSON.stringify({
          merchantId: parseInt(req.params.id),
          merchantName: merchant.companyName,
          phone: formattedPhone,
          applicationUrl,
          timestamp: new Date().toISOString(),
          requestId
        }),
        created_at: new Date(),
        processed_at: null,
        retry_count: 0
      });

      // Send SMS with enhanced error handling
      const smsResult = await smsService.sendLoanApplicationLink(
        formattedPhone,
        applicationUrl,
        {
          merchantName: merchant.companyName,
          requestId
        }
      );

      if (!smsResult.success) {
        // Update webhook event with error
        await db.update(webhookEvents)
          .set({
            status: 'failed',
            error: smsResult.error,
            error_message: `Failed to send SMS: ${smsResult.error}`,
            processed_at: new Date()
          })
          .where(eq(webhookEvents.session_id, requestId));

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
          processed_at: new Date()
        })
        .where(eq(webhookEvents.session_id, requestId));

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
          error_message: 'Unexpected error during loan application process',
          processed_at: new Date()
        })
        .where(eq(webhookEvents.session_id, requestId));

      next(error);
    }
  });

  apiRouter.get("/auth/verify-otp", async (req: Request, res: Response, next: NextFunction) => {
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
      if (user.lastOtpCode !== otp || user.otpExpiry < new Date()) {
        return res.status(401).json({ error: "Invalid OTP" });
      }

      const token = await authService.generateJWT(user);
      res.json({ token });

    } catch (err) {
      next(err);
    }
  });

  apiRouter.get("/auth/me", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      res.json(req.user);
    } catch (err) {
      next(err);
    }
  });

  apiRouter.post("/auth/logout", async (req: Request, res: Response, next: NextFunction) => {
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


  apiRouter.post("/auth/register", async (req: Request, res: Response, next: NextFunction) => {
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

  // Add rewards endpoints
  apiRouter.get("/rewards/balance", async (req: Request, res: Response, next: NextFunction) => {
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

  apiRouter.get("/rewards/transactions", async (req: Request, res: Response, next: NextFunction) => {
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

  apiRouter.get("/rewards/potential", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const amount = parseFloat(req.query.amount as string);
      const type = req.query.type as string;

      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      let totalPoints = 0;
      switch (type) {
        case 'down_payment':
          totalPoints = Math.floor(amount / 10); // Basic reward for down payment
          break;
        case 'early_payment':
          const monthsEarly = parseInt(req.query.monthsEarly as string) || 0;
          const { earlyPayoff } = calculatePotentialRewards(amount, monthsEarly);
          totalPoints = earlyPayoff;
          break;        case 'additional_payment':
          const { additional } = calculatePotentialRewards(0, 0, amount);
          totalPoints = additional;
          break;
        default:
          return res.status(400).json({ error: 'Invalid reward type' });
      }

      res.json({
        totalPoints,
        type,
        amount
      });
    } catch (err) {
      next(err);
    }
  });

  apiRouter.use(cacheMiddleware(300)); // 5 mins cache

  apiRouter.post("/plaid/process-payment", async (req: Request, res: Response, next: NextFunction) => {
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
          last_payment_id: transfer.id,
          last_payment_status: transfer.status
        })
        .where(eq(contracts.id, contractId));

      res.json({
        status: transfer.status,
        transferId: transfer.id
      });

    } catch (err) {
      console.error('Error processing Plaid payment:', err);
      next(err);
    }
  });

  apiRouter.get("/plaid/payment-status/:transferId", async (req: Request, res: Response, next: NextFunction) => {
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
        .set({ last_payment_status: transfer.status })
        .where(eq(contracts.id, contract.id));

      res.json({
        status: transfer.status,
        achConfirmationRequired,
        achConfirmed
      });

    } catch (err) {
      console.error('Error checking payment status:', err);
      next(err);
    }
  });

  apiRouter.post("/plaid/verify-micro-deposits", async (req: Request, res: Response, next: NextFunction) => {
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
      console.error('Error verifying micro-deposits:', err);
      next(err);
    }
  });

  apiRouter.post("/plaid/ledger/start-sweeps", async (req: Request, res: Response, next: NextFunction) => {
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

  apiRouter.post("/plaid/ledger/stop-sweeps", async (req: Request, res: Response, next: NextFunction) => {
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

  apiRouter.post("/plaid/ledger/manual-sweep", async (req: Request, res: Response, next: NextFunction) => {
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

  apiRouter.get("/plaid/ledger/balance", async (req: Request, res: Response, next: NextFunction) => {
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
  apiRouter.post("/plaid/create-link-token", async (req: Request, res: Response, next: NextFunction) => {
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

  //The existing errorHandlingMiddleware is removed here.
  // Register error handling middleware
  app.use(errorHandlingMiddleware);
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