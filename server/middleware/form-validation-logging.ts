import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';

interface ValidationContext {
  validationId: string;
  path: string;
  method: string;
  body: any;
  errors: any[];
  duration: number;
  timestamp: string;
}

export const formValidationLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Only intercept POST and PUT requests
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return next();
  }

  const validationId = randomUUID();
  const startTime = logger.startTimer();

  // Track validation errors
  const trackValidationError = (errors: any[]) => {
    const duration = logger.endTimer(startTime);

    const context: ValidationContext = {
      validationId,
      path: req.path,
      method: req.method,
      body: req.body,
      errors,
      duration,
      timestamp: new Date().toISOString()
    };

    logger.error('Form validation failed', null, {
      ...context,
      component: 'form_validation',
      action: 'validation_failed'
    });

    // Track as business event
    logger.logBusinessEvent(
      'form_validation_error',
      'validation',
      'failure',
      context
    );
  };

  // Add validation tracker to response locals
  res.locals.trackValidationError = trackValidationError;

  // Capture validation errors in response
  const originalJson = res.json;
  res.json = function(body: any): Response {
    if (res.statusCode === 400 && body.errors) {
      trackValidationError(body.errors);
    }
    return originalJson.call(this, body);
  };

  next();
};

// Export types for TypeScript support
declare global {
  namespace Express {
    interface Locals {
      trackValidationError: (errors: any[]) => void;
    }
  }
}
