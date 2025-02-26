import { Router } from "express";
import { Request, Response, NextFunction } from "express";
import { db } from "@db";
import {
  users,
  contracts,
  merchants,
  programs,
  webhookEvents,
  ContractStatus,
  WebhookEventStatus,
  PaymentStatus,
  rewardsBalances,
} from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import express from "express";
import NodeCache from "node-cache";
import { rateLimit } from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import { smsService } from "./services/sms";
import {
  calculateMonthlyPayment,
  calculateTotalInterest,
} from "./services/loan-calculator";
import { logger } from "./lib/logger";
import { slackService } from "./services/slack";
import { PlaidService } from "./services/plaid";
import { shifiRewardsService } from "./services/shifi-rewards";
import jwt from "jsonwebtoken";
import { authService } from "./auth";
import type { User } from "./auth";

// Import route modules
import contractsRouter from "./routes/contracts";
import { asyncHandler } from "./lib/async-handler";
import { sendMerchantCredentials } from "./services/email";
import { LedgerManager } from "./services/ledger-manager";
import rewardsRoutes from "./routes/rewards";
import plaidRoutes from "./routes/plaid";
import underwritingApi from "./routes/api/underwriting";
import { diditService } from "./services/didit";
import bodyParser from "body-parser";

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
    public details?: any,
  ) {
    super(message);
    this.name = "APIError";
  }
}

// Middleware to ensure consistent error handling
const errorHandler = (
  err: Error | APIError | LoggerError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const errorLog = {
    message: err.message,
    name: err.name,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  };

  logger.error("[Error Handler]", errorLog);

  if (err instanceof APIError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }

  // Handle validation errors
  if (err.name === "ZodError") {
    return res.status(400).json({
      error: "Validation Error",
      details: err,
    });
  }

  return res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};

const router = express.Router();

// Define public routes that don't require JWT verification
const PUBLIC_ROUTES = [
  "/login",
  "/auth/register",
  "/health",
  "/",
  "/apply",
  "/auth/customer",
  "/auth/merchant",
  "/auth/admin",
];

// JWT verification middleware - skip for public routes
router.use(async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const path = req.path;

    // Skip JWT verification for public routes
    if (PUBLIC_ROUTES.some((route) => path.startsWith(route))) {
      return next();
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    logger.debug(`[Auth] Verifying JWT for path: ${path}`, {
      hasToken: !!token,
      headerPresent: !!authHeader,
      path,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    if (!token) {
      // Return JSON error instead of throwing an error
      return res.status(401).json({
        status: "error",
        message: "Authentication required"
      });
    }

    try {
      const user = await authService.verifyJWT(token);
      if (!user) {
        return res.status(401).json({
          status: "error",
          message: "Invalid or expired token"
        });
      }
      
      req.user = user;
      next();
    } catch (jwtError) {
      logger.error("[Auth] JWT validation error:", {
        error: jwtError instanceof Error ? jwtError.message : "Unknown error",
        path,
        timestamp: new Date().toISOString()
      });
      
      return res.status(401).json({
        status: "error",
        message: jwtError instanceof Error ? jwtError.message : "Invalid token"
      });
    }
  } catch (error) {
    logger.error("[Auth] Auth middleware error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      path,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      status: "error",
      message: "Authentication error"
    });
  }
});

// Request tracking middleware
const requestTrackingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestId = Date.now().toString(36);
  req.headers["x-request-id"] = requestId;

  logger.info(`[API] ${req.method} ${req.path}`, {
    requestId,
    query: req.query,
    body: req.body,
    headers: { ...req.headers, authorization: undefined },
  });

  next();
};

// Cache middleware
const cacheMiddleware = (duration: number) => {
  const apiCache = new NodeCache({ stdTTL: duration });

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();

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
    return res.status(400).json({ error: "Invalid ID parameter" });
  }
  req.params.id = id.toString();
  next();
};

// Register core middleware
router.use(requestTrackingMiddleware);
router.use(cacheMiddleware(300));

// Mount the API routes before any UI routes
router.use("/underwriting", underwritingApi);
router.use("/contracts", contractsRouter);

// Protected Routes (JWT Required)
router.get(
  "/auth/me",
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.json(req.user);
  }),
);

router.post(
  "/sendOTP",
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        throw new APIError(400, "Phone number is required");
      }

      let formattedPhone = phoneNumber.replace(/\D/g, "");
      if (formattedPhone.length === 10) {
        formattedPhone = `+1${formattedPhone}`;
      } else if (
        formattedPhone.length === 11 &&
        formattedPhone.startsWith("1")
      ) {
        formattedPhone = `+${formattedPhone}`;
      }

      if (!formattedPhone.startsWith("+") || formattedPhone.length < 11) {
        throw new APIError(400, "Invalid phone number format");
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, formattedPhone))
        .limit(1);

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

      if (user) {
        await db
          .update(users)
          .set({
            lastOtpCode: otpCode,
            otpExpiry: otpExpiry,
          })
          .where(eq(users.phoneNumber, formattedPhone));
      } else {
        await db.insert(users).values({
          username: formattedPhone,
          password: await authService.hashPassword(otpCode),
          email: `${formattedPhone.substring(1)}@temp.example.com`,
          role: "customer",
          phoneNumber: formattedPhone,
          lastOtpCode: otpCode,
          otpExpiry: otpExpiry,
          kyc_status: "pending",
        });
      }

      const smsResult = await smsService.sendSMS(
        formattedPhone,
        `Your verification code is: ${otpCode}. It will expire in 10 minutes.`,
      );

      if (!smsResult.success) {
        throw new APIError(500, "Failed to send verification code");
      }

      return res.json({
        success: true,
        message: "OTP sent successfully",
      });
    } catch (error) {
      logger.error("[OTP] Error sending OTP:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Handle the error directly
      if (error instanceof APIError) {
        return res.status(error.status).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "An unexpected error occurred",
      });
    }
  }),
);

