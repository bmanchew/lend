import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';
import { APIError, AuthError } from '../lib/errors';

// Enhanced request context interface with rate limiting
export interface RequestWithContext extends Request {
  context?: {
    requestId: string;
    startTime: [number, number];
  };
  rateLimit?: {
    remaining: number;
    limit: number;
    windowMs: number;
    reset?: number;
  };
}

export interface ErrorResponse extends Response {
  error?: (err: Error) => void;
}

// Function to sanitize headers for logging
const sanitizeHeaders = (headers: any) => {
  const sanitized = { ...headers };
  // Remove sensitive headers
  delete sanitized.authorization;
  delete sanitized.cookie;
  delete sanitized['x-api-key'];
  delete sanitized.password;
  return sanitized;
};

// Function to sanitize request body for logging
const sanitizeBody = (body: any) => {
  if (!body) return body;

  const sanitized = { ...body };
  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });
  return sanitized;
};

export const requestLoggingMiddleware = (
  req: RequestWithContext,
  res: Response,
  next: NextFunction
) => {
  // Generate unique request ID
  const requestId = randomUUID();

  // Create request context
  req.context = {
    requestId,
    startTime: logger.startTimer()
  };

  // Create request-specific logger
  const requestLogger = logger.createRequestLogger(requestId);

  // Enhanced request logging context
  const requestContext = {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    body: sanitizeBody(req.body),
    headers: sanitizeHeaders(req.headers),
    ip: req.ip,
    userAgent: req.get('user-agent') ?? 'unknown',
    protocol: req.protocol,
    secure: req.secure,
    xhr: req.xhr,
    component: 'http',
    action: 'request_received'
  };

  // Log request details
  requestLogger.info('Incoming request', requestContext);

  // Rate limit tracking
  if (req.rateLimit) {
    requestLogger.info('Rate limit status', {
      component: 'rate_limiter',
      action: 'check_limit',
      remaining: req.rateLimit.remaining,
      limit: req.rateLimit.limit,
      windowMs: req.rateLimit.windowMs
    });
  }

  // Capture response
  const originalSend = res.send;
  res.send = function(body): Response {
    const duration = logger.endTimer(req.context!.startTime);

    // Enhanced response logging context
    const responseContext = {
      statusCode: res.statusCode,
      duration,
      size: Buffer.byteLength(body),
      headers: sanitizeHeaders(res.getHeaders()),
      component: 'http',
      action: 'response_sent',
      performance: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };

    // Log response with rate limit info if available
    const logContext = {
      ...responseContext,
      rateLimit: req.rateLimit ? {
        remaining: req.rateLimit.remaining,
        limit: req.rateLimit.limit,
        reset: req.rateLimit.reset
      } : undefined
    };

    requestLogger.info('Outgoing response', logContext);

    return originalSend.call(this, body);
  };

  next();
};

// Enhanced error handling middleware with proper typing
export const errorHandler = (
  err: Error | APIError | AuthError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err instanceof APIError ? err.status : 500;
  const requestId = (req as RequestWithContext).context?.requestId || randomUUID();

  // Enhanced error logging context
  const errorContext = {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    cause: err instanceof Error ? err.cause : undefined,
    code: err instanceof APIError ? err.code : undefined,
    details: err instanceof APIError ? err.details : undefined,
    statusCode,
    requestId,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  };

  logger.error('[Error Handler]', errorContext);

  // Handle specific error types
  if (err instanceof APIError) {
    return res.status(statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err
    });
  }

  // Generic error response
  return res.status(statusCode).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

// Performance logging middleware
export const performanceLoggingMiddleware = (
  req: RequestWithContext,
  res: Response,
  next: NextFunction
) => {
  const start = logger.startTimer();

  res.on('finish', () => {
    const duration = logger.endTimer(start);
    const requestId = req.context?.requestId || randomUUID();

    // Enhanced performance metrics
    const performanceContext = {
      requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      component: 'http',
      action: 'request_completed',
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date().toISOString(),
      rateLimit: req.rateLimit ? {
        remaining: req.rateLimit.remaining,
        limit: req.rateLimit.limit,
        reset: req.rateLimit.reset
      } : undefined
    };

    logger.info('Request completed', performanceContext);
  });

  next();
};