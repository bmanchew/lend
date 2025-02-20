import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

// Business event tracking middleware
export const businessEventMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Track important business events
  const trackBusinessEvent = (eventType: string, status: 'success' | 'failure' | 'pending', metadata?: any) => {
    const category = getEventCategory(req.path);
    logger.logBusinessEvent(eventType, category, status, {
      ...metadata,
      path: req.path,
      method: req.method,
      userId: (req as any).user?.id,
      userRole: (req as any).user?.role,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('user-agent') ?? 'unknown'
    });
  };

  // Attach business event tracker to response locals
  res.locals.trackBusinessEvent = trackBusinessEvent;

  // Track API endpoint usage
  if (req.path.startsWith('/api/')) {
    trackBusinessEvent('api_request', 'pending', {
      endpoint: req.path
    });

    // Capture response
    const originalSend = res.send;
    res.send = function(body): Response {
      const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
      
      trackBusinessEvent('api_request', status, {
        endpoint: req.path,
        statusCode: res.statusCode,
        responseSize: Buffer.byteLength(body),
        duration: res.locals.requestDuration
      });

      return originalSend.call(this, body);
    };
  }

  next();
};

// Helper function to categorize events based on path
function getEventCategory(path: string): string {
  if (path.includes('/auth/')) return 'auth';
  if (path.includes('/merchants/')) return 'merchant';
  if (path.includes('/loans/')) return 'loan';
  if (path.includes('/payments/')) return 'payment';
  if (path.includes('/users/')) return 'user';
  if (path.includes('/kyc/')) return 'kyc';
  if (path.includes('/contracts/')) return 'contract';
  return 'general';
}

// Export types for TypeScript support
declare global {
  namespace Express {
    interface Locals {
      trackBusinessEvent: (
        eventType: string,
        status: 'success' | 'failure' | 'pending',
        metadata?: any
      ) => void;
    }
  }
}
