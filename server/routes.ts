import { Router } from 'express';
import type { Request, Response, NextFunction } from "express";
import { db } from "@db";
import { users, contracts, merchants, programs, webhookEvents, ContractStatus, WebhookEventStatus, PaymentStatus } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import express from 'express';
import NodeCache from 'node-cache';
import { Server as SocketIOServer } from 'socket.io';
import { smsService } from "./services/sms";
import { calculateMonthlyPayment, calculateTotalInterest } from "./services/loan-calculator";
import { logger } from "./lib/logger";
import { slackService } from "./services/slack";
import { PlaidService } from './services/plaid';
import { shifiRewardsService } from './services/shifi-rewards';
import jwt from 'jsonwebtoken';
import { authService } from "./auth";
import type { User } from "./auth";
import { asyncHandler } from './lib/async-handler';
import { sendMerchantCredentials } from './services/email';

// Updated type declarations for better type safety
interface RequestWithUser extends Request {
  user?: User;
}

interface LoggerError extends Error {
  details?: any;
  code?: string;
  status?: number;
}

// Enhanced error class for consistent error handling
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

// Middleware to ensure consistent error handling
const errorHandler = (err: Error | APIError | LoggerError, req: Request, res: Response, next: NextFunction) => {
  const errorLog = {
    message: err.message,
    name: err.name,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  };

  logger.error('[Error Handler]', errorLog);

  if (err instanceof APIError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      details: err.details
    });
  }

  // Handle validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err
    });
  }

  return res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

const router = Router();

// Define public routes that don't require JWT verification
const PUBLIC_ROUTES = [
  '/login',
  '/auth/register',
  '/health',
  '/',
  '/apply',
  '/auth/customer',
  '/auth/merchant',
  '/auth/admin'
];

// JWT verification middleware - skip for public routes
router.use(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const path = req.path;

  // Skip JWT verification for public routes
  if (PUBLIC_ROUTES.some(route => path.startsWith(route))) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = authService.verifyJWT(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
});

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
    res.send = function (body: any): any {
      apiCache.set(key, body, duration);
      return originalSend.call(this, body);
    };

    next();
  };
};

// Add input validation middleware
const validateId = (req: Request, res: Response, next: NextFunction) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID parameter' });
  }
  req.params.id = id.toString();
  next();
};

// Register core middleware
router.use(requestTrackingMiddleware);
router.use(cacheMiddleware(300));

// Protected Routes (JWT Required)
router.get("/auth/me", asyncHandler(async (req: RequestWithUser, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.json(req.user);
}));

// Updated contract status route with proper type handling
router.post("/contracts/:id/status", asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validate status
  if (!Object.values(ContractStatus).includes(status)) {
    return res.status(400).json({ error: 'Invalid contract status' });
  }

  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, parseInt(id)))
    .limit(1);

  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }

  const updates = {
    status,
    lastPaymentId: req.body.lastPaymentId || null,
    lastPaymentStatus: req.body.lastPaymentStatus as PaymentStatus || null
  };

  const [updatedContract] = await db
    .update(contracts)
    .set(updates)
    .where(eq(contracts.id, parseInt(id)))
    .returning();

  return res.json(updatedContract);
}));

router.get("/customers/:id/contracts", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const customerContracts = await db.select().from(contracts)
      .where(eq(contracts.customerId, userId))
      .orderBy(desc(contracts.createdAt));

    logger.info("Found contracts for customer:", customerContracts);
    return res.json(customerContracts);
  } catch (err: any) {
    logger.error("Error fetching customer contracts:", err);
    next(err);
  }
}));