// Updated contract status route with proper type handling
router.post(
  "/contracts/:id/status",
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!Object.values(ContractStatus).includes(status)) {
      throw new APIError(400, "Invalid contract status");
    }

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, parseInt(id)))
      .limit(1);

    if (!contract) {
      throw new APIError(404, "Contract not found");
    }

    const [updatedContract] = await db
      .update(contracts)
      .set({
        status,
        payment_id: req.body.lastPaymentId || null,
        payment_status: req.body.lastPaymentStatus || null,
      })
      .where(eq(contracts.id, parseInt(id)))
      .returning();

    return res.json(updatedContract);
  }),
);

// Create a contract offer for a customer who has completed KYC
router.post(
  "/contracts/create-offer",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const { customerId, amount = 5000, term = 36, interestRate = 24.99 } = req.body;
        
        if (!customerId) {
          return res.status(400).json({ 
            success: false, 
            message: "Customer ID is required" 
          });
        }

        // Verify customer exists and is KYC verified
        const [customer] = await db
          .select()
          .from(users)
          .where(eq(users.id, customerId))
          .limit(1);
          
        if (!customer) {
          return res.status(404).json({
            success: false,
            message: "Customer not found"
          });
        }
        
        // Check if customer already has a contract
        const existingContracts = await db
          .select()
          .from(contracts)
          .where(eq(contracts.customerId, customerId));
          
        if (existingContracts.length > 0) {
          return res.json({
            success: true,
            message: "Customer already has contracts",
            contract: existingContracts[0]
          });
        }
        
        // Generate a unique contract number
        const contractNumber = `LOAN-${Date.now().toString().slice(-6)}-${customerId}`;
        
        // Get a default merchant (first one in the system)
        const [merchant] = await db
          .select()
          .from(merchants)
          .limit(1);
          
        if (!merchant) {
          return res.status(400).json({
            success: false,
            message: "No merchants available in system"
          });
        }
        
        // Calculate monthly payment and total interest
        const monthlyPayment = calculateMonthlyPayment(
          parseFloat(amount.toString()),
          parseFloat(interestRate.toString()),
          term
        ).toString();
        
        const totalInterest = calculateTotalInterest(
          parseFloat(amount.toString()),
          parseFloat(interestRate.toString()),
          term
        ).toString();
        
        // Create the contract offer
        const [newContract] = await db
          .insert(contracts)
          .values({
            merchantId: merchant.id,
            customerId,
            contractNumber,
            amount: amount.toString(),
            term,
            interestRate: interestRate.toString(),
            status: ContractStatus.PENDING, // Using the ContractStatus enum
            underwritingStatus: "approved", // Pre-approved
            monthlyPayment,
            totalInterest,
            createdAt: new Date()
          } as typeof contracts.$inferInsert)
          .returning();
          
        return res.json({
          success: true,
          message: "Contract offer created successfully",
          contract: newContract
        });
        
      } catch (error) {
        logger.error("Error creating contract offer:", error);
        next(error);
      }
    }
  )
);

router.get(
  "/customers/:id/contracts",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
          return res.status(400).json({ error: "Invalid user ID" });
        }

        const customerContracts = await db
          .select()
          .from(contracts)
          .where(eq(contracts.customerId, userId))
          .orderBy(desc(contracts.createdAt));

        logger.info("Found contracts for customer:", customerContracts);
        return res.json(customerContracts);
      } catch (err: any) {
        logger.error("Error fetching customer contracts:", err);
        next(err);
      }
    },
  ),
);

// Add retry logic and connection error handling
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const withRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        `Database operation failed (attempt ${attempt}/${MAX_RETRIES}):`,
        {
          error: lastError.message,
          attempt,
          timestamp: new Date().toISOString(),
        },
      );

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * attempt),
        );
      }
    }
  }

  throw lastError;
};

// Update the merchant lookup route with retry logic
router.get(
  "/merchants/by-user/:userId",
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    const requestId = Date.now().toString(36);

    logger.info("[Merchant Lookup] Request received:", {
      requestId,
      path: req.path,
      userId: req.params.userId,
      hasAuthHeader: !!req.headers.authorization,
      userInRequest: !!req.user,
      timestamp: new Date().toISOString(),
    });

    try {
      const userId = parseInt(req.params.userId);

      if (!userId || isNaN(userId)) {
        logger.error("[Merchant Lookup] Invalid user ID provided:", {
          userId: req.params.userId,
          requestId,
          timestamp: new Date().toISOString(),
        });
        return res.status(400).json({
          status: "error",
          error: "Invalid user ID format",
        });
      }

      // First check if user exists with retry
      const user = await withRetry(async () => {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        return user;
      });

      if (!user) {
        logger.error("[Merchant Lookup] User not found:", {
          userId,
          requestId,
          timestamp: new Date().toISOString(),
        });
        return res.status(404).json({
          status: "error",
          error: "User not found",
        });
      }

      logger.info("[Merchant Lookup] User found:", {
        userId,
        role: user.role,
        requestId,
        timestamp: new Date().toISOString(),
      });

      // Then get merchant details with retry
      const merchant = await withRetry(async () => {
        const merchantResults = await db
          .select()
          .from(merchants)
          .where(eq(merchants.userId, userId));

        logger.info("[Merchant Lookup] Query executed:", {
          userId,
          foundResults: merchantResults.length > 0,
          requestId,
          timestamp: new Date().toISOString(),
        });

        return merchantResults[0];
      });

      if (!merchant) {
        logger.error("[Merchant Lookup] No merchant found for user:", {
          userId,
          requestId,
          timestamp: new Date().toISOString(),
        });
        return res.status(404).json({
          status: "error",
          error: "Merchant not found",
        });
      }

      // Set cache headers for production
      if (process.env.NODE_ENV === "production") {
        res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
      }

      // Set proper content type
      res.setHeader("Content-Type", "application/json");

      logger.info("[Merchant Lookup] Successfully returning merchant data:", {
        merchantId: merchant.id,
        userId,
        requestId,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        status: "success",
        data: merchant,
      });
    } catch (error) {
      logger.error("[Merchant Lookup] Unexpected error:", {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: req.params.userId,
        requestId,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      return res.status(500).json({
        status: "error",
        error: "Internal server error while fetching merchant data",
      });
    }
  }),
);

