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

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  name?: string;
}

interface UserWithPassword extends User {
  password: string;
}

declare global {
  namespace Express {
    interface User extends Omit<UserWithPassword, 'password'> {}
    interface Request {
      user?: User;
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

  extractToken(req: Express.Request): string | null {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return req.headers.authorization.substring(7);
    }
    return null;
  }
}

export const authService = new AuthService();

export function setupAuth(app: Express): void {
  logger.info('[Auth] Starting auth setup...');

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
        secure: app.get("env") === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // JWT Authentication middleware
  app.use(async (req, res, next) => {
    const token = authService.extractToken(req);
    if (token) {
      const user = authService.verifyJWT(token);
      if (user) {
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

        if (userRecord.role !== loginType) {
          logger.error('[Auth] Invalid account type');
          return done(null, false, { message: "Invalid account type" });
        }

        const isValid = await authService.comparePasswords(password, userRecord.password);
        if (!isValid) {
          logger.error('[Auth] Invalid password');
          return done(null, false, { message: "Invalid credentials" });
        }

        const user: Express.User = {
          id: userRecord.id,
          username: userRecord.username,
          email: userRecord.email,
          role: userRecord.role as UserRole,
          name: userRecord.name || undefined
        };

        logger.info('[Auth] Login successful:', { userId: user.id, role: user.role });
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
        name: userRecord.name || undefined
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
      res.json({ ...req.user, token });
    } catch (error) {
      logger.error('[Auth] Token generation error:', error);
      res.status(500).json({ error: 'Failed to generate authentication token' });
    }
  });

  // Protected route to get current user
  app.get("/api/auth/me", (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    res.json(req.user);
  });

  logger.info('[Auth] Auth setup completed successfully');
}