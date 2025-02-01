import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users, verificationSessions, webhookEvents, programs } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { testSendGridConnection, sendVerificationEmail, generateVerificationToken } from "./services/email";
import { Request, Response, NextFunction } from 'express';
import express from 'express';
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
      const customerContracts = await db
        .select({
          id: contracts.id,
          merchantId: contracts.merchantId,
          customerId: contracts.customerId,
          amount: contracts.amount,
          term: contracts.term,
          interestRate: contracts.interestRate,
          status: contracts.status,
          downPayment: contracts.downPayment,
          monthlyPayment: contracts.monthlyPayment,
          creditScore: contracts.creditScore,
          signedDocumentUrl: contracts.signedDocumentUrl,
          createdAt: contracts.createdAt
        })
        .from(contracts)
        .orderBy(desc(contracts.createdAt))
        .where(eq(contracts.customerId, parseInt(req.params.id)));

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
        console.log("[Merchant Lookup] Invalid user ID provided");
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      const merchantResults = await db.query.merchants.findMany({
        where: eq(merchants.userId, userId),
      });
      
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

  apiRouter.get("/merchants", async (req:Request, res:Response, next:NextFunction) => {
    console.log("[Merchants] Fetching all merchants");
    try {
      const allMerchants = await db
        .select()
        .from(merchants)
        .leftJoin(users, eq(merchants.userId, users.id))
        .leftJoin(programs, eq(merchants.id, programs.merchantId));

      const merchantsMap = new Map();
      allMerchants.forEach(row => {
        if (!merchantsMap.has(row.merchants.id)) {
          merchantsMap.set(row.merchants.id, {
            ...row.merchants,
            user: row.users,
            programs: []
          });
        }
        if (row.programs) {
          merchantsMap.get(row.merchants.id).programs.push(row.programs);
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
        where: eq(programs.merchantId, merchantId),
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

      // Create or find customer
      const [customer] = await db
        .insert(users)
        .values({
          username: customerDetails.email,
          password: Math.random().toString(36).slice(-8), // Temporary password
          email: customerDetails.email,
          name: `${customerDetails.firstName} ${customerDetails.lastName}`,
          role: 'customer',
          phoneNumber: customerDetails.phone,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            name: `${customerDetails.firstName} ${customerDetails.lastName}`,
            phoneNumber: customerDetails.phone,
          },
        })
        .returning();

      const monthlyPayment = calculateMonthlyPayment(amount, interestRate, term);
      const totalInterest = calculateTotalInterest(monthlyPayment, amount, term);
      const contractNumber = `LN${Date.now()}`;

      const newContract = await db.insert(contracts).values({
        merchantId,
        customerId: customer.id,
        contractNumber,
        amount,
        term,
        interestRate,
        downPayment: amount * 0.05,
        monthlyPayment,
        totalInterest,
        status: 'draft',
        notes,
        underwritingStatus: 'pending',
        borrowerEmail: customerDetails.email,
        borrowerPhone: customerDetails.phone
      }).returning();

      res.json(newContract[0]);
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

      if (!userId) {
        return res.status(400).json({ error: 'Missing user ID' });
      }

      console.log('Starting KYC process for user:', userId);

      const sessionUrl = await diditService.initializeKycSession(userId);
      console.log('Generated KYC session URL:', sessionUrl);

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

      // Save OTP to user record
      await db
        .update(users)
        .set({ 
          lastOtpCode: otp,
          otpExpiry: otpExpiry
        })
        .where(eq(users.phoneNumber, phoneNumber));

      // Send OTP via SMS
      const sent = await smsService.sendOTP(phoneNumber, otp);

      if (sent) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: "Failed to send OTP" });
      }
    } catch (err) {
      console.error("Error sending OTP:", err);
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
    try {
      const { phone: borrowerPhone, firstName, lastName } = req.body;
      const merchantId = parseInt(req.params.id);

      if (!borrowerPhone || !merchantId || !firstName || !lastName) {
        return res.status(400).json({ 
          error: 'Missing required fields' 
        });
      }

      // First check if user exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, borrowerPhone))
        .limit(1);

      // Always use existing user if found by phone number
      let user;
      if (existingUser) {
        user = existingUser;
      } else {
        // Create new user with unique email based on phone
        const uniqueEmail = `${borrowerPhone.replace(/\D/g, '')}@temp.shifi.com`;
        [user] = await db
          .insert(users)
          .values({
            username: borrowerPhone,
            password: Math.random().toString(36).slice(-8),
            email: uniqueEmail,
            name: `${firstName} ${lastName}`,
            role: 'customer',
            phoneNumber: borrowerPhone,
            kycStatus: 'pending'
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

      // Generate a unique application token
      const applicationToken = smsService.generateApplicationToken();

      // Construct the application URL
      const applicationUrl = `https://shi-fi-lend-brandon263.replit.app/apply/${applicationToken}`;

      // Send the SMS invitation
      const sent = await smsService.sendLoanApplicationLink(
        borrowerPhone,
        merchant.companyName,
        applicationUrl
      );

      if (sent) {
        res.json({ 
          status: 'success',
          message: 'Loan application invitation sent successfully',
          applicationUrl
        });
      } else {
        res.status(500).json({ 
          error: 'Failed to send loan application invitation' 
        });
      }
    } catch (err) {
      console.error('Error sending loan application invitation:', err);
      next(err);
    }
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    console.error("Global error handler caught:", err); 
    if (!res.headersSent) {
      res.status(500).json({ 
        status: "error",
        message: err.message || "Internal server error" 
      });
    }
  });

  app.use('/api', apiRouter);

  const httpServer = createServer(app);
  return httpServer;
}