// Get merchant by user ID - Ensure JSON response
router.get("/merchants/by-user/:userId", asyncHandler(async (req: RequestWithUser, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    logger.info("[Merchant Lookup] Attempting to find merchant for userId:", {
      userId,
      path: req.path,
      method: req.method,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });

    if (!userId || isNaN(userId)) {
      logger.error("[Merchant Lookup] Invalid user ID:", { userId });
      return res.status(400).json({
        status: 'error',
        error: 'Invalid user ID'
      });
    }

    const merchantResults = await db
      .select()
      .from(merchants)
      .where(eq(merchants.userId, userId));

    logger.info("[Merchant Lookup] Query results:", {
      userId,
      resultsCount: merchantResults.length,
      results: merchantResults
    });

    const [merchant] = merchantResults;
    if (!merchant) {
      logger.error("[Merchant Lookup] No merchant found for user:", { userId });
      return res.status(404).json({
        status: 'error',
        error: 'Merchant not found'
      });
    }

    // Set proper content type for JSON response
    res.setHeader('Content-Type', 'application/json');
    return res.json({
      status: 'success',
      data: merchant
    });
  } catch (err: any) {
    logger.error("[Merchant Lookup] Error fetching merchant:", {
      error: err.message,
      stack: err.stack,
      userId: req.params.userId
    });
    return res.status(500).json({
      status: 'error',
      error: 'Error fetching merchant data',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

router.get("/merchants/:id/contracts", validateId, asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const merchantId = parseInt(req.params.id);
    logger.info("[Routes] Fetching contracts for merchant:", { merchantId, timestamp: new Date().toISOString() });

    const merchantContracts = await db.query.contracts.findMany({
      where: eq(contracts.merchantId, merchantId),
      with: {
        customer: true,
      },
    });

    return res.json(merchantContracts);
  } catch (err: any) {
    logger.error("Error fetching merchant contracts:", err);
    next(err);
  }
}));

// Add to your merchants/create endpoint handler
router.post("/merchants/create", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const requestId = Date.now().toString(36);
  logger.info("[Merchant Creation] Received request:", {
    requestId,
    body: {
      ...req.body,
      password: '[REDACTED]'
    },
    timestamp: new Date().toISOString()
  });

  try {
    const { companyName, email, phoneNumber, address, website } = req.body;

    // Validate required fields
    if (!email || !companyName) {
      logger.error("[Merchant Creation] Missing required fields", {
        requestId,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({
        error: 'Email and company name are required',
        missingFields: {
          email: !email,
          companyName: !companyName
        }
      });
    }

    // Generate secure temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);

    // Check for existing user first
    logger.info("[Merchant Creation] Checking for existing user with email:", {
      requestId,
      email,
      timestamp: new Date().toISOString()
    });

    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let merchantUser;
    if (existingUser.length > 0) {
      // Update existing user to merchant role if not already
      if (existingUser[0].role !== 'merchant') {
        [merchantUser] = await db
          .update(users)
          .set({
            role: 'merchant',
            phoneNumber,
            password: await authService.hashPassword(tempPassword)
          })
          .where(eq(users.id, existingUser[0].id))
          .returning();

        logger.info("[Merchant Creation] Updated existing user to merchant:", {
          requestId,
          userId: merchantUser.id,
          timestamp: new Date().toISOString()
        });
      } else {
        merchantUser = existingUser[0];
      }
    } else {
      // Create new user
      logger.info("[Merchant Creation] Creating new merchant user account", {
        requestId,
        timestamp: new Date().toISOString()
      });

      [merchantUser] = await db
        .insert(users)
        .values({
          username: email,
          password: await authService.hashPassword(tempPassword),
          email,
          name: companyName,
          role: 'merchant',
          phoneNumber,
          kycStatus: 'pending'
        } as typeof users.$inferInsert)
        .returning();
    }

    // Create merchant record
    const [merchant] = await db
      .insert(merchants)
      .values({
        userId: merchantUser.id,
        companyName,
        address,
        website: website || null,
        status: 'active',
        reserveBalance: '0',
        phone: phoneNumber
      } as typeof merchants.$inferInsert)
      .returning();

    // Create default 24-month 0% APR program
    await db.insert(programs).values({
      merchantId: merchant.id,
      name: "Standard Financing",
      term: 24,
      interestRate: "0",
      status: "active"
    } as typeof programs.$inferInsert);

    // Send welcome email with credentials
    const emailSent = await sendMerchantCredentials(
      email,
      email, // username is same as email
      tempPassword
    );

    if (!emailSent) {
      logger.warn("[Merchant Creation] Failed to send welcome email", {
        requestId,
        merchantId: merchant.id,
        email
      });
    }

    // Try to send Slack notification, but don't fail if it errors
    try {
      await slackService.notifyLoanApplication({
        merchantName: companyName,
        customerName: email,
        amount: 0,
        phone: phoneNumber || 'Not provided'
      });
    } catch (slackError) {
      logger.warn("[Merchant Creation] Failed to send Slack notification", {
        error: slackError instanceof Error ? slackError.message : 'Unknown error',
        requestId
      });
    }

    logger.info("[Merchant Creation] Successfully created merchant:", {
      requestId,
      merchantId: merchant.id,
      timestamp: new Date().toISOString()
    });

    return res.status(201).json({
      merchant,
      user: merchantUser,
      credentialsSent: emailSent
    });

  } catch (err) {
    logger.error("[Merchant Creation] Error:", {
      requestId,
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined
    });
    next(err);
  }
}));

router.get("/merchants", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  logger.info("[Merchants] Fetching all merchants", { timestamp: new Date().toISOString() });
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

    return res.json(merchantsWithPrograms);
  } catch (err: any) {
    logger.error("Error fetching all merchants:", err);
    next(err);
  }
}));