router.get(
  "/merchants/:id/contracts",
  validateId,
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const merchantId = parseInt(req.params.id);
        logger.info("[Routes] Fetching contracts for merchant:", {
          merchantId,
          timestamp: new Date().toISOString(),
        });

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
    },
  ),
);

// Add to your merchants/create endpoint handler
router.post(
  "/merchants/create",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      const requestId = Date.now().toString(36);
      logger.info("[Merchant Creation] Received request:", {
        requestId,
        body: {
          ...req.body,
          password: "[REDACTED]",
        },
        timestamp: new Date().toISOString(),
      });

      try {
        const { companyName, email, phoneNumber, address, website } = req.body;

        // Validate required fields
        if (!email || !companyName) {
          logger.error("[Merchant Creation] Missing required fields", {
            requestId,
            timestamp: new Date().toISOString(),
          });
          return res.status(400).json({
            error: "Email and company name are required",
            missingFields: {
              email: !email,
              companyName: !companyName,
            },
          });
        }

        // Generate secure temporary password
        const tempPassword =
          Math.random().toString(36).slice(-8) +
          Math.random().toString(36).slice(-8);

        // Check for existing user first
        logger.info(
          "[Merchant Creation] Checking for existing user with email:",
          {
            requestId,
            email,
            timestamp: new Date().toISOString(),
          },
        );

        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        let merchantUser;
        if (existingUser.length > 0) {
          // Update existing user to merchant role if not already
          if (existingUser[0].role !== "merchant") {
            [merchantUser] = await db
              .update(users)
              .set({
                role: "merchant",
                phoneNumber,
                password: await authService.hashPassword(tempPassword),
              })
              .where(eq(users.id, existingUser[0].id))
              .returning();

            logger.info(
              "[Merchant Creation] Updated existing user to merchant:",
              {
                requestId,
                userId: merchantUser.id,
                timestamp: new Date().toISOString(),
              },
            );
          } else {
            merchantUser = existingUser[0];
          }
        } else {
          // Create new user
          logger.info(
            "[Merchant Creation] Creating new merchant user account",
            {
              requestId,
              timestamp: new Date().toISOString(),
            },
          );

          [merchantUser] = await db
            .insert(users)
            .values({
              username: email,
              password: await authService.hashPassword(tempPassword),
              email,
              name: companyName,
              role: "merchant",
              phoneNumber,
              kyc_status: "pending",
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
            status: "active",
            reserveBalance: "0",
            phone: phoneNumber,
          } as typeof merchants.$inferInsert)
          .returning();

        // Create default 24-month 0% APR program
        await db.insert(programs).values({
          merchantId: merchant.id,
          name: "Standard Financing",
          term: 24,
          interestRate: "0",
          status: "active",
        } as typeof programs.$inferInsert);

        // Send welcome email with credentials
        const emailSent = await sendMerchantCredentials(
          email,
          email, // username is same as email
          tempPassword,
        );

        if (!emailSent) {
          logger.warn("[Merchant Creation] Failed to send welcome email", {
            requestId,
            merchantId: merchant.id,
            email,
          });
        }

        // Try to send Slack notification, but don't fail if it errors
        try {
          await slackService.notifyLoanApplication({
            merchantName: companyName,
            customerName: email,
            amount: 0,
            phone: phoneNumber || "Not provided",
          });
        } catch (slackError) {
          logger.warn("[Merchant Creation] Failed to send Slack notification", {
            error:
              slackError instanceof Error
                ? slackError.message
                : "Unknown error",
            requestId,
          });
        }

        logger.info("[Merchant Creation] Successfully created merchant:", {
          requestId,
          merchantId: merchant.id,
          timestamp: new Date().toISOString(),
        });

        return res.status(201).json({
          merchant,
          user: merchantUser,
          credentialsSent: emailSent,
        });
      } catch (err) {
        logger.error("[Merchant Creation] Error:", {
          requestId,
          error: err instanceof Error ? err.message : "Unknown error",
          stack: err instanceof Error ? err.stack : undefined,
        });
        next(err);
      }
    },
  ),
);

