import express, { Response } from "express";
import { asyncHandler } from "../lib/async-handler";
import { db } from "../../db";
import { contracts, users } from "../../db/schema";
import { eq, desc } from "drizzle-orm";

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
      
      // Create contract offer
      const [newContract] = await db.insert(contracts).values({
        customerId: finalCustomerId,
        merchantId: req.user?.role === "merchant" ? req.user.id : null,
        amount: amount,
        term: term,
        interestRate: interestRate,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date()
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

export default router;