router.post("/merchants/:id/programs", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  logger.info("[Programs] Creating new program:", { ...req.body, timestamp: new Date().toISOString() });
  const { name, term, interestRate } = req.body;
  const merchantId = parseInt(req.params.id);

  const [program] = await db.insert(programs).values({
    merchantId,
    name,
    term,
    interestRate,
  } as typeof programs.$inferInsert).returning();

  return res.json(program);
}));

router.get("/merchants/:id/programs", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const merchantId = parseInt(req.params.id);
    const merchantPrograms = await db
      .select()
      .from(programs)
      .where(eq(programs.merchantId, merchantId));
    return res.json(merchantPrograms);
  } catch (err: any) {
    logger.error("Error fetching merchant programs:", err);
    next(err);
  }
}));

router.get("/contracts", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

    logger.info("[Routes] Successfully fetched contracts:", { count: allContracts.length, timestamp: new Date().toISOString() });
    return res.json(allContracts);
  } catch (err) {
    logger.error("[Routes] Error fetching contracts:", err);
    next(err);
  }
}));

router.post("/contracts", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

    return res.json(newContract);
  } catch (err) {
    logger.error("[Routes] Error creating contract:", err);
    next(err);
  }
}));

// Add webhook event handling with proper types
router.post("/webhooks/process", asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { eventType, sessionId, payload } = req.body;

  await db.insert(webhookEvents).values({
    eventType,
    sessionId,
    status: WebhookEventStatus.PENDING,
    payload: JSON.stringify(payload),
    error: null,
    retryCount: 0,
    processedAt: null
  });

  return res.json({ status: 'success' });
}));

// Update webhook event status
router.patch("/webhooks/:id/status", asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;
  const { status, error } = req.body;

  if (!Object.values(WebhookEventStatus).includes(status)) {
    return res.status(400).json({ error: 'Invalid webhook status' });
  }

  const [updatedEvent] = await db
    .update(webhookEvents)
    .set({
      status,
      error: error || null,
      processedAt: status === WebhookEventStatus.COMPLETED ? new Date() : null
    })
    .where(eq(webhookEvents.id, parseInt(id)))
    .returning();

  return res.json(updatedEvent);
}));

router.get("/rewards/balance", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

    return res.json({
      balance: balance,
      lifetimeEarned: balanceData?.lifetimeEarned || 0
    });
  } catch (err) {
    next(err);
  }
}));

router.post("/merchants/:id/send-loan-application", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
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
      logger.error('[LoanApplication] Missing APP_URL environment variable', { timestamp: new Date().toISOString() });
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
}));

router.get("/rewards/transactions", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const transactions = await shifiRewardsService.getTransactionHistory(req.user.id);
    return res.json(transactions);
  } catch (err) {
    next(err);
  }
}));