router.get(
  "/merchants",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      logger.info("[Merchants] Fetching all merchants", {
        timestamp: new Date().toISOString(),
      });
      try {
        const allMerchants = await db
          .select({
            merchant: merchants,
            user: users,
            program: programs,
          })
          .from(merchants)
          .leftJoin(users, eq(merchants.userId, users.id))
          .leftJoin(programs, eq(merchants.id, programs.merchantId));

        const merchantsMap = new Map();
        allMerchants.forEach((row) => {
          if (!merchantsMap.has(row.merchant.id)) {
            merchantsMap.set(row.merchant.id, {
              ...row.merchant,
              user: row.user,
              programs: [],
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
    },
  ),
);

router.post(
  "/merchants/:id/programs",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      logger.info("[Programs] Creating new program:", {
        ...req.body,
        timestamp: new Date().toISOString(),
      });
      const { name, term, interestRate } = req.body;
      const merchantId = parseInt(req.params.id);

      const [program] = await db
        .insert(programs)
        .values({
          merchantId,
          name,
          term,
          interestRate,
        } as typeof programs.$inferInsert)
        .returning();

      return res.json(program);
    },
  ),
);

router.get(
  "/merchants/:id/programs",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
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
    },
  ),
);

router.get(
  "/contracts",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const { status, merchantId } = req.query;

        // Start with base query
        const baseQuery = db
          .select({
            contract: contracts,
            merchant: merchants,
            user: users,
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
          conditions.push(
            eq(contracts.merchantId, parseInt(merchantId as string)),
          );
        }

        // Apply conditions if any exist
        const query =
          conditions.length > 0
            ? baseQuery.where(and(...conditions))
            : baseQuery;

        const allContracts = await query.orderBy(desc(contracts.createdAt));

        logger.info("[Routes] Successfully fetched contracts:", {
          count: allContracts.length,
          timestamp: new Date().toISOString(),
        });
        return res.json(allContracts);
      } catch (err) {
        logger.error("[Routes] Error fetching contracts:", err);
        next(err);
      }
    },
  ),
);

// Add these to your routes file

// Endpoint to check KYC status
router.get(
  "/kyc/status",
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const { userId } = req.query;

      if (!userId) {
        throw new APIError(400, "User ID is required");
      }

      const userIdNum = parseInt(userId as string);
      if (isNaN(userIdNum)) {
        throw new APIError(400, "Invalid user ID format");
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userIdNum))
        .limit(1);

      if (!user) {
        throw new APIError(404, "User not found");
      }

      try {
        const status = await diditService.checkVerificationStatus(userIdNum);
        return res.json({
          success: true,
          status: status || user.kyc_status || "pending",
          verified: (status || user.kyc_status) === "verified",
        });
      } catch (error) {
        logger.warn(
          "[KYC] Error checking remote status, falling back to database status",
          {
            userId: userIdNum.toString(),
            error: error instanceof Error ? error.message : "Unknown error",
          },
        );

        return res.json({
          success: true,
          status: user.kyc_status || "pending",
          verified: user.kyc_status === "verified",
        });
      }
    } catch (error) {
      logger.error("[KYC] Error checking status:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      next(error);
    }
  }),
);

// Endpoint to start KYC verification
// Route handler for starting verification (/api/kyc/start)
router.post(
  "/kyc/start",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.id || req.body.userId;
        if (!userId) {
          return res.status(401).json({
            success: false,
            message: "Authentication required",
          });
        }

        const { platform = "web", redirectUrl } = req.body;

        // Check current status first
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        // If already verified or pending, don't start a new session
        if (
          user &&
          (user.kycStatus === "verified" || user.kycStatus === "pending")
        ) {
          logger.info(
            "[KYC] Skipping verification - user already has status:",
            {
              userId,
              currentStatus: user.kycStatus,
            },
          );

          return res.json({
            success: true,
            message: `User already has status: ${user.kycStatus}`,
            alreadyVerified: user.kycStatus === "verified",
            currentStatus: user.kycStatus,
          });
        }

        logger.info("[KYC] Starting verification process", {
          userId,
          platform,
          userAgent: req.headers["user-agent"],
        });

        // Use the Didit service to initialize a verification session
        const verificationUrl = await diditService.initializeKycSession({
          userId,
          platform,
          redirectUrl,
          userAgent: req.headers["user-agent"],
        });

        return res.json({
          success: true,
          verificationUrl,
          message: "KYC verification process initiated",
        });
      } catch (error) {
        logger.error("[KYC] Error starting verification:", error);
        next(error);
      }
    },
  ),
);

// Add verification sessions endpoint for admin dashboard
router.get(
  "/api/kyc/sessions",
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const sessions = await db
        .select()
        .from(verificationSessions)
        .orderBy(desc(verificationSessions.createdAt));

      return res.json(sessions);
    } catch (error) {
      logger.error("[KYC] Error fetching sessions:", error);
      return res.status(500).json({ error: "Failed to fetch sessions" });
    }
  }),
);

router.use(
  "/api/kyc/webhook",
  bodyParser.json({
    verify: (req: any, res, buf, encoding) => {
      if (buf && buf.length) {
        // Store the raw body for webhook signature verification
        req.rawBody = buf.toString(encoding || "utf8");
      }
    },
  }),
);

// Use regular JSON body parser for other routes
router.use(bodyParser.json());

