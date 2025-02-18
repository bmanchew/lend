// Type declarations
declare module 'express-session' {
  interface SessionData {
    userId: number;
    userRole: UserRole;
    phoneNumber?: string;
  }
}

import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { users, insertUserSchema } from "@db/schema";
import { db, dbInstance } from "@db";
import { eq, and } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import SMSService from "./services/sms";
import jwt from 'jsonwebtoken';

const PostgresSessionStore = connectPg(session);

// Add types for user roles
export type UserRole = "admin" | "customer" | "merchant";

// Auth configuration type
interface AuthConfig {
  saltRounds: number;
  sessionDuration: number;
}

// Base User interface
export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  name?: string;
  phoneNumber?: string;
  lastOtpCode?: string;
  otpExpiry?: Date;
  kycStatus?: string;
  createdAt?: Date;
  plaidAccessToken?: string;
  faceIdHash?: string;
}

// Extended User interface for internal use (includes password)
export interface UserWithPassword extends User {
  password: string;
}

// Update Express.User interface
declare global {
  namespace Express {
    interface User extends Omit<UserWithPassword, 'password'> {}
  }
}

class AuthService {
  private readonly config: AuthConfig = {
    saltRounds: 10,
    sessionDuration: 30 * 24 * 60 * 60 * 1000 // 30 days
  };

  private readonly logger = {
    info: (message: string, meta?: any) => console.log(`[AuthService] ${message}`, meta || ''),
    error: (message: string, meta?: any) => console.error(`[AuthService] ${message}`, meta || ''),
    debug: (message: string, meta?: any) => console.debug(`[AuthService] ${message}`, meta || '')
  };

  async comparePasswords(supplied: string, stored: string): Promise<boolean> {
    try {
      if (!supplied || !stored) {
        this.logger.error("Missing password:", { supplied: !!supplied, stored: !!stored });
        return false;
      }

      if (!stored.startsWith('$2')) {
        this.logger.error("Invalid hash format");
        return false;
      }

      const isMatch = await bcrypt.compare(supplied, stored);
      this.logger.debug("Password comparison result:", { isMatch });
      return isMatch;
    } catch (error) {
      this.logger.error("Password comparison error:", error);
      return false;
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.config.saltRounds);
  }

  async generateJWT(user: User): Promise<string> {
    const payload = {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      phoneNumber: user.phoneNumber
    };

    const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';
    return jwt.sign(payload, jwtSecret, { expiresIn: '30d' });
  }
}

export const authService = new AuthService();

export async function setupAuth(app: Express): Promise<void> {
  console.log('[Auth] Starting auth setup...');

  if (!dbInstance.pool) {
    throw new Error('Database pool not initialized');
  }

  const store = new PostgresSessionStore({
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
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({
      usernameField: 'username',
      passwordField: 'password',
      passReqToCallback: true
    }, async (req, username, password, done) => {
      try {
        const loginType = req.body.loginType as UserRole || 'customer';

        if (!username || !password) {
          return done(null, false, { message: "Missing credentials" });
        }

        const [userRecord] = await db
          .select()
          .from(users)
          .where(
            and(
              eq(users.username, username),
              eq(users.role, loginType)
            )
          )
          .limit(1);

        if (!userRecord || !userRecord.password) {
          return done(null, false, { message: "Invalid credentials" });
        }

        const isValid = await authService.comparePasswords(password, userRecord.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid credentials" });
        }

        const user: Express.User = {
          id: userRecord.id,
          username: userRecord.username,
          email: userRecord.email,
          role: userRecord.role as UserRole,
          name: userRecord.name || undefined,
          phoneNumber: userRecord.phoneNumber || undefined,
          lastOtpCode: userRecord.lastOtpCode || undefined,
          otpExpiry: userRecord.otpExpiry || undefined,
          kycStatus: userRecord.kycStatus || undefined,
          createdAt: userRecord.createdAt || undefined,
          plaidAccessToken: userRecord.plaidAccessToken || undefined,
          faceIdHash: userRecord.faceIdHash || undefined
        };

        return done(null, user);
      } catch (err) {
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
        phoneNumber: userRecord.phoneNumber || undefined,
        lastOtpCode: userRecord.lastOtpCode || undefined,
        otpExpiry: userRecord.otpExpiry || undefined,
        kycStatus: userRecord.kycStatus || undefined,
        createdAt: userRecord.createdAt || undefined,
        plaidAccessToken: userRecord.plaidAccessToken || undefined,
        faceIdHash: userRecord.faceIdHash || undefined
      };

      done(null, user);
    } catch (err) {
      done(err);
    }
  });
}