import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { testSendGridConnection, sendVerificationEmail, generateVerificationToken } from "./services/email";
import { Request, Response, NextFunction } from 'express';
import express from 'express';
import { diditService } from "./services/didit";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // API routes
  const apiRouter = express.Router();

  // Test SendGrid connection with improved error handling
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

  //New route to verify SendGrid setup
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

  // Test SendGrid connection with improved error handling
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

  // Customer routes
  apiRouter.get("/customers/:id/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const customerContracts = await db
        .select({
          id: contracts.id,
          merchantId: contracts.merchantId,
          customerId: contracts.customerId,
          amount: contracts.amount,
          term: contracts.term,
          interestRate: contracts.interestRate,
          status: contracts.status,
          creditScore: contracts.creditScore,
          createdAt: contracts.createdAt,
          merchantName: merchants.companyName,
        })
        .from(contracts)
        .where(eq(contracts.customerId, customerId))
        .leftJoin(merchants, eq(contracts.merchantId, merchants.id));

      res.json(customerContracts);
    } catch (err:any) {
      console.error("Error fetching customer contracts:", err); 
      next(err);
    }
  });

  // Add mock KYC endpoint for development
  if (process.env.NODE_ENV !== 'production') {
    apiRouter.get("/mock-kyc/:sessionId", async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const userId = req.query.userId;

      if (!userId) {
        return res.status(400).send('User ID is required');
      }

      // Extract the user ID from the session ID as a fallback
      const sessionUserId = sessionId.split('-').pop();

      res.send(`
        <html>
          <head>
            <title>Mock KYC Verification</title>
            <script>
              async function completeVerification() {
                try {
                  const userId = '${userId}' || '${sessionUserId}';

                  if (!userId) {
                    alert('User ID not found');
                    return;
                  }

                  console.log('Completing verification for user:', userId);

                  // Call webhook endpoint
                  const response = await fetch('/api/kyc/callback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sessionId: '${sessionId}',
                      userId: parseInt(userId),
                      status: 'verified',
                      timestamp: new Date().toISOString()
                    })
                  });

                  if (!response.ok) {
                    throw new Error('Verification failed');
                  }

                  alert('Verification completed successfully! Redirecting to dashboard...');

                  // Redirect back to dashboard
                  window.location.href = '/customer';
                } catch (error) {
                  console.error('Error:', error);
                  alert('Verification failed: ' + error.message);
                }
              }
            </script>
          </head>
          <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: system-ui;">
            <div style="text-align: center;">
              <h1>Mock KYC Verification</h1>
              <p>Session ID: ${sessionId}</p>
              <p>User ID: ${userId || sessionUserId}</p>
              <button 
                onclick="completeVerification()"
                style="padding: 10px 20px; background: #0070f3; color: white; border: none; border-radius: 5px; cursor: pointer;"
              >
                Complete Verification
              </button>
            </div>
          </body>
        </html>
      `);
    });
  }

  // Merchant routes
  apiRouter.get("/merchants/by-user/:userId", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const [merchant] = await db.query.merchants.findMany({
        where: eq(merchants.userId, parseInt(req.params.userId)),
      });
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

  // Admin routes
  apiRouter.get("/merchants", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const allMerchants = await db.query.merchants.findMany({
        with: {
          user: true,
        },
      });
      res.json(allMerchants);
    } catch (err:any) {
      console.error("Error fetching all merchants:", err); 
      next(err);
    }
  });

  apiRouter.get("/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const allContracts = await db.query.contracts.findMany({
        with: {
          merchant: true,
          customer: true,
        },
      });
      res.json(allContracts);
    } catch (err:any) {
      console.error("Error fetching all contracts:", err); 
      next(err);
    }
  });

  // KYC routes
  apiRouter.post("/kyc/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.body;

      if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ 
          status: "error", 
          message: "Invalid user ID provided" 
        });
      }

      console.log('Starting KYC process for user:', userId);
      const sessionId = await diditService.initializeKycSession(parseInt(userId));

      // For development, we'll use a mock redirect URL
      const redirectUrl = process.env.NODE_ENV === 'production'
        ? `https://verify.didit.com/session/${sessionId}`
        : `http://localhost:5000/mock-kyc/${sessionId}`;

      res.json({ redirectUrl, sessionId });
    } catch (err: any) {
      console.error('KYC initialization error:', err);
      next(err);
    }
  });

  apiRouter.get("/kyc/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.query.userId;

      if (!userId || isNaN(parseInt(userId as string))) {
        return res.status(400).json({ 
          status: "error", 
          message: "Invalid user ID provided" 
        });
      }

      console.log('Checking KYC status for user:', userId);
      const status = await diditService.checkVerificationStatus(parseInt(userId as string));
      res.json({ status });
    } catch (err: any) {
      console.error('KYC status check error:', err);
      next(err);
    }
  });


  // Add Didit webhook handler
  apiRouter.post("/kyc/callback", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { 
        sessionId,
        userId,
        status,
        verificationDetails,
        timestamp 
      } = req.body;

      console.log('Received Didit webhook:', {
        sessionId,
        userId,
        status,
        timestamp,
        headers: req.headers
      });

      // Verify webhook signature if in production
      if (process.env.NODE_ENV === 'production') {
        const signature = req.headers['x-didit-signature'];
        if (!signature) {
          console.error('Missing Didit webhook signature');
          return res.status(401).json({ 
            status: "error", 
            message: "Invalid webhook signature" 
          });
        }
        // TODO: Implement signature verification
      }

      if (!userId || !status) {
        console.error('Invalid webhook payload:', req.body);
        return res.status(400).json({ 
          status: "error", 
          message: "Invalid webhook payload" 
        });
      }

      // Update user KYC status
      await db
        .update(users)
        .set({ 
          kycStatus: status,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(users.id, parseInt(userId)));

      console.log('Updated user KYC status via webhook:', {
        userId,
        newStatus: status,
        sessionId
      });

      // For development, simulate successful verification
      if (process.env.NODE_ENV !== 'production' && status === 'pending') {
        setTimeout(async () => {
          await db
            .update(users)
            .set({ 
              kycStatus: 'verified',
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(users.id, parseInt(userId)));

          console.log('Simulated verification completion for user:', userId);
        }, 5000); // Simulate after 5 seconds
      }

      res.json({ status: "success" });
    } catch (err: any) {
      console.error('Webhook processing error:', err);
      next(err);
    }
  });

  // Global error handler.  This remains outside the apiRouter.
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    console.error("Global error handler caught:", err); 
    if (!res.headersSent) {
      res.status(500).json({ 
        status: "error",
        message: err.message || "Internal server error" 
      });
    }
  });

  // Mount API router under /api prefix
  app.use('/api', apiRouter);

  const httpServer = createServer(app);
  return httpServer;
}