router.get("/rewards/calculate", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
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
      case 'payment':
        totalPoints = Math.floor(Number(amount) / 5); // Higher reward for regular payments
        details = {
          basePoints: totalPoints,
          paymentAmount: Number(amount)
        };
        break;
      default:
        return res.status(400).json({ error: 'Invalid reward type' });
    }

    return res.json({
      points: totalPoints,
      details
    });
  } catch (err) {
    next(err);
  }
}));

router.get("/rewards/potential", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const amount = parseFloat(req.query.amount as string);
    const type = req.query.type as string;

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    let totalPoints = 0;
    const details: Record<string, any> = {};

    switch (type) {
      case 'down_payment':
        totalPoints = Math.floor(amount / 10);
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

      case 'additionalpayment':
        const additionalPoints = Math.floor(amount / 25) * 2;
        totalPoints = additionalPoints;
        details.basePoints = Math.floor(amount / 25);
        details.multiplier = 2;
        break;

      default:
        return res.status(400).json({ error: 'Invalid reward type' });
    }

    return res.json({
      points: totalPoints,
      details,
      type,
      amount
    });
  } catch (err) {
    next(err);
  }
}));

router.patch("/contracts/:id", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const contractId = parseInt(req.params.id);
    const updates: Partial<typeof contracts.$inferInsert>> = {};

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

    return res.json(updatedContract);
  } catch (err) {
    next(err);
  }
}));

router.post("/plaid/process-payment", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

    return res.json({
      status: transfer.status,
      transferId: transfer.id
    });

  } catch (err) {
    logger.error('Error processing Plaid payment:', err);
    next(err);
  }
}));

router.get("/plaid/payment-status/:transferId", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

    return res.json({
      status: transfer.status,
      achConfirmationRequired,
      achConfirmed
    });

  } catch (err) {
    logger.error('Error checking payment status:', err);
    next(err);
  }
}));

router.post("/plaid/verify-micro-deposits", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
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

    return res.json({ status: 'success', message: 'ACH verification completed' });

  } catch (err) {
    logger.error('Error verifying micro-deposits:', err);
    next(err);
  }
}));

router.post("/plaid/ledger/start-sweeps", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
      return res.status(400).json({
        status: 'error',
        message: 'Sweep access token not configured'
      });
    }

    await ledgerManager.initializeSweeps();
    return res.json({
      status: 'success',
      message: 'Ledger sweep monitoring started'
    });
  } catch (error: any) {
    logger.error('Failed to start sweeps:', error);
    next(error);
  }
}));

router.post("/plaid/ledger/stop-sweeps", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    ledgerManager.stopSweeps();
    return res.json({
      status: 'success',
      message: 'Ledger sweep monitoring stopped'
    });
  } catch (error: any) {
    logger.error('Failed to stop sweeps:', error);
    next(error);
  }
}));

router.post("/plaid/ledger/manual-sweep", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
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
    return res.json(result);
  } catch (error: any) {
    logger.error('Manual sweep failed:', error);
    next(error);
  }
}));

router.get("/plaid/ledger/balance", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
      return res.status(400).json({
        status: 'error',
        message: 'Sweep access token not configured'
      });
    }

    const balance = await PlaidService.getLedgerBalance();
    return res.json({
      status: 'success',
      data: balance
    });
  } catch (error: any) {
    logger.error('Failed to fetch ledger balance:', error);
    next(error);
  }
}));

router.post("/plaid/create-link-token", asyncHandler(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    logger.info('Creating Plaid link token for user:', { userId, timestamp: new Date().toISOString() });
    const linkToken = await PlaidService.createLinkToken(userId.toString());

    return res.json({
      status: 'success',
      linkToken: linkToken.link_token
    });
  } catch (err) {
    logger.error('Error creating Plaid link token:', err);
    next(err);
  }
}));

// Helper function declarations
async function generateVerificationToken(): Promise<string> {
  throw new Error("Function not implemented.");
}

async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
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
      username: string;
      password?: string; // Added optional password field
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

// Add error handler as the last middleware
router.use(errorHandler);

export default router;