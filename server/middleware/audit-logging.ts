import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';

interface AuditContext {
  auditId: string;
  userId?: string;
  userRole?: string;
  action: string;
  resource: string;
  outcome: 'success' | 'failure';
  changes?: any;
  metadata?: any;
  timestamp: string;
  duration: number;
  ip: string;
  userAgent: string;
  performance?: {
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
  };
}

export const createAuditLogger = () => {
  return {
    logUserAction: (
      req: Request,
      action: string,
      resource: string,
      metadata?: any
    ) => {
      const auditId = randomUUID();
      const startTime = logger.startTimer();

      return {
        auditId,
        success: (changes?: any) => {
          const duration = logger.endTimer(startTime);

          const context: AuditContext = {
            auditId,
            userId: ((req as any).user?.id ?? '').toString(),
            userRole: (req as any).user?.role ?? 'anonymous',
            action,
            resource,
            outcome: 'success',
            changes,
            metadata,
            timestamp: new Date().toISOString(),
            duration,
            ip: req.ip,
            userAgent: req.get('user-agent') ?? 'unknown',
            performance: {
              memory: process.memoryUsage(),
              cpu: process.cpuUsage()
            }
          };

          logger.info('User action completed', {
            ...context,
            component: 'audit',
            action: 'user_action'
          });
        },
        failure: (error: Error) => {
          const duration = logger.endTimer(startTime);

          const context: AuditContext = {
            auditId,
            userId: ((req as any).user?.id ?? '').toString(),
            userRole: (req as any).user?.role ?? 'anonymous',
            action,
            resource,
            outcome: 'failure',
            metadata: {
              ...metadata,
              error: {
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
              }
            },
            timestamp: new Date().toISOString(),
            duration,
            ip: req.ip,
            userAgent: req.get('user-agent') ?? 'unknown',
            performance: {
              memory: process.memoryUsage(),
              cpu: process.cpuUsage()
            }
          };

          logger.error('User action failed', error, {
            ...context,
            component: 'audit',
            action: 'user_action_failed'
          });
        }
      };
    }
  };
};

// List of sensitive operations to audit
const sensitiveOperations = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/logout' },
  { method: 'POST', path: '/api/users' },
  { method: 'PUT', path: /^\/api\/users\/\d+$/ },
  { method: 'DELETE', path: /^\/api\/users\/\d+$/ },
  { method: 'POST', path: '/api/payments' },
  { method: 'POST', path: '/api/loans' },
  { method: 'POST', path: '/api/plaid/process-payment' },
  { method: 'POST', path: '/api/merchants/*/send-loan-application' },
  { method: 'POST', path: '/api/contracts' }
];

// Middleware to automatically log sensitive operations
export const auditLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Check if current request matches sensitive operations
  const matchingSensitiveOp = sensitiveOperations.find(op => {
    if (typeof op.path === 'string') {
      return req.method === op.method && req.path === op.path;
    }
    return req.method === op.method && op.path.test(req.path);
  });

  if (matchingSensitiveOp) {
    const auditLogger = createAuditLogger();
    const audit = auditLogger.logUserAction(
      req,
      req.method,
      req.path,
      { 
        query: req.query,
        headers: {
          ...req.headers,
          authorization: undefined,
          cookie: undefined
        }
      }
    );

    // Capture the response
    const originalSend = res.send;
    res.send = function(body): Response {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        audit.success(body);
      } else {
        audit.failure(new Error(`Request failed with status ${res.statusCode}`));
      }
      return originalSend.call(this, body);
    };
  }

  next();
};