// Webhook endpoint to receive updates from Didit
router.post(
  "/kyc/webhook",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Use the correct header names that Didit is actually sending
      const signature = req.headers["x-signature"] as string;
      const timestamp = req.headers["x-timestamp"] as string;
      const requestBody = JSON.stringify(req.body);

      logger.info("[KYC] Received webhook", {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
        sessionId: req.body.session_id,
        status: req.body.status,
      });

      if (!signature || !timestamp) {
        logger.error("[KYC] Missing webhook headers or body", {
          headers: req.headers,
          bodyLength: Object.keys(req.body).length,
        });
        return res.status(200).json({
          received: true,
          error: "Missing required headers",
        });
      }

      // Verify webhook signature - you may need to update this function as well
      // to use the correct header names
      const isValidSignature = diditService.verifyWebhookSignature(
        requestBody,
        signature,
        timestamp,
      );

      if (!isValidSignature) {
        logger.error("[KYC] Invalid webhook signature", {
          signature,
          timestamp,
          body: req.body,
        });
        // Still return 200 to acknowledge receipt
        return res.status(200).json({
          received: true,
          error: "Invalid signature",
        });
      }

      logger.info("[KYC] Received valid webhook", {
        sessionId: req.body.session_id,
        status: req.body.status,
      });

      // Process the webhook asynchronously
      await diditService.processWebhook(req.body);
      
      // If verification is approved/confirmed, generate a contract offer
      if (req.body.status === "Approved" || req.body.status === "confirmed") {
        try {
          // Look up the verification session to get the user
          const session = await db.query.verificationSessions.findFirst({
            where: eq(verificationSessions.sessionId, req.body.session_id)
          });
          
          if (session && session.userId) {
            logger.info("[KYC] Verification approved, checking for user", {
              sessionId: req.body.session_id,
              userId: session.userId
            });
            
            // Find the user
            const user = await db.query.users.findFirst({
              where: eq(users.id, session.userId)
            });
            
            if (user) {
              // Check if user already has a contract offer
              const existingOffer = await db.query.contracts.findFirst({
                where: and(
                  eq(contracts.customerId, user.id),
                  eq(contracts.status, ContractStatus.PENDING)
                )
              });
              
              // Only create a new offer if one doesn't exist
              if (!existingOffer) {
                logger.info("[KYC] Generating contract offer after successful verification", { 
                  userId: user.id, 
                  session: req.body.session_id 
                });
                
                // Get default merchant
                const defaultMerchant = await db.query.merchants.findFirst({
                  where: eq(merchants.active, true)
                });
                
                const merchantId = defaultMerchant?.id || 1;
                
                // Create a default contract offer
                const amount = 5000; // Default amount
                const term = 36; // 36 months
                const interestRate = 24.99; // Default interest rate
                const contractNumber = `SHIFI-${Date.now().toString().slice(-6)}-${user.id}`;
                
                // Calculate monthly payment
                const monthlyRate = interestRate / 100 / 12;
                const monthlyPayment = (amount * monthlyRate * Math.pow(1 + monthlyRate, term)) / 
                                     (Math.pow(1 + monthlyRate, term) - 1);
                
                // Calculate total interest
                const totalInterest = (monthlyPayment * term) - amount;
                
                try {
                  // Create the contract offer - using camelCase property names matching Drizzle schema
                  const newContract = await db.insert(contracts).values({
                    merchantId: merchantId,
                    customerId: user.id,
                    contractNumber: contractNumber,
                    amount: amount.toString(),
                    term,
                    interestRate: interestRate.toString(),
                    status: ContractStatus.PENDING,
                    monthlyPayment: monthlyPayment.toFixed(2),
                    totalInterest: totalInterest.toFixed(2),
                    downPayment: (amount * 0.05).toFixed(2), // 5% down payment
                  }).returning();
                  
                  logger.info("[KYC] Contract offer created automatically after verification", { 
                    userId: user.id,
                    contractId: newContract[0].id
                  });
                } catch (insertError) {
                  logger.error("[KYC] Error inserting contract offer", { 
                    error: insertError, 
                    userId: user.id 
                  });
                }
              } else {
                logger.info("[KYC] User already has a contract offer, not creating new one", {
                  userId: user.id,
                  existingContractId: existingOffer.id
                });
              }
            }
          }
        } catch (offerError) {
          logger.error("[KYC] Error creating automatic contract offer", { 
            error: offerError,
            sessionId: req.body.session_id
          });
          // Don't fail the webhook response due to contract creation error
        }
      }

      // Return 200 immediately to acknowledge receipt
      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error("[KYC] Error processing webhook:", error);
      // Still return 200 to avoid webhook retries (we handle retries ourselves)
      return res.status(200).json({
        received: true,
        error: "Error processing webhook",
      });
    }
  }),
);

router.get("/kyc/test", (req, res) => {
  res.json({ message: "KYC endpoint is working!" });
});

router.post(
  "/contracts",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const {
          merchantId,
          customerDetails,
          amount,
          term,
          interestRate,
          downPayment = 0,
          notes = "",
        } = req.body;

        // Create customer user record with proper types
        const [customer] = await db
          .insert(users)
          .values({
            username: customerDetails.email,
            password: Math.random().toString(36).slice(-8),
            email: customerDetails.email,
            name: `${customerDetails.firstName} ${customerDetails.lastName}`,
            role: "customer",
            phoneNumber: customerDetails.phone,
            plaidAccessToken: null,
            kyc_status: "pending",
            otp_code: null,
            otp_expiry: null,
            faceIdHash: null,
          } as typeof users.$inferInsert)
          .returning();

        const monthlyPayment = calculateMonthlyPayment(
          amount,
          interestRate,
          term,
        );
        const totalInterest = calculateTotalInterest(
          monthlyPayment,
          amount,
          term,
        );
        const contractNumber = `LN${Date.now()}`;

        // Insert contract with proper types - using camelCase property names matching Drizzle schema
        const [newContract] = await db
          .insert(contracts)
          .values({
            merchantId: merchantId,
            customerId: customer.id,
            contractNumber: contractNumber,
            amount: amount.toString(),
            term: term,
            interestRate: interestRate.toString(),
            downPayment: downPayment.toString(),
            monthlyPayment: monthlyPayment.toString(),
            totalInterest: totalInterest.toString(),
            status: "pending_review",
            notes: notes,
            underwritingStatus: "pending",
            borrowerEmail: customerDetails.email,
            borrowerPhone: customerDetails.phone,
            active: true,
            lastPaymentId: null,
            lastPaymentStatus: null,
          })
          .returning();

        // Get merchant details for notifications
        const [merchant] = await db
          .select()
          .from(merchants)
          .where(eq(merchants.id, merchantId))
          .limit(1);

        if (!merchant) {
          throw new Error("Merchant not found");
        }

        // Send Slack notifications
        await slackService.notifyLoanApplication({
          merchantName: merchant.companyName,
          customerName: `${customerDetails.firstName} ${customerDetails.lastName}`,
          amount,
          phone: customerDetails.phone,
        });

        // Emit contract update event
        global.io?.to(`merchant_${merchantId}`).emit("contract_update", {
          type: "new_application",
          contractId: newContract.id,
          status: "pending_review",
        });

        return res.json(newContract);
      } catch (err) {
        logger.error("[Routes] Error creating contract:", err);
        next(err);
      }
    },
  ),
);

