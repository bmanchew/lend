import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';

interface AuthLogContext {
  sessionId?: string;
  userId?: string;
  ip: string;
  userAgent: string;
  action: string;
  outcome: 'success' | 'failure';
  reason?: string;
  timestamp: string;
  metadata?: any;
  performance?: {
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
  };
}

export const createAuthLogger = () => {
  return {
    logAuthEvent: (
      req: Request,
      action: 'login' | 'logout' | 'session_refresh' | 'password_reset' | 'signup',
      metadata?: any
    ) => {
      const eventId = randomUUID();
      const startTime = logger.startTimer();

      return {
        eventId,
        success: (userId?: string, sessionId?: string) => {
          const duration = logger.endTimer(startTime);
          const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

          const context: AuthLogContext = {
            sessionId,
            userId: userId?.toString(),
            ip: ipAddress,
            userAgent: req.get('user-agent') ?? 'unknown',
            action,
            outcome: 'success',
            timestamp: new Date().toISOString(),
            metadata: {
              ...metadata,
              duration,
              headers: {
                ...req.headers,
                authorization: undefined,
                cookie: undefined
              }
            },
            performance: {
              memory: process.memoryUsage(),
              cpu: process.cpuUsage()
            }
          };

          logger.info(`Authentication ${action} successful`, {
            ...context,
            component: 'auth',
            action: `auth_${action}_success`
          });
        },
        failure: (reason: string) => {
          const duration = logger.endTimer(startTime);
          const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

          const context: AuthLogContext = {
            ip: ipAddress,
            userAgent: req.get('user-agent') ?? 'unknown',
            action,
            outcome: 'failure',
            reason,
            timestamp: new Date().toISOString(),
            metadata: {
              ...metadata,
              duration,
              headers: {
                ...req.headers,
                authorization: undefined,
                cookie: undefined
              }
            },
            performance: {
              memory: process.memoryUsage(),
              cpu: process.cpuUsage()
            }
          };

          logger.warn(`Authentication ${action} failed`, {
            ...context,
            component: 'auth',
            action: `auth_${action}_failed`
          });
        }
      };
    }
  };
};

// Track authentication paths
const authPaths = {
  '/api/auth/login': 'login',
  '/api/auth/logout': 'logout',
  '/api/auth/signup': 'signup',
  '/api/auth/refresh': 'session_refresh',
  '/api/auth/reset-password': 'password_reset'
} as const;

// Middleware to log authentication events
export const authLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authAction = authPaths[req.path as keyof typeof authPaths];

  if (authAction) {
    const authLogger = createAuthLogger();
    const auth = authLogger.logAuthEvent(req, authAction, {
      method: req.method,
      query: req.query,
      userAgent: req.get('user-agent') ?? 'unknown',
      ip: req.ip || req.socket.remoteAddress || 'unknown'
    });

    // Capture the response
    const originalSend = res.send;
    res.send = function(body): Response {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = ((req as any).user?.id ?? '').toString();
        const sessionId = (req as any).session?.id;
        auth.success(userId, sessionId);
      } else {
        auth.failure(`Request failed with status ${res.statusCode}`);
      }
      return originalSend.call(this, body);
    };
  }

  next();
};