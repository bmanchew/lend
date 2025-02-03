import type { Express } from "express";
import { createServer, type Server } from "http";
import { db, checkConnection } from "@db";
import { contracts, merchants, users, verificationSessions, webhookEvents, programs } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { authService } from "./auth";
import { testSendGridConnection, sendVerificationEmail, generateVerificationToken } from "./services/email";
import { Request, Response, NextFunction } from 'express';
import express from 'express';
import NodeCache from 'node-cache';
import morgan from 'morgan';
import { Server as SocketIOServer } from 'socket.io'; // Import Socket.IO

const apiCache = new NodeCache({ stdTTL: 300 }); // 5 min cache

// Morgan logging will be configured in the main Express app setup

function cacheMiddleware(duration: number) {
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
}
import { diditService } from "./services/didit";
import axios from 'axios';
import { smsService } from "./services/sms";
import { calculateMonthlyPayment, calculateTotalInterest } from "./services/loan-calculator";

export type VerificationStatus = 'initialized' | 'retrieved' | 'confirmed' | 'declined' | 'Approved' | 'Declined';

interface DiditWebhookPayload {
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

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  const apiRouter = express.Router();

  apiRouter.get("/customers/:id/contracts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerContracts = await db.query.contracts.findMany({
        where: eq(contracts.customerId, parseInt(req.params.id)),
        orderBy: desc(contracts.createdAt)
      });

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

  apiRouter.get("/verify-sendgrid", async (req:Request, res:Response) => {
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
    } catch (err:any) {
      console.error('SendGrid verification error:', err);
      res.status(500).json({ 
        status: "error", 
        message: err.message || "SendGrid verification failed" 
      });
    }
  });

  apiRouter.get("/test-email", async (req:Request, res:Response) => {
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
    } catch (err:any) {
      console.error('SendGrid test error:', err);
      res.status(500).json({ 
        status: "error", 
        message: err.message || "SendGrid test failed" 
      });
    }
  });

  apiRouter.get("/merchants/by-user/:userId", async (req:Request, res:Response, next:NextFunction) => {
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
    } catch (err:any) {
      console.error("Error fetching merchant by user:", err); 
      next(err);
    }
  });

  apiRouter.get("/merchants/:id/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const merchantContracts = await db.query.contracts.findMany({
        where: eq(contracts.merchantId, parseInt(req.params.id)),
        with: {
          customer: true,
        },
      });
      res.json(merchantContracts);
    } catch (err:any) {
      console.error("Error fetching merchant contracts:", err); 
      next(err);
    }
  });

  apiRouter.post("/merchants/create", async (req:Request, res:Response, next:NextFunction) => {
    try {
      console.log("[Merchant Creation] Received request:", {
        body: req.body,
        timestamp: new Date().toISOString()
      });

      const { companyName, email, phoneNumber, address, website } = req.body;

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

      // Generate random password for new users
        const tempPassword = Math.random().toString(36).slice(-8);
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
          })
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
        })
        .returning();

      // Send login credentials via email
      await sendMerchantCredentials(email, merchantUser.username, tempPassword);

      res.status(201).json({ merchant, user: merchantUser });
    } catch (err) {
      console.error("Error creating merchant:", err);
      next(err);
    }
  });

  apiRouter.get("/merchants", async (req:Request, res:Response, next:NextFunction) => {
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
    } catch (err:any) {
      console.error("Error fetching all merchants:", err); 
      next(err);
    }
  });

  apiRouter.post("/merchants/:id/programs", async (req:Request, res:Response, next:NextFunction) => {
    try {
      console.log("[Programs] Creating new program:", req.body);
      const { name, term, interestRate } = req.body;
      const merchantId = parseInt(req.params.id);

      const [program] = await db.insert(programs).values({
        merchantId,
        name,
        term,
        interestRate,
      }).returning();

      res.json(program);
    } catch (err:any) {
      console.error("Error creating program:", err);
      next(err);
    }
  });

  apiRouter.get("/merchants/:id/programs", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const merchantId = parseInt(req.params.id);
      const merchantPrograms = await db.query.programs.findMany({
        where: eq(programs.merchantId, merchantId)
      });
      res.json(merchantPrograms);
    } catch (err:any) {
      console.error("Error fetching merchant programs:", err);
      next(err);
    }
  });

  apiRouter.get("/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const { status, merchantId } = req.query;

      let query = db.select().from(contracts)
        .leftJoin(merchants, eq(contracts.merchantId, merchants.id))
        .leftJoin(users, eq(contracts.customerId, users.id));

      if (status) {
        query = query.where(eq(contracts.status, status as string));
      }

      if (merchantId) {
        query = query.where(eq(contracts.merchantId, parseInt(merchantId as string)));
      }

      const allContracts = await query.orderBy(desc(contracts.createdAt));

      console.log("[Routes] Successfully fetched contracts:", { count: allContracts.length });
      res.json(allContracts);
    } catch (err:any) {
      console.error("[Routes] Error fetching contracts:", err); 
      next(err);
    }
  });

  apiRouter.post("/contracts", async (req:Request, res:Response, next:NextFunction) => {
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

      // First try to find existing user by phone
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, customerDetails.phone))
        .limit(1);

      // Always update or create user to ensure latest information
      let customer;
      if (existingUser) {
        [customer] = await db
          .update(users)
          .set({
            name: `${customerDetails.firstName} ${customerDetails.lastName}`,
            email: customerDetails.email,
            role: 'customer',
            phoneNumber: customerDetails.phone // Ensure phone number is updated
          })
          .where(eq(users.id, existingUser.id))
          .returning();
      } else {
        [customer] = await db
          .insert(users)
          .values({
            username: customerDetails.phone,
            password: Math.random().toString(36).slice(-8),
            email: customerDetails.email,
            name: `${customerDetails.firstName} ${customerDetails.lastName}`,
            role: 'customer',
            phoneNumber: customerDetails.phone
          })
          .returning();
      }

      // Always send the SMS invitation regardless of existing user

      const monthlyPayment = calculateMonthlyPayment(amount, interestRate, term);
      const totalInterest = calculateTotalInterest(monthlyPayment, amount, term);
      const contractNumber = `LN${Date.now()}`;

      console.log('[Contract Creation] Creating contract with details:', {
        merchantId,
        customerId: customer.id,
        amount,
        fundingAmount: req.body.fundingAmount
      });
      const [newContract] = await db
        .insert(contracts)
        .values({
          merchantId,
          customerId: customer.id,
          contractNumber,
          amount,
          term,
          interestRate,
          downPayment: amount * 0.05,
          monthlyPayment,
          totalInterest,
          status: 'pending_review',
          notes,
          underwritingStatus: 'pending',
          borrowerEmail: customerDetails.email,
          borrowerPhone: customerDetails.phone
        })
        .returning();

      // Emit contract update event
      global.io.to(`merchant_${merchantId}`).emit('contract_update', {
        type: 'new_application',
        contractId: newContract.id,
        status: 'pending_review'
      });

      res.json(newContract);
    } catch (err:any) {
      console.error("[Routes] Error creating contract:", err);
      next(err);
    }
  });

  apiRouter.post("/apply/:token", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firstName, lastName, email, phone } = req.body;

      console.log("[Apply Route] Processing application with details:", {
        firstName,
        lastName,
        email,
        phone
      });

      // Find existing user by phone number
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phone))
        .limit(1);

      if (!existingUser) {
        console.error('[Apply Route] User not found for phone:', phone);
        return res.status(400).json({ error: 'Invalid application link' });
      }

      console.log('[Apply Route] Found existing user:', existingUser);

      // Update user with additional details
      const [user] = await db
        .update(users)
        .set({
          email,
          name: `${firstName} ${lastName}`,
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      console.log('[Apply Route] Updated user details:', user);

      // Start KYC process with explicit userId in URL
      const redirectUrl = `/apply/${user.id}?verification=true`;
      console.log('[Apply Route] Redirecting to:', redirectUrl);

      res.json({
        userId: user.id,
        redirectUrl
      });
    } catch (err) {
      console.error('Error creating borrower account:', err);
      next(err);
    }
  });

  apiRouter.post("/kyc/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.body;
      console.log('[KYC] Starting verification:', {
        userId,
        headers: req.headers,
        userAgent: req.headers['user-agent'],
        platform: req.body.platform || 'mobile'
      });

      if (!userId) {
        console.error('[KYC] Missing user ID in request');
        return res.status(400).json({ error: 'Missing user ID' });
      }

      // Always force mobile flow
      const platform = 'mobile';
      const isMobileClient = true;

      console.log('Starting KYC process:', {
        userId,
        platform,
        isMobileClient,
        userAgent: req.headers['user-agent']
      });

      // Update user platform
      await db
        .update(users)
        .set({ 
          platform,
          userAgent: req.body.userAgent 
        })
        .where(eq(users.id, userId));

      const sessionUrl = await diditService.initializeKycSession(userId);
      console.log('KYC session initialized:', {
        userId,
        sessionUrl,
        platform
      });

      res.json({ redirectUrl: sessionUrl });
    } catch (err: any) {
      console.error('Error starting KYC process:', err);
      res.status(500).json({ 
        error: 'Failed to start verification process', 
        details: err.message 
      });
    }
  });

  apiRouter.post("/auth/send-otp", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Generate OTP
      const otp = smsService.generateOTP();
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 5); // 5 minute expiry

      // Check if user exists
      let user = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phoneNumber))
        .limit(1)
        .then(rows => rows[0]);

      if (!user) {
        // Create new user if doesn't exist
        user = await db
          .insert(users)
          .values({
            username: phoneNumber.replace(/\D/g, ''),
            password: Math.random().toString(36).slice(-8), // temporary password
            email: `${phoneNumber.replace(/\D/g, '')}@temp.shifi.com`,
            name: '',
            role: 'borrower',
            phoneNumber: phoneNumber,
            lastOtpCode: otp,
            otpExpiry: otpExpiry,
            platform: 'mobile',
            kycStatus: 'pending'
          })
          .returning()
          .then(rows => rows[0]);
      } else {
        // Update existing user's OTP
        await db
          .update(users)
          .set({ 
            lastOtpCode: otp,
            otpExpiry: otpExpiry
          })
          .where(eq(users.id, user.id));
      }

      // Check if user exists and verify role
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phoneNumber))
        .limit(1)
        .then(rows => rows[0]);

      if (existingUser && existingUser.role !== 'customer') {
        console.error('[Routes] Attempted OTP send to non-customer account:', phoneNumber);
        return res.status(403).json({ error: "Invalid authentication method for this account type" });
      }

      // Send OTP via SMS
      const sent = await smsService.sendOTP(phoneNumber, otp);

      if (sent) {
        console.log('[Routes] Successfully sent OTP to:', phoneNumber);
        res.json({ success: true });
      } else {
        console.error('[Routes] Failed to send OTP to:', phoneNumber);
        res.status(500).json({ error: "Failed to send OTP" });
      }
    } catch (err) {
      console.error("Error sending OTP:", err);
      next(err);
    }
  });

  apiRouter.get("/kyc/auto-start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, parseInt(userId as string)))
        .limit(1);

      if (!user || user.kycStatus === 'verified') {
        return res.json({ status: user?.kycStatus || 'not_started' });
      }

      const sessionUrl = await diditService.initializeKycSession(parseInt(userId as string));
      res.json({ redirectUrl: sessionUrl });
    } catch (err) {
      next(err);
    }
  });

  apiRouter.get("/kyc/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.query.userId;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const parsedUserId = parseInt(userId as string);
      if (isNaN(parsedUserId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const [latestSession] = await db
        .select()
        .from(verificationSessions)
        .where(eq(verificationSessions.userId, parsedUserId))
        .orderBy(desc(verificationSessions.createdAt))
        .limit(1);

      let status;
      if (latestSession) {
        status = await diditService.getSessionStatus(latestSession.sessionId);

        // Update the session status if it has changed
        if (status !== latestSession.status) {
          await db
            .update(verificationSessions)
            .set({ 
              status: status as VerificationStatus,
              updatedAt: new Date()
            })
            .where(eq(verificationSessions.sessionId, latestSession.sessionId));
        }
      } else {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, parsedUserId))
          .limit(1);

        status = user?.kycStatus || 'not_started';
      }

      res.json({ 
        status,
        sessionId: latestSession?.sessionId,
        lastUpdated: latestSession?.updatedAt || null
      });
    } catch (err) {
      console.error('Error checking KYC status:', err);
      next(err);
    }
  });

  apiRouter.post("/kyc/webhook", async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[KYC Webhook] Received webhook:', {
        headers: req.headers,
        body: req.body
      });

      const signature = req.headers['x-signature'];
      const timestamp = req.headers['x-timestamp'];
      const rawBody = JSON.stringify(req.body);

      if (!signature || !timestamp) {
        console.error('[KYC Webhook] Missing signature or timestamp headers');
        return res.status(400).json({ error: 'Missing required headers' });
      }

      if (!diditService.verifyWebhookSignature(rawBody, signature as string, timestamp as string)) {
        console.error('[KYC Webhook] Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      const payload = req.body as DiditWebhookPayload;
      if (!payload || !payload.session_id) {
        console.error('[KYC Webhook] Invalid payload received');
        return res.status(400).json({ error: 'Invalid payload' });
      }

      console.log('[KYC Webhook] Processing webhook:', {
        sessionId: payload.session_id,
        status: payload.status
      });

      await diditService.processWebhook(payload);

      return res.json({ status: 'success' });
    } catch (err) {
      console.error('Error processing Didit webhook:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  apiRouter.post("/kyc/retry-webhooks", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await diditService.retryFailedWebhooks();
      res.json({ status: 'success' });
    } catch (err) {
      next(err);
    }
  });

  apiRouter.get("/kyc/sessions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await db
        .select({
          id: verificationSessions.id,
          userId: verificationSessions.userId,
          sessionId: verificationSessions.sessionId,
          status: verificationSessions.status,
          features: verificationSessions.features,
          createdAt: verificationSessions.createdAt,
          updatedAt: verificationSessions.updatedAt
        })
        .from(verificationSessions)
        .orderBy(desc(verificationSessions.createdAt));

      res.json(sessions);
    } catch (err) {
      console.error('Error fetching verification sessions:', err);
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

    // Log the full application details
    console.log("[LoanApplication] Received new application:", {
      merchantId: req.params.id,
      phone: req.body.phone,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      amount: req.body.amount || req.body.fundingAmount,
      timestamp: new Date().toISOString(),
      requestId,
      url: req.url,
      userAgent: req.headers['user-agent']
    });

    // Store application attempt in webhook_events table
    console.log('[Webhook] Starting event insertion');

    const [event] = await db
      .insert(webhookEvents)
      .values({
        eventType: 'loan_application_attempt',
        sessionId: `loan_app_${Date.now()}`, // Ensure unique session ID
        status: 'pending',
        sessionId: 'loan_app_' + requestId,
        payload: JSON.stringify({
          merchantId: req.params.id,
          phone: req.body.phone,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          amount: req.body.amount || req.body.fundingAmount,
          timestamp: new Date().toISOString(),
          userAgent: req.headers['user-agent'],
          stage: 'initiation',
          requestId
        }),
        status: 'received'
      }).returning();

      // Track merchant activity
      await db.insert(webhookEvents).values({
        eventType: 'merchant_activity',
        payload: JSON.stringify({
          merchantId: req.params.id,
          action: 'send_application',
          timestamp: new Date().toISOString(),
          details: {
            borrowerPhone: req.body.phone,
            amount: req.body.amount || req.body.fundingAmount,
            requestId
          }
        }),
        status: 'recorded'
      });

      global.io.to(`merchant_${req.params.id}`).emit('application_update', {
        type: 'loan_application_attempt',
        data: event[0]
      });

    debugLog('Starting loan application process', {
      body: req.body,
      merchantId: req.params.id,
      timestamp: new Date().toISOString()
    });

    try {
      debugLog('Request received', {
        body: req.body,
        params: req.params,
        url: req.url,
        timestamp: new Date().toISOString()
      });

      // Initial validation
      const { phone: borrowerPhone, firstName, lastName, amount, fundingAmount } = req.body;
      const merchantId = parseInt(req.params.id);

      if (!borrowerPhone || !firstName || !lastName || (!amount && !fundingAmount)) {
        debugLog('Missing required fields:', { borrowerPhone, firstName, lastName, amount, fundingAmount });
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (isNaN(merchantId)) {
        debugLog('Invalid merchant ID:', req.params.id);
        return res.status(400).json({ error: 'Invalid merchant ID' });
      }

      // Verify merchant exists
      const merchantRecord = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1)
        .then(rows => rows[0]);

      if (!merchantRecord) {
        debugLog('Merchant not found:', merchantId);
        return res.status(404).json({ error: 'Merchant not found' });
      }

      debugLog('Found merchant:', merchantRecord);
      debugLog('Parsed request data:', {
        merchantId,
        borrowerPhone,
        firstName,
        lastName,
        amount: amount || fundingAmount
      });


      // Validate amount
      const parsedAmount = parseFloat(amount || fundingAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        debugLog('Invalid amount:', amount || fundingAmount);
        return res.status(400).json({ error: 'Invalid amount' });
      }

      // Normalize phone number
      const cleanPhone = (borrowerPhone || '').toString().replace(/\D/g, '').slice(-10);
      const formattedPhone = '+1' + cleanPhone;

      // First check if user exists
      debugLog('Looking up existing user with phone:', formattedPhone);
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, formattedPhone))
        .limit(1);

      debugLog('User lookup result:', existingUser || 'Not found');

      // Always use existing user if found
      let user;
      if (existingUser) {
        // Update existing user's name if it has changed
        if (existingUser.name !== `${firstName} ${lastName}`) {
          [user] = await db
            .update(users)
            .set({ name: `${firstName} ${lastName}` })
            .where(eq(users.id, existingUser.id))
            .returning();
        } else {
          user = existingUser;
        }
      } else {
        // Create new user with unique email based on phone
        const normalizedPhone = (borrowerPhone || '').toString().replace(/\D/g, '');
        const fullPhone = '+1' + normalizedPhone;
        const uniqueEmail = `${normalizedPhone}@temp.shifi.com`;
        [user] = await db
          .insert(users)
          .values({
            username: normalizedPhone,
            password: Math.random().toString(36).slice(-8),
            email: uniqueEmail,
            name: `${firstName} ${lastName}`,
            role: 'customer',
            phoneNumber: fullPhone,            kycStatus: 'pending'
          })
          .returning();
      }

      console.log('Created/Updated user account:', user);

      // Fetch merchant details to include in the SMS
      const [merchant] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }

      // Generate a token using the existing OTP generator
      const applicationToken = smsService.generateOTP();

      // Format and validate phone number
      const phoneDigits = (borrowerPhone || '').replace(/\D/g, '');
      const normalizedPhone = phoneDigits.startsWith('1') ? 
        `+${phoneDigits}` : 
        `+1${phoneDigits.slice(-10)}`;

      if (!normalizedPhone.match(/^\+1[0-9]{10}$/)) {
        debugLog('Invalid phone number format');
        return res.status(400).json({ error: 'Invalid phone number format' });
      }

      // Construct and validate application URL
      const baseUrl = process.env.APP_URL || 'https://shi-fi-lend-brandon263.replit.app';
      const applicationUrl = `${baseUrl}/login/customer?phone=${encodeURIComponent(phoneDigits)}`;

      try {
        new URL(applicationUrl); // Validate URL format

        debugLog('Sending SMS with:', {
          phone: formattedPhone,
          merchant: merchantRecord.companyName,
          url: applicationUrl
        });

        // Send the SMS invitation
        const result = await smsService.sendLoanApplicationLink(
          formattedPhone,
          merchantRecord.companyName,
          applicationUrl
        );

        if (result.success) {
          debugLog('SMS sent successfully');
          // Create contract record
          const [contract] = await db
            .insert(contracts)
            .values({
              merchantId,
              customerId: user.id,
              contractNumber: `LN${Date.now()}`,
              amount: parsedAmount,
              term: 36, // Default term
              interestRate: 24.99, // Default rate
              status: 'pending_review',
              borrowerEmail: user.email || `${phoneDigits}@temp.shifi.com`,
              borrowerPhone: formattedPhone
            })
            .returning();

          // Emit contract update event to merchant's room
          global.io.to(`merchant_${merchantId}`).emit('contract_update', {
            type: 'new_application',
            contractId: contract.id,
            status: 'pending_review'
          });
          res.json({ 
            status: 'success',
            message: 'Loan application invitation sent successfully',
            applicationUrl
          });
        } else {
          debugLog('SMS failed to send:', result.error);
          res.status(400).json({ 
            error: 'Failed to send loan application invitation',
            details: result.error || 'SMS service returned failure'
          });
        }
      } catch (err) {
        console.error('Error in send-loan-application:', err);
        res.status(500).json({
          error: 'Failed to send loan application invitation',
          details: err.message
        });
      }
    } catch (err) {
      console.error('Error sending loan application invitation:', err);
      next(err);
    }
  });

  class APIError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'APIError';
    }
  }

  // Error handling middleware with improved logging and types
  app.use((err: Error | APIError, _req: Request, res: Response, _next: NextFunction) => {
    const requestId = Date.now().toString(36);
    const errorDetails = {
      requestId,
      name: err.name,
      message: err.message,
      status: (err as APIError).status || 500,
      code: (err as APIError).code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    };

    console.error("[API] Error caught:", errorDetails);

    if (!res.headersSent) {
      const status = errorDetails.status;
      const message = status === 500 ? 'Internal Server Error' : err.message;

      res.status(status).json({
        status: "error",
        message,
        code: errorDetails.code,
        requestId
      });
    }
  });

  app.use('/api', apiRouter);

  const httpServer = createServer(app);
  return httpServer;
}