// Add webhook event handling with proper types
router.post(
  "/webhooks/process",
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    const { eventType, sessionId, payload } = req.body;

    await db.insert(webhookEvents).values({
      eventType,
      sessionId,
      status: WebhookEventStatus.PENDING,
      payload: JSON.stringify(payload),
      error: null,
      retryCount: 0,
      processedAt: null,
    });

    return res.json({ status: "success" });
  }),
);

// Update webhook event status
router.patch(
  "/webhooks/:id/status",
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;
    const { status, error } = req.body;

    if (!Object.values(WebhookEventStatus).includes(status)) {
      return res.status(400).json({ error: "Invalid webhook status" });
    }

    const [updatedEvent] = await db
      .update(webhookEvents)
      .set({
        status,
        error: error || null,
        processedAt:
          status === WebhookEventStatus.COMPLETED ? new Date() : null,
      })
      .where(eq(webhookEvents.id, parseInt(id)))
      .returning();

    return res.json(updatedEvent);
  }),
);

router.use("/rewards", rewardsRoutes);
router.use("/plaid", plaidRoutes);
// Note: Old underwriting route removed to prevent conflicts
// router.use('/underwriting', underwritingRoutes);

router.post(
  "/merchants/:id/send-loan-application",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      const requestId = Date.now().toString(36);
      const debugLog = (message: string, data?: any) => {
        logger.info(`[LoanApplication][${requestId}] ${message}`, data || "");
      };

      debugLog("Received application request", {
        body: req.body,
        merchantId: req.params.id,
        timestamp: new Date().toISOString(),
      });

      try {
        // Enhanced phone number validation and formatting
        let phone = req.body.phone?.replace(/[^0-9+]/g, ""); // Keep + sign but remove other non-digits
        if (!phone) {
          return res.status(400).json({
            success: false,
            error: "Phone number is required",
          });
        }

        debugLog("Initial phone cleaning", {
          original: req.body.phone,
          cleaned: phone,
        });

        // Handle various phone formats
        if (phone.startsWith("+1")) {
          phone = phone.substring(2);
        } else if (phone.startsWith("1")) {
          phone = phone.substring(1);
        }

        if (phone.length !== 10) {
          logger.error("[LoanApplication] Invalid phone number format", {
            originalPhone: req.body.phone,
            cleanedPhone: phone,
            length: phone.length,
            requestId,
          });
          return res.status(400).json({
            success: false,
            error:
              "Invalid phone number format. Please provide a 10-digit US phone number.",
          });
        }

        const formattedPhone = `+1${phone}`;
        debugLog("Formatted phone number", {
          original: req.body.phone,
          intermediate: phone,
          formatted: formattedPhone,
        });

        //// Get merchant info for the SMS
        const [merchant] = await db
          .select()
          .from(merchants)
          .where(eq(merchants.id, parseInt(req.params.id)))
          .limit(1);

        if (!merchant) {
          logger.error("[LoanApplication] Merchant not found", {
            merchantId: req.params.id,
            requestId,
          });
          return res.status(404).json({
            success: false,
            error: "Merchant not found",
          });
        }

        // Generate application URL with proper encoding
        const productionUrl =
          "https://79368548-ffca-4dba-b3d2-66878c9daa1e-00-g9bbf0qgfdru.riker.replit.dev";
        const baseUrl = productionUrl.replace(/\/$/, ""); // Remove trailing slash if present
        const applicationUrl = `${baseUrl}/apply/${formattedPhone.substring(1)}`; // Remove + and don't encode

        debugLog("Generated application URL", {
          baseUrl,
          applicationUrl,
          phone: formattedPhone,
        });

        // Store webhook event before sending SMS
        await db.insert(webhookEvents).values({
          eventType: "loan_application_attempt",
          sessionId: requestId,
          status: "pending",
          payload: JSON.stringify({
            merchantId: parseInt(req.params.id),
            merchantName: merchant.companyName,
            phone: formattedPhone,
            applicationUrl,
            timestamp: new Date().toISOString(),
            requestId,
          }),
          error: null,
          retryCount: 0,
          processedAt: null,
        } as typeof webhookEvents.$inferInsert);

        // Send SMS with enhanced error handling
        const smsResult = await smsService.sendLoanApplicationLink(
          formattedPhone,
          applicationUrl,
          merchant.companyName,
          {
            requestId,
            merchantName: merchant.companyName,
          },
        );

        if (!smsResult.success) {
          // Update webhook event with error
          await db
            .update(webhookEvents)
            .set({
              status: "failed",
              error: smsResult.error,
              processedAt: new Date(),
            })
            .where(eq(webhookEvents.sessionId, requestId));

          logger.error("[LoanApplication] Failed to send SMS", {
            error: smsResult.error,
            phone: formattedPhone,
            requestId,
          });

          // Provide more user-friendly error message based on error type
          let userErrorMessage = "Failed to send application link";
          if (smsResult.error?.includes("Invalid 'To' Phone Number")) {
            userErrorMessage =
              "Please provide a valid mobile phone number that can receive SMS messages";
          } else if (smsResult.error?.includes("unsubscribed")) {
            userErrorMessage =
              "This phone number has opted out of receiving messages. Please use a different number or contact support.";
          }

          return res.status(400).json({
            success: false,
            error: userErrorMessage,
            details:
              process.env.NODE_ENV === "development"
                ? smsResult.error
                : undefined,
          });
        }

        // Update webhook event with success
        await db
          .update(webhookEvents)
          .set({
            status: "sent",
            processedAt: new Date(),
          })
          .where(eq(webhookEvents.sessionId, requestId));

        debugLog("Successfully sent application link", {
          phone: formattedPhone,
          url: applicationUrl,
        });

        return res.json({
          success: true,
          message: "Application link sent successfully",
        });
      } catch (error) {
        logger.error("[LoanApplication] Unexpected error", {
          error,
          requestId,
        });

        // Update webhook event with error
        await db
          .update(webhookEvents)
          .set({
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
            processedAt: new Date(),
          })
          .where(eq(webhookEvents.sessionId, requestId));

        next(error);
      }
    },
  ),
);

