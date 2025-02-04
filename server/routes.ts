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

// Update phone number formatting for existing users
const standardizePhoneNumber = async () => {
  try {
    const allUsers = await db
      .select()
      .from(users)
      .where(eq(users.role, 'customer'));

    for (const user of allUsers) {
      if (!user.phoneNumber) continue;

      const parsedPhone = parsePhoneNumberFromString(user.phoneNumber, 'US');
      if (parsedPhone && parsedPhone.isValid()) {
        const formattedPhone = parsedPhone.format('E.164');
        if (formattedPhone !== user.phoneNumber) {
          await db
            .update(users)
            .set({ phoneNumber: formattedPhone })
            .where(eq(users.id, user.id));

          console.log('[Routes] Standardized phone number:', {
            userId: user.id,
            oldPhone: user.phoneNumber,
            newPhone: formattedPhone,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  } catch (err) {
    console.error('[Routes] Error standardizing phone numbers:', err);
  }
};

// Add cleanup job for expired OTPs
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

    console.log('[Routes] Cleaned up expired OTPs');
  } catch (err) {
    console.error('[Routes] Error cleaning up expired OTPs:', err);
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredOTPs, 5 * 60 * 1000);

// Run phone number standardization on startup
standardizePhoneNumber();

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

  // Update phone number validation logic in the send-otp endpoint
apiRouter.post("/auth/send-otp", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Clean and normalize the phone number
    let cleanedNumber = phoneNumber.replace(/[^\d+]/g, '');

    // Handle various input formats
    if (!cleanedNumber.startsWith('+')) {
      // Remove leading 1 if present
      cleanedNumber = cleanedNumber.replace(/^1/, '');
      // Add +1 prefix
      cleanedNumber = `+1${cleanedNumber}`;
    }

    // Parse with libphonenumber-js
    const parsedPhone = parsePhoneNumberFromString(cleanedNumber);

    if (!parsedPhone || !parsedPhone.isValid()) {
      console.error('[Routes] Invalid phone number format:', {
        input: phoneNumber,
        cleaned: cleanedNumber,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({
        error: "Please provide a valid US phone number",
        details: "Examples: +15551234567, (555) 123-4567, or 5551234567"
      });
    }

    // Format to E.164 for consistency
    const formattedPhone = parsedPhone.format('E.164');

    console.log('[Routes] Phone number processed:', {
      original: phoneNumber,
      cleaned: cleanedNumber,
      formatted: formattedPhone,
      timestamp: new Date().toISOString()
    });

    // Find existing user or create new one
    let user = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, formattedPhone))
      .limit(1)
      .then(rows => rows[0]);

    if (user && user.role !== 'customer') {
      console.error('[Routes] Invalid account type for OTP:', {
        userId: user.id,
        role: user.role,
        timestamp: new Date().toISOString()
      });
      return res.status(403).json({ error: 'Invalid account type for OTP login' });
    }

    const otp = smsService.generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 5);

    if (!user) {
      user = await db
        .insert(users)
        .values({
          username: formattedPhone.replace(/\D/g, ''),
          password: Math.random().toString(36).slice(-8),
          email: `${formattedPhone.replace(/\D/g, '')}@temp.shifi.com`,
          name: '',
          role: 'customer',
          phoneNumber: formattedPhone,
          lastOtpCode: otp,
          otpExpiry,
          kycStatus: 'pending'
        })
        .returning()
        .then(rows => rows[0]);

      console.log('[Routes] Created new user:', {
        userId: user.id,
        phone: formattedPhone,
        timestamp: new Date().toISOString()
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
        phone: formattedPhone,
        timestamp: new Date().toISOString()
      });
    }

    // Send OTP via SMS
    const sent = await smsService.sendOTP(formattedPhone, otp);

    if (sent) {
      console.log('[Routes] OTP sent successfully:', {
        userId: user.id,
        phone: formattedPhone,
        timestamp: new Date().toISOString()
      });
      res.json({
        success: true,
        userId: user.id
      });
    } else {
      console.error('[Routes] Failed to send OTP:', {
        phoneNumber: formattedPhone,
        userId: user.id,
        timestamp: new Date().toISOString()
      });
      res.status(500).json({ error: "Failed to send OTP. Please try again." });
    }
  } catch (err) {
    console.error("[Routes] Error sending OTP:", err);
    next(err);
  }
});

  // Verify OTP endpoint
  apiRouter.post("/auth/verify-otp", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { otp } = req.body;

      if (!otp) {
        return res.status(400).json({ error: "OTP is required" });
      }

      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, parseInt(String(req.body.userId))))
        .limit(1)
        .then(rows => rows[0]);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check OTP validity
      if (!user.lastOtpCode || !user.otpExpiry) {
        console.error('[Routes] No OTP found for user:', {
          userId: user.id,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: "No OTP found. Please request a new one." });
      }

      if (new Date() > new Date(user.otpExpiry)) {
        console.error('[Routes] OTP expired:', {
          userId: user.id,
          expiry: user.otpExpiry,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: "OTP has expired. Please request a new one." });
      }

      if (user.lastOtpCode !== otp) {
        console.error('[Routes] Invalid OTP:', {
          userId: user.id,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: "Invalid OTP" });
      }

      // Clear OTP after successful verification
      await db
        .update(users)
        .set({
          lastOtpCode: null,
          otpExpiry: null
        })
        .where(eq(users.id, user.id));

      console.log('[Routes] OTP verified successfully:', {
        userId: user.id,
        timestamp: new Date().toISOString()
      });

      // Return success with user ID
      res.json({
        success: true,
        userId: user.id,
        role: user.role
      });
    } catch (err) {
      console.error("[Routes] Error verifying OTP:", err);
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