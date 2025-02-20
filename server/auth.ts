import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { users } from "@db/schema";
import { db, dbInstance } from "@db";
import { eq } from "drizzle-orm";
import jwt from 'jsonwebtoken';
import { logger } from "./lib/logger";
import { AuthError, AUTH_ERROR_CODES } from './lib/errors';

export type UserRole = "admin" | "customer" | "merchant";

interface AuthConfig {
  saltRounds: number;
  sessionDuration: number;
}

// Base User interface that both Express.User and our custom User will extend
interface BaseUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  name?: string;
}

// Our custom User interface
export interface User extends BaseUser {
  password?: string;
}

// Extend Express.User
declare global {
  namespace Express {
    interface User extends BaseUser {}
  }
}

class AuthService {
  private readonly config: AuthConfig = {
    saltRounds: 10,
    sessionDuration: 30 * 24 * 60 * 60 * 1000 // 30 days
  };

  async comparePasswords(supplied: string, stored: string): Promise<boolean> {
    try {
      if (!supplied || !stored) {
        logger.error("[Auth] Missing password");
        return false;
      }
      return bcrypt.compare(supplied, stored);
    } catch (error) {
      logger.error("[Auth] Password comparison error:", error instanceof Error ? error : new Error('Unknown error'));
      return false;
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.config.saltRounds);
  }

  async generateJWT(user: Express.User): Promise<string> {
    const payload = {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name
    };

    const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';
    return jwt.sign(payload, jwtSecret, { expiresIn: '30d' });
  }

  verifyJWT(token: string): Express.User {
    try {
      const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';
      const decoded = jwt.verify(token, jwtSecret) as Express.User;
      return decoded;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthError('TOKEN_EXPIRED', 'Token expired', 401);
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new AuthError('TOKEN_INVALID', 'Invalid token', 401);
      }
      throw new AuthError('UNAUTHORIZED', 'Token verification failed', 401);
    }
  }
}

export const authService = new AuthService();

export function setupAuth(app: Express): void {
  logger.info('[Auth] Starting auth setup...');

  app.set('trust proxy', 1);

  if (!dbInstance.pool) {
    throw new Error('Database pool not initialized');
  }

  const PostgresStore = connectPg(session);
  const store = new PostgresStore({
    pool: dbInstance.pool,
    createTableIfMissing: true,
    tableName: 'user_sessions'
  });

  app.use(session({
    store,
    secret: process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'none'
    },
    proxy: true
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true
  }, async (req, username, password, done) => {
    const requestId = req.headers['x-request-id'] as string;

    try {
      logger.info('[Auth] Attempting login', { 
        username,
        loginType: req.body.loginType,
        requestId
      });

      if (!username || !password) {
        throw new AuthError('MISSING_CREDENTIALS', 'Missing credentials', 400);
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user || !user.password) {
        logger.warn('[Auth] Invalid credentials - user not found', {
          username,
          requestId
        });
        return done(new AuthError('INVALID_CREDENTIALS', 'Invalid credentials', 401));
      }

      const isValid = await authService.comparePasswords(password, user.password);
      if (!isValid) {
        logger.warn('[Auth] Invalid credentials - password mismatch', {
          username,
          requestId
        });
        return done(new AuthError('INVALID_CREDENTIALS', 'Invalid credentials', 401));
      }

      const userResponse: Express.User = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role as UserRole,
        name: user.name || undefined
      };

      logger.info('[Auth] Login successful', {
        userId: user.id.toString(),
        role: user.role,
        requestId
      });

      return done(null, userResponse);
    } catch (err) {
      if (err instanceof AuthError) {
        return done(err);
      }
      logger.error('[Auth] Unexpected error during authentication', {
        error: err instanceof Error ? { message: err.message, stack: err.stack } : 'Unknown error',
        username,
        requestId
      });
      return done(new AuthError('AUTH_FAILED', 'Authentication failed', 500));
    }
  }));

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id: number, done) => {
    db.select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then(([user]) => {
        if (!user) {
          logger.warn('[Auth] User not found during deserialization', { userId: id.toString() });
          return done(null, false);
        }

        const userResponse: Express.User = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role as UserRole,
          name: user.name || undefined
        };

        done(null, userResponse);
      })
      .catch(err => {
        logger.error('[Auth] Error during user deserialization:', err instanceof Error ? err : new Error('Unknown error'));
        done(new AuthError('SESSION_EXPIRED', 'Session error', 500));
      });
  });

  app.post("/api/login", async (req, res, next) => {
    passport.authenticate('local', async (err: any, user: Express.User | false, info: any) => {
      if (err) {
        logger.error('[Auth] Login error:', err instanceof Error ? err : new Error('Unknown error'));
        return next(err);
      }

      if (!user) {
        logger.error('[Auth] Authentication failed:', info);
        return res.status(401).json({ error: info.message || 'Authentication failed' });
      }

      try {
        const token = await authService.generateJWT(user);
        logger.info('[Auth] Generated JWT token for user:', { userId: user.id.toString() });

        // Use Promise to handle login sequence
        await new Promise<void>((resolve, reject) => {
          req.logIn(user, (loginErr) => {
            if (loginErr) {
              logger.error('[Auth] Session login error:', loginErr instanceof Error ? loginErr : new Error('Unknown error'));
              reject(loginErr);
              return;
            }
            resolve();
          });
        });

        if (!res.headersSent) {
          return res.json({
            ...user,
            token
          });
        }
      } catch (error) {
        logger.error('[Auth] Authentication error:', error instanceof Error ? error : new Error('Unknown error'));
        if (!res.headersSent) {
          return res.status(500).json({ 
            error: error instanceof Error ? error.message : 'Authentication failed'
          });
        }
      }
    })(req, res, next);
  });

  app.get("/api/user", async (req, res) => {
    try {
      if (!req.user) {
        logger.info('[Auth] Unauthorized access to /api/user');
        return res.status(401).json({ error: "Authentication required" });
      }
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
          return res.status(401).json({ error: 'Authorization token missing' });
      }
      const verifiedUser = authService.verifyJWT(token);
      logger.info('[Auth] User data retrieved:', { userId: verifiedUser.id.toString() });
      res.json(verifiedUser);
    } catch (error) {
      logger.error('[Auth] Error retrieving user data:', error instanceof Error ? error : new Error('Unknown error'));
      if (error instanceof AuthError) {
          res.status(error.statusCode || 500).json({ error: error.message });
      } else {
          res.status(500).json({ error: 'Failed to retrieve user data' });
      }
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        logger.error('[Auth] Logout error:', err instanceof Error ? err : new Error('Unknown error'));
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.sendStatus(200);
    });
  });

  logger.info('[Auth] Auth setup completed successfully');
}