router.get(
  "/rewards/transactions",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const transactions = await shifiRewardsService.getTransactionHistory(
          req.user.id,
        );
        return res.json(transactions);
      } catch (err) {
        next(err);
      }
    },
  ),
);

router.get(
  "/rewards/calculate",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const { type, amount } = req.query;

        if (!type || !amount || isNaN(Number(amount))) {
          return res.status(400).json({ error: "Invalid parameters" });
        }

        let totalPoints = 0;
        let details: Record<string, any> = {};

        switch (type) {
          case "down_payment":
            totalPoints = Math.floor(Number(amount) / 10); // Basic reward for down payment
            details = { basePoints: totalPoints };
            break;
          case "payment":
            totalPoints = Math.floor(Number(amount) / 5); // Higher reward for regular payments
            details = {
              basePoints: totalPoints,
              paymentAmount: Number(amount),
            };
            break;
          default:
            return res.status(400).json({ error: "Invalid reward type" });
        }

        return res.json({
          points: totalPoints,
          details,
        });
      } catch (err) {
        next(err);
      }
    },
  ),
);

router.get(
  "/rewards/potential",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const amount = parseFloat(req.query.amount as string);
        const type = req.query.type as string;

        if (isNaN(amount) || amount <= 0) {
          return res.status(400).json({ error: "Invalid amount" });
        }

        let totalPoints = 0;
        const details: Record<string, any> = {};

        switch (type) {
          case "down_payment":
            totalPoints = Math.floor(amount / 10);
            details.basePoints = totalPoints;
            break;

          case "early_payment":
            const monthsEarly = parseInt(req.query.monthsEarly as string) || 0;
            const earlyPayoff = Math.floor(amount * (1 + monthsEarly * 0.1));
            totalPoints = earlyPayoff;
            details.monthsEarly = monthsEarly;
            details.basePoints = Math.floor(amount / 20);
            details.multiplier = 1 + monthsEarly * 0.1;
            break;

          case "additionalpayment":
            const additionalPoints = Math.floor(amount / 25) * 2;
            totalPoints = additionalPoints;
            details.basePoints = Math.floor(amount / 25);
            details.multiplier = 2;
            break;

          default:
            return res.status(400).json({ error: "Invalid reward type" });
        }

        return res.json({
          points: totalPoints,
          details,
          type,
          amount,
        });
      } catch (err) {
        next(err);
      }
    },
  ),
);

router.patch(
  "/contracts/:id",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const contractId = parseInt(req.params.id);
        const updates: Partial<typeof contracts.$inferInsert> = {};

        // Map the updates with proper typing
        if (req.body.status) updates.status = req.body.status;
        if ("plaid_access_token" in req.body)
          updates.plaidAccessToken = req.body.plaid_access_token;
        if ("plaid_account_id" in req.body)
          updates.plaidAccountId = req.body.plaid_account_id;
        if ("ach_verification_status" in req.body)
          updates.achVerificationStatus = req.body.ach_verification_status;
        if ("last_payment_id" in req.body)
          updates.payment_id = req.body.last_payment_id;
        if ("last_payment_status" in req.body)
          updates.payment_status = req.body.last_payment_status;

        const [updatedContract] = await db
          .update(contracts)
          .set(updates)
          .where(eq(contracts.id, contractId))
          .returning();

        return res.json(updatedContract);
      } catch (err) {
        next(err);
      }
    },
  ),
);

