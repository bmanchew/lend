import express, { Response } from "express";
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
const authenticate = (req: RequestWithUser, res: Response, next: Function) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Not authenticated" });
  }
  next();
};

// Middleware to check role authorization
const authorize = (roles: string[]) => {
  return (req: RequestWithUser, res: Response, next: Function) => {
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
      const userId = req.user?.id;
      
      const customerContracts = await db
        .select()
        .from(contracts)
        .where(eq(contracts.customerId, userId as number))
        .orderBy(desc(contracts.createdAt));
      
      return res.json({
        status: "success",
        data: customerContracts
      });
    } catch (error) {
      console.error("Error fetching customer contracts:", error);
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
      const { customerId, amount, term, interestRate } = req.body;
      
      // If customer role, use their own ID
      const finalCustomerId = req.user?.role === "customer" 
        ? req.user.id 
        : customerId;
      
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
      
      // Generate contract number
      const contractNumber = `LOAN-${Date.now().toString().slice(-6)}-${finalCustomerId}`;
      
      // Create contract offer
      const [newContract] = await db.insert(contracts).values({
        customerId: finalCustomerId,
        merchantId: req.user?.role === "merchant" ? req.user.id : 1, // Default to merchant ID 1 if not specified
        amount: amount.toString(),
        term: term,
        interestRate: interestRate.toString(),
        contractNumber: contractNumber,
        status: ContractStatus.PENDING,
        createdAt: new Date()
      }).returning();
      
      return res.json({
        status: "success",
        data: newContract
      });
    } catch (error) {
      console.error("Error creating contract offer:", error);
      return res.status(500).json({
        status: "error",
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
        .set({
          status: status
        })
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
        .set({
          status: ContractStatus.ACTIVE // When accepted, the contract becomes active
        })
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

export default router;