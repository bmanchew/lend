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

const apiCache = new NodeCache({ stdTTL: 300 }); // 5 min cache

export function registerRoutes(app: Express) {
  setupAuth(app);
  const apiRouter = express.Router();

  // OTP functionality
  apiRouter.post("/auth/send-otp", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      const otp = smsService.generateOTP();
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 5);

      let user = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phoneNumber))
        .limit(1)
        .then(rows => rows[0]);

      if (user && user.role !== 'customer') {
        return res.status(403).json({ error: 'Invalid account type for OTP login' });
      }

      if (!user) {
        user = await db
          .insert(users)
          .values({
            username: phoneNumber,
            password: Math.random().toString(36).slice(-8),
            email: `${phoneNumber}@temp.shifi.com`,
            name: '',
            role: 'customer',
            phoneNumber,
            lastOtpCode: otp,
            otpExpiry,
            kycStatus: 'pending'
          })
          .returning()
          .then(rows => rows[0]);
      } else {
        await db
          .update(users)
          .set({ 
            lastOtpCode: otp,
            otpExpiry
          })
          .where(eq(users.id, user.id));
      }

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
  apiRouter.get("/merchants/by-user/:userId", async (req:Request, res:Response, next:NextFunction) => {
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
    } catch (err:any) {
      console.error("Error fetching merchant by user:", err); 
      next(err);
    }
  });

  app.use("/api", apiRouter);
}