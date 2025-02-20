import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';

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

// Error logging middleware with enhanced context
export const errorLoggingMiddleware = (
  err: Error,
  req: RequestWithContext,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.context?.requestId || randomUUID();
  const requestLogger = logger.createRequestLogger(requestId);

  // Enhanced error logging context
  const errorContext = {
    method: req.method,
    url: req.url,
    path: req.path,
    statusCode: res.statusCode || 500,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? 'unknown',
    component: 'http',
    action: 'request_error',
    performance: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    },
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };

  requestLogger.error('Unhandled error', err, errorContext);

  next(err);
};

// Performance logging middleware with enhanced metrics
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


export const errorHandler = (err: Error | APIError | LogError, req: Request, res: Response, next: NextFunction) => {
  const statusCode = (err as APIError).status || 500;

  logger.error('[Error Handler]', {
    message: err.message,
    name: err.name,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

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

  return res.status(statusCode).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

interface APIError extends Error {
  status: number;
  code: string;
  details: any;
}

interface LogError extends Error {
  level: string;
  message: string;
}