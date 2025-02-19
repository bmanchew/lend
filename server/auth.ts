import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { users, insertUserSchema } from "@db/schema";
import { db, dbInstance } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import jwt from 'jsonwebtoken';
import { logger } from "./lib/logger";

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
    interface User extends BaseUser {
      password?: string;
    }
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
      logger.error("[Auth] Password comparison error:", error);
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
      name: user.name,
      username: user.username
    };

    const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';
    return jwt.sign(payload, jwtSecret, { expiresIn: '30d' });
  }

  verifyJWT(token: string): Express.User | null {
    try {
      const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';
      const decoded = jwt.verify(token, jwtSecret) as Express.User;
      return decoded;
    } catch (error) {
      logger.error("[Auth] JWT verification failed:", error);
      return null;
    }
  }

  extractToken(req: Request): string | null {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return req.headers.authorization.substring(7);
    }
    return null;
  }
}

export const authService = new AuthService();

export function setupAuth(app: Express): void {
  logger.info('[Auth] Starting auth setup...');

  // Enable trust proxy for all forwarded headers
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

  app.use(
    session({
      store,
      secret: process.env.REPL_ID!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'none'
      },
      proxy: true
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // JWT Authentication middleware with enhanced logging
  app.use(async (req, res, next) => {
    const token = authService.extractToken(req);
    if (token) {
      const user = authService.verifyJWT(token);
      if (user) {
        logger.info('[Auth] JWT authenticated user:', { userId: user.id, role: user.role });
        req.user = user;
      }
    }
    next();
  });

  passport.use(
    new LocalStrategy({
      usernameField: 'username',
      passwordField: 'password',
      passReqToCallback: true
    }, async (req, username, password, done) => {
      try {
        const loginType = req.body.loginType as UserRole || 'customer';
        logger.info('[Auth] Login attempt:', { username, loginType });

        if (!username || !password) {
          logger.error('[Auth] Missing credentials');
          return done(null, false, { message: "Missing credentials" });
        }

        const [userRecord] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!userRecord || !userRecord.password) {
          logger.error('[Auth] User not found or invalid password');
          return done(null, false, { message: "Invalid credentials" });
        }

        // Enhanced role validation for admin users
        if (loginType === 'admin' && userRecord.role !== 'admin') {
          logger.error('[Auth] Unauthorized admin access attempt:', {
            username,
            actualRole: userRecord.role
          });
          return done(null, false, { message: "Unauthorized access" });
        }

        if (userRecord.role !== loginType) {
          logger.error('[Auth] Invalid account type:', {
            expected: loginType,
            actual: userRecord.role
          });
          return done(null, false, { message: `This login is for ${loginType} accounts only` });
        }

        const isValid = await authService.comparePasswords(password, userRecord.password);
        if (!isValid) {
          logger.error('[Auth] Invalid password for user:', username);
          return done(null, false, { message: "Invalid credentials" });
        }

        const user: Express.User = {
          id: userRecord.id,
          username: userRecord.username,
          email: userRecord.email,
          role: userRecord.role as UserRole,
          name: userRecord.name || undefined,
          password: userRecord.password // Added password here
        };

        logger.info('[Auth] Login successful:', {
          userId: user.id,
          role: user.role,
          loginType
        });
        return done(null, user);
      } catch (err) {
        logger.error('[Auth] Login error:', err);
        return done(err);
      }
    })
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [userRecord] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!userRecord) {
        return done(null, false);
      }

      const user: Express.User = {
        id: userRecord.id,
        username: userRecord.username,
        email: userRecord.email,
        role: userRecord.role as UserRole,
        name: userRecord.name || undefined,
        password: userRecord.password // Added password here
      };

      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Add JWT token to login response
  app.post("/api/auth/login", passport.authenticate("local"), async (req, res) => {
    try {
      const token = await authService.generateJWT(req.user!);
      logger.info('[Auth] Generated JWT token for user:', { userId: req.user!.id });
      res.json({ ...req.user, token });
    } catch (error) {
      logger.error('[Auth] Token generation error:', error);
      res.status(500).json({ error: 'Failed to generate authentication token' });
    }
  });

  // Protected route to get current user
  app.get("/api/auth/me", (req, res) => {
    if (!req.user) {
      logger.info('[Auth] Unauthorized access to /api/auth/me');
      return res.status(401).json({ error: "Authentication required" });
    }
    logger.info('[Auth] User data retrieved:', { userId: req.user.id });
    res.json(req.user);
  });

  logger.info('[Auth] Auth setup completed successfully');
}