router.post(
  "/plaid/process-payment",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const {
          public_token,
          account_id,
          amount,
          contractId,
          requireAchVerification,
        } = req.body;

        // Exchange public token for access token
        const tokenResponse =
          await PlaidService.exchangePublicToken(public_token);
        const accessToken = tokenResponse.access_token;
        // If ACH verification is required, initiate micro-deposits
        if (requireAchVerification) {
          await PlaidService.initiateAchVerification(accessToken, account_id);

          // Store the verification details in the database
          await db
            .update(contracts)
            .set({
              status: "ach_verification_pending",
              plaid_access_token: accessToken,
              plaid_account_id: account_id,
              ach_verification_status: "pending",
            })
            .where(eq(contracts.id, contractId));

          return res.json({
            status: "pending",
            achConfirmationRequired: true,
            message: "ACH verification initiated",
          });
        }

        // If no verification required or already verified, proceed with payment
        const transfer = await PlaidService.createTransfer({
          accessToken,
          accountId: account_id,
          amount: amount.toString(),
          description: `Contract ${contractId} Payment`,
          achClass: "ppd",
        });

        // Update contract with transfer details
        await db
          .update(contracts)
          .set({
            status: "payment_processing",
            payment_id: transfer.id,
            payment_status: transfer.status,
          })
          .where(eq(contracts.id, contractId));

        return res.json({
          status: transfer.status,
          transferId: transfer.id,
        });
      } catch (err) {
        logger.error("Error processing Plaid payment:", err);
        next(err);
      }
    },
  ),
);

router.get(
  "/plaid/payment-status/:transferId",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const { transferId } = req.params;

        // Get transfer status from Plaid
        const transfer = await PlaidService.getTransfer(transferId);

        // Get contract details
        const [contract] = await db
          .select()
          .from(contracts)
          .where(eq(contracts.payment_id, transferId))
          .limit(1);

        if (!contract) {
          return res.status(404).json({ error: "Contract not found" });
        }

        // Check if ACH verification is still pending
        const achConfirmationRequired =
          contract.ach_verification_status === "pending";
        const achConfirmed = contract.ach_verification_status === "verified";

        // Update contract with latest status
        await db
          .update(contracts)
          .set({ payment_status: transfer.status })
          .where(eq(contracts.id, contract.id));

        return res.json({
          status: transfer.status,
          achConfirmationRequired,
          achConfirmed,
        });
      } catch (err) {
        logger.error("Error checking payment status:", err);
        next(err);
      }
    },
  ),
);

router.post(
  "/plaid/verify-micro-deposits",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const { contractId, amounts } = req.body;

        // Get contract details
        const [contract] = await db
          .select()
          .from(contracts)
          .where(eq(contracts.id, contractId))
          .limit(1);

        if (
          !contract ||
          !contract.plaid_access_token ||
          !contract.plaid_account_id
        ) {
          return res
            .status(404)
            .json({ error: "Contract or Plaid details not found" });
        }

        // Verify micro-deposits with Plaid
        await PlaidService.verifyMicroDeposits(
          contract.plaid_access_token,
          contract.plaid_account_id,
          amounts,
        );

        // Update contract verification status
        await db
          .update(contracts)
          .set({ ach_verification_status: "verified" })
          .where(eq(contracts.id, contractId));

        return res.json({
          status: "success",
          message: "ACH verification completed",
        });
      } catch (err) {
        logger.error("Error verifying micro-deposits:", err);
        next(err);
      }
    },
  ),
);

router.post(
  "/plaid/ledger/start-sweeps",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
          return res.status(400).json({
            status: "error",
            message: "Sweep access token not configured",
          });
        }

        await ledgerManager.initializeSweeps();
        return res.json({
          status: "success",
          message: "Ledger sweep monitoring started",
        });
      } catch (error: any) {
        logger.error("Failed to start sweeps:", error);
        next(error);
      }
    },
  ),
);

router.post(
  "/plaid/ledger/stop-sweeps",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        ledgerManager.stopSweeps();
        return res.json({
          status: "success",
          message: "Ledger sweep monitoring stopped",
        });
      } catch (error: any) {
        logger.error("Failed to stop sweeps:", error);
        next(error);
      }
    },
  ),
);

router.post(
  "/plaid/ledger/manual-sweep",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const { type, amount } = req.body;

        if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
          return res.status(400).json({
            status: "error",
            message: "Sweep access token not configured",
          });
        }

        if (!["withdraw", "deposit"].includes(type)) {
          return res.status(400).json({
            status: "error",
            message:
              'Invalid sweep type. Must be either "withdraw" or "deposit".',
          });
        }

        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
          return res.status(400).json({
            status: "error",
            message: "Invalid amount. Must be a positive number.",
          });
        }

        const result = await ledgerManager.manualSweep(type, amount.toString());
        return res.json(result);
      } catch (error: any) {
        logger.error("Manual sweep failed:", error);
        next(error);
      }
    },
  ),
);

router.get(
  "/plaid/ledger/balance",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
          return res.status(400).json({
            status: "error",
            message: "Sweep access token not configured",
          });
        }

        const balance = await PlaidService.getLedgerBalance();
        return res.json({
          status: "success",
          data: balance,
        });
      } catch (error: any) {
        logger.error("Failed to fetch ledger balance:", error);
        next(error);
      }
    },
  ),
);

router.post(
  "/plaid/create-link-token",
  asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        logger.info("Creating Plaid link token for user:", {
          userId,
          timestamp: new Date().toISOString(),
        });
        const linkToken = await PlaidService.createLinkToken(userId.toString());

        return res.json({
          status: "success",
          linkToken: linkToken.link_token,
        });
      } catch (err) {
        logger.error("Error creating Plaid link token:", err);
        next(err);
      }
    },
  ),
);

// Helper function declarations
async function generateVerificationToken(): Promise<string> {
  throw new Error("Function not implemented.");
}

async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<boolean> {
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

export type VerificationStatus =
  | "initialized"
  | "retrieved"
  | "confirmed"
  | "declined"
  | "Approved"
  | "Declined";

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

export type UserRole = "admin" | "merchant" | "customer";

// Add error handler as the last middleware
router.use(errorHandler);

export default router;
