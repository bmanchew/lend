import express, { Response } from 'express';
import { db } from '@db';
import { contracts, users } from '@db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { asyncHandler } from '../lib/async-handler';
import { z } from 'zod';
import { logger } from '../lib/logger';

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

// Middleware to ensure user is authenticated
const authenticate = (req: RequestWithUser, res: Response, next: Function) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  next();
};

// Middleware to check role
const checkRole = (roles: string[]) => {
  return (req: RequestWithUser, res: Response, next: Function) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }
    next();
  };
};

// Get contracts for the authenticated customer
router.get('/customer', 
  authenticate, 
  checkRole(['customer']),
  asyncHandler(async (req: RequestWithUser, res: Response) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'User ID is required' 
        });
      }
      
      const customerContracts = await db
        .select()
        .from(contracts)
        .where(eq(contracts.customerId, userId));
      
      // Ensure we return a valid JSON response
      return res.status(200).json({ 
        status: 'success', 
        data: customerContracts 
      });
    } catch (error) {
      logger.error('Error fetching customer contracts', error);
      return res.status(500).json({ 
        status: 'error', 
        message: 'Failed to fetch contracts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

// Other contract routes would go here

export default router;