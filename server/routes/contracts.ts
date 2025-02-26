import express, { Response, NextFunction } from "express";
import { asyncHandler } from "../lib/async-handler";
import { db } from "@db";
import { contracts, users, ContractStatus } from "@db/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = express.Router();

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

// Middleware to authenticate requests
const authenticate = (req: RequestWithUser, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Not authenticated" });
  }
  next();
};

// Middleware to check role authorization
const authorize = (roles: string[]) => {
  return (req: RequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Unauthorized" });
    }
    next();
  };
};

// Get contracts for customer
router.get("/customer", authenticate, authorize(["customer"]), 
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      if (!req.user) {
        // This shouldn't happen due to authenticate middleware, but just in case
        return res.status(401).json({
          status: "error",
          message: "Authentication required"
        });
      }
      
      const userId = req.user.id;
      
      logger.info(`[Contracts] Getting contracts for customer ${userId}`, {
        userId,
        auth: !!req.headers.authorization,
        userRole: req.user.role,
        timestamp: new Date().toISOString()
      });
      
      try {
        // Explicitly convert userId to number
        const userIdNumber = typeof userId === 'string' ? parseInt(userId) : userId;
        
        const customerContracts = await db
          .select()
          .from(contracts)
          .where(eq(contracts.customerId, userIdNumber))
          .orderBy(desc(contracts.createdAt));
        
        logger.info(`[Contracts] Found ${customerContracts.length} contracts for customer ${userId}`);
        
        // Add debug data to response in development
        let responseData: any = {
          status: "success",
          data: customerContracts
        };
        
        if (process.env.NODE_ENV !== 'production') {
          responseData._debug = {
            userId,
            userIdType: typeof userId,
            userIdNumber,
            contractsFound: customerContracts.length
          };
        }
        
        // Set proper Content-Type header
        res.setHeader('Content-Type', 'application/json');
        return res.json(responseData);
      } catch (dbError) {
        logger.error("[Contracts] Database error in customer contracts:", {
          error: dbError instanceof Error ? dbError.message : "Unknown error",
          userId,
          timestamp: new Date().toISOString()
        });
        
        return res.status(500).json({
          status: "error",
          message: "Failed to fetch contracts - database error"
        });
      }
    } catch (error) {
      logger.error("[Contracts] Error fetching customer contracts:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch contracts"
      });
    }
  })
);

// Create contract offer
router.post("/create-offer", authenticate, authorize(["admin", "merchant", "customer"]),
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const { customerId, amount, term, interestRate, contractNumber: providedContractNumber } = req.body;
      
      // Debug
      logger.debug("Creating contract offer:", { 
        user: req.user?.id, 
        role: req.user?.role, 
        customerId, 
        amount, 
        term, 
        interestRate,
        providedContractNumber,
        hasAuth: !!req.headers.authorization
      });
      
      // For customer role, we always use their own ID
      const finalCustomerId = req.user?.role === "customer" 
        ? req.user.id 
        : customerId;
      
      logger.info(`User ${req.user?.id} (${req.user?.role}) creating contract for customer ${finalCustomerId}`);
      
      if (!finalCustomerId) {
        return res.status(400).json({
          status: "error",
          message: "Customer ID is required"
        });
      }
      
      // Verify the customer exists
      const [customer] = await db
        .select()
        .from(users)
        .where(eq(users.id, finalCustomerId))
        .limit(1);
      
      if (!customer) {
        return res.status(404).json({
          status: "error",
          message: "Customer not found"
        });
      }
      
      // Generate or use provided contract number
      const contractNumber = providedContractNumber || `LOAN-${Date.now().toString().slice(-6)}-${finalCustomerId}`;
      
      // Create contract offer with proper TypeScript typing
      const contractData = {
        merchantId: req.user?.role === "merchant" ? req.user.id : 1, // Default to merchant ID 1 if not specified
        customerId: finalCustomerId,
        amount: amount.toString(),
        term: term,
        interestRate: interestRate.toString(),
        contractNumber: contractNumber,
        status: ContractStatus.PENDING,
        borrowerPhone: customer.phoneNumber,
        borrowerEmail: customer.email
      };
      
      const [newContract] = await db.insert(contracts)
        .values(contractData)
        .returning();
      
      return res.json({
        status: "success", // Changed to match other endpoints
        data: newContract
      });
    } catch (error) {
      console.error("Error creating contract offer:", error);
      logger.error("Contract creation error details:", error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({
        status: "error", // Changed to match other endpoints
        message: "Failed to create contract offer"
      });
    }
  })
);

