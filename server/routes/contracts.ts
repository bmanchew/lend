import express, { Response } from "express";
import { asyncHandler } from "../lib/async-handler";
import { authService } from "../auth";
import { db } from "@db";
import { contracts, merchants, users, ContractStatus } from "@db/schema";
import { logger } from "../lib/logger";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

interface RequestWithUser extends express.Request {
  user?: {
    id: number;
    role: string;
    email?: string;
    name?: string;
    phoneNumber?: string;
    username: string;
  };
}

const router = express.Router();

// Authentication middleware
const authenticate = (req: RequestWithUser, res: Response, next: Function) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = authService.verifyJWT(token);
    
    req.user = decoded as any;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid or expired token'
    });
  }
};

// Authorization middleware
const authorize = (roles: string[]) => {
  return (req: RequestWithUser, res: Response, next: Function) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: insufficient permissions'
      });
    }
    
    next();
  };
};

// Create a contract offer
router.post(
  "/create-offer",
  authenticate,
  authorize(["admin", "merchant", "customer"]),
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const { customerId, merchantId, amount, term, interestRate } = req.body;
      
      // Use the current user as customer if not provided
      const userId = customerId || req.user?.id;
      
      if (!userId) {
        return res.status(400).json({
          status: "error",
          message: "Customer ID is required",
        });
      }
      
      // Check if the user already has a pending contract offer
      const existingOffers = await db.query.contracts.findMany({
        where: and(
          eq(contracts.customerId, userId),
          eq(contracts.status, ContractStatus.PENDING)
        )
      });
      
      if (existingOffers.length > 0) {
        return res.json({
          status: "success",
          message: "Contract offer already exists",
          contract: existingOffers[0]
        });
      }
      
      // Create a unique contract number
      const contractNumber = `SHIFI-${Date.now().toString().slice(-6)}-${userId}`;
      
      // Set default values if not provided
      const contractAmount = amount || 5000;
      const contractTerm = term || 36;
      const contractInterestRate = interestRate || 24.99;
      
      // Calculate monthly payment (simplified)
      const monthlyRate = contractInterestRate / 100 / 12;
      const monthlyPayment = (contractAmount * monthlyRate * Math.pow(1 + monthlyRate, contractTerm)) / 
                            (Math.pow(1 + monthlyRate, contractTerm) - 1);
      
      // Calculate total interest
      const totalInterest = (monthlyPayment * contractTerm) - contractAmount;
      
      // If customer created the offer, use a default merchant (first active merchant)
      let merchantIdToUse = merchantId;
      if (!merchantIdToUse && req.user?.role === 'customer') {
        const firstMerchant = await db.query.merchants.findFirst({
          where: eq(merchants.active, true)
        });
        merchantIdToUse = firstMerchant?.id || 1; // Use default if none found
      }
      
      // Create the contract offer
      const newContract = await db.insert(contracts).values({
        merchantId: merchantIdToUse,
        customerId: userId,
        contractNumber,
        amount: contractAmount.toString(),
        term: contractTerm,
        interestRate: contractInterestRate.toString(),
        status: ContractStatus.PENDING,
        monthlyPayment: monthlyPayment.toFixed(2),
        totalInterest: totalInterest.toFixed(2),
        downPayment: (contractAmount * 0.05).toFixed(2), // 5% down payment
      }).returning();
      
      res.json({
        status: "success",
        message: "Contract offer created successfully",
        contract: newContract[0]
      });
    } catch (error: any) {
      logger.error("Error creating contract offer:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to create contract offer",
      });
    }
  })
);

// Get customer contracts
router.get(
  "/customer",
  authenticate,
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }
      
      const customerContracts = await db.query.contracts.findMany({
        where: eq(contracts.customerId, userId)
      });
      
      res.json({
        status: "success",
        contracts: customerContracts
      });
    } catch (error: any) {
      logger.error("Error fetching customer contracts:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch contracts",
      });
    }
  })
);

// Generate contract offer after KYC verification
router.post(
  "/post-kyc-offer",
  authenticate,
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }
      
      // Get the user to check KYC status
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
      });
      
      if (!user) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }
      
      // Check if KYC is verified
      if (user.kycStatus !== 'Approved' && user.kycStatus !== 'confirmed') {
        return res.status(400).json({
          status: "error",
          message: "KYC verification is required before receiving offers",
          kycStatus: user.kycStatus
        });
      }
      
      // Check if the user already has an offer
      const existingOffer = await db.query.contracts.findFirst({
        where: and(
          eq(contracts.customerId, userId),
          eq(contracts.status, ContractStatus.PENDING)
        )
      });
      
      if (existingOffer) {
        return res.json({
          status: "success",
          message: "Contract offer already exists",
          contract: existingOffer
        });
      }
      
      // Create a default contract offer
      const amount = 5000; // Default amount
      const term = 36; // 36 months
      const interestRate = 24.99; // Default interest rate
      const contractNumber = `SHIFI-${Date.now().toString().slice(-6)}-${userId}`;
      
      // Calculate monthly payment
      const monthlyRate = interestRate / 100 / 12;
      const monthlyPayment = (amount * monthlyRate * Math.pow(1 + monthlyRate, term)) / 
                           (Math.pow(1 + monthlyRate, term) - 1);
      
      // Calculate total interest
      const totalInterest = (monthlyPayment * term) - amount;
      
      // Get default merchant (first active merchant)
      const defaultMerchant = await db.query.merchants.findFirst({
        where: eq(merchants.active, true)
      });
      
      const merchantId = defaultMerchant?.id || 1; // Use default if none found
      
      // Create the contract offer
      const newContract = await db.insert(contracts).values({
        merchantId,
        customerId: userId,
        contractNumber,
        amount: amount.toString(),
        term,
        interestRate: interestRate.toString(),
        status: ContractStatus.PENDING,
        monthlyPayment: monthlyPayment.toFixed(2),
        totalInterest: totalInterest.toFixed(2),
        downPayment: (amount * 0.05).toFixed(2), // 5% down payment
      }).returning();
      
      logger.info("Created contract offer after KYC verification", { 
        userId, 
        contractId: newContract[0].id
      });
      
      res.json({
        status: "success",
        message: "Contract offer created successfully after KYC verification",
        contract: newContract[0]
      });
    } catch (error: any) {
      logger.error("Error creating post-KYC contract offer:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to create contract offer",
      });
    }
  })
);

// Get contracts by status
router.get(
  "/by-status/:status",
  authenticate,
  authorize(["admin", "merchant"]),
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const { status } = req.params;
      
      if (!Object.values(ContractStatus).includes(status as ContractStatus)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid contract status",
        });
      }
      
      const contractsByStatus = await db.query.contracts.findMany({
        where: eq(contracts.status, status as ContractStatus)
      });
      
      res.json({
        status: "success",
        contracts: contractsByStatus
      });
    } catch (error: any) {
      logger.error("Error fetching contracts by status:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch contracts",
      });
    }
  })
);

export default router;