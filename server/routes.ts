import type { Express } from "express";
import { db } from "@db";
import { contracts, merchants, users, verificationSessions } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { authService } from "./auth";
import express from 'express';
import NodeCache from 'node-cache';
import { diditService } from "./services/didit";
import { smsService } from "./services/sms";
import { calculateMonthlyPayment, calculateTotalInterest } from "./services/loan-calculator";
import { Request, Response, NextFunction } from 'express';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const apiCache = new NodeCache({ stdTTL: 300 }); // 5 min cache

export function registerRoutes(app: Express) {
  setupAuth(app);
  const apiRouter = express.Router();

  // OTP functionality with enhanced phone validation
  apiRouter.post("/auth/send-otp", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Enhanced phone number parsing and validation
      const parsedPhone = parsePhoneNumberFromString(phoneNumber, 'US');
      if (!parsedPhone || !parsedPhone.isValid()) {
        console.error('[Routes] Invalid phone number format:', {
          input: phoneNumber,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: "Invalid phone number format. Please use format: +1 (XXX) XXX-XXXX" });
      }

      // Ensure number is US-based
      if (parsedPhone.country !== 'US') {
        return res.status(400).json({ error: "Only US phone numbers are supported" });
      }

      // Format to E.164 format for Twilio
      const formattedPhone = parsedPhone.format('E.164');

      // Log the formatted number for debugging
      console.log('[Routes] Phone number formatted:', {
        original: phoneNumber,
        formatted: formattedPhone,
        timestamp: new Date().toISOString()
      });

      const otp = smsService.generateOTP();
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 5);

      let user = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, formattedPhone))
        .limit(1)
        .then(rows => rows[0]);

      if (user && user.role !== 'customer') {
        return res.status(403).json({ error: 'Invalid account type for OTP login' });
      }

      if (!user) {
        // Create new user with properly formatted phone number
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
        // Update existing user's OTP
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

      console.log('[Routes] Attempting to send OTP:', {
        phoneNumber: formattedPhone,
        userId: user.id,
        timestamp: new Date().toISOString()
      });

      const sent = await smsService.sendOTP(formattedPhone, otp);

      if (sent) {
        console.log('[Routes] OTP sent successfully:', {
          userId: user.id,
          phone: formattedPhone,
          timestamp: new Date().toISOString()
        });
        res.json({ success: true });
      } else {
        console.error('[Routes] Failed to send OTP:', {
          phoneNumber: formattedPhone,
          userId: user.id,
          timestamp: new Date().toISOString()
        });
        res.status(500).json({ error: "Failed to send OTP. Please try again." });
      }
    } catch (err) {
      console.error("Error sending OTP:", err);
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

  app.use("/api", apiRouter);
}