// Get specific contract details
router.get("/:id", authenticate, 
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const contractId = parseInt(req.params.id);
      
      if (isNaN(contractId)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid contract ID"
        });
      }
      
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);
      
      if (!contract) {
        return res.status(404).json({
          status: "error",
          message: "Contract not found"
        });
      }
      
      // Check authorization - only allow access to user's own contracts or admin
      if (req.user?.role !== "admin" && 
          req.user?.role !== "merchant" && 
          contract.customerId !== req.user?.id) {
        return res.status(403).json({
          status: "error",
          message: "Unauthorized to view this contract"
        });
      }
      
      return res.json({
        status: "success",
        data: contract
      });
    } catch (error) {
      logger.error("Error fetching contract details:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch contract details"
      });
    }
  })
);

// Update contract status
router.patch("/:id/status", authenticate, authorize(["admin", "merchant"]),
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const contractId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (isNaN(contractId)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid contract ID"
        });
      }
      
      if (!Object.values(ContractStatus).includes(status)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid status"
        });
      }
      
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);
      
      if (!contract) {
        return res.status(404).json({
          status: "error",
          message: "Contract not found"
        });
      }
      
      // Update contract status
      const [updatedContract] = await db
        .update(contracts)
        .set({ status: status as any })
        .where(eq(contracts.id, contractId))
        .returning();
      
      return res.json({
        status: "success",
        data: updatedContract
      });
    } catch (error) {
      logger.error("Error updating contract status:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to update contract status"
      });
    }
  })
);

// Get contracts for merchant
router.get("/merchant/:merchantId", authenticate, authorize(["admin", "merchant"]),
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      
      // For merchant role, only allow access to their own contracts
      if (req.user?.role === "merchant" && req.user.id !== merchantId) {
        return res.status(403).json({
          status: "error",
          message: "Unauthorized to view these contracts"
        });
      }
      
      const merchantContracts = await db
        .select()
        .from(contracts)
        .where(eq(contracts.merchantId, merchantId))
        .orderBy(desc(contracts.createdAt));
      
      return res.json({
        status: "success",
        data: merchantContracts
      });
    } catch (error) {
      logger.error("Error fetching merchant contracts:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch contracts"
      });
    }
  })
);

// Accept contract offer (customer)
router.post("/:id/accept", authenticate, authorize(["customer"]),
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const contractId = parseInt(req.params.id);
      const userId = req.user?.id;
      
      if (isNaN(contractId)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid contract ID"
        });
      }
      
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);
      
      if (!contract) {
        return res.status(404).json({
          status: "error",
          message: "Contract not found"
        });
      }
      
      // Verify this contract belongs to the user
      if (contract.customerId !== userId) {
        return res.status(403).json({
          status: "error",
          message: "Unauthorized to accept this contract"
        });
      }
      
      // Verify the contract is in a pending state
      if (contract.status !== ContractStatus.PENDING) {
        return res.status(400).json({
          status: "error",
          message: "Contract is not in a pending state"
        });
      }
      
      // Update contract status to accepted
      const [updatedContract] = await db
        .update(contracts)
        .set({ status: ContractStatus.ACTIVE as any }) // When accepted, the contract becomes active
        .where(eq(contracts.id, contractId))
        .returning();
      
      return res.json({
        status: "success",
        data: updatedContract
      });
    } catch (error) {
      logger.error("Error accepting contract:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to accept contract"
      });
    }
  })
);

// Decline contract offer (customer)
router.post("/:id/decline", authenticate, authorize(["customer"]),
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const contractId = parseInt(req.params.id);
      const userId = req.user?.id;
      
      if (isNaN(contractId)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid contract ID"
        });
      }
      
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);
      
      if (!contract) {
        return res.status(404).json({
          status: "error",
          message: "Contract not found"
        });
      }
      
      // Verify this contract belongs to the user
      if (contract.customerId !== userId) {
        return res.status(403).json({
          status: "error",
          message: "Unauthorized to decline this contract"
        });
      }
      
      // Verify the contract is in a pending state
      if (contract.status !== ContractStatus.PENDING) {
        return res.status(400).json({
          status: "error",
          message: "Contract is not in a pending state"
        });
      }
      
      // Update contract status to cancelled
      const [updatedContract] = await db
        .update(contracts)
        .set({ status: ContractStatus.CANCELLED as any })
        .where(eq(contracts.id, contractId))
        .returning();
      
      return res.json({
        status: "success",
        data: updatedContract
      });
    } catch (error) {
      logger.error("Error declining contract:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to decline contract"
      });
    }
  })
);

export default router;