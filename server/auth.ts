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
import { eq, or, sql } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import SMSService from "./services/sms";
import jwt from 'jsonwebtoken';

const PostgresSessionStore = connectPg(session);

// Add types for user roles
type UserRole = "admin" | "customer" | "merchant";

// Auth configuration type
interface AuthConfig {
  saltRounds: number;
  sessionDuration: number;
}

// Base User interface with consistent property modifiers
interface User {
  id: number;
  username: string;
  password: string;
  email: string;
  role: UserRole;
  name: string | null;
  phoneNumber: string | null;
  lastOtpCode: string | null;
  otpExpiry: Date | null;
  kycStatus: string | null;
  createdAt: Date | null;
  plaidAccessToken: string | null;
  faceIdHash: string | null;
}

// Extend Express.User to match our User interface exactly
declare global {
  namespace Express {
    interface User extends Omit<User, 'password'> {} // Omit password for security
  }
}

class AuthService {
  private readonly config: AuthConfig = {
    saltRounds: 10,
    sessionDuration: 30 * 24 * 60 * 60 * 1000 // 30 days
  };

  private readonly logger = {
    info: (message: string, meta?: any) => console.log(`[AuthService] ${message}`, meta),
    error: (message: string, meta?: any) => console.error(`[AuthService] ${message}`, meta),
    debug: (message: string, meta?: any) => console.debug(`[AuthService] ${message}`, meta)
  };

  async generateJWT(user: User): Promise<string> {
    this.logger.debug("Generating JWT for user:", { userId: user.id, role: user.role });

    const payload = {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      phoneNumber: user.phoneNumber
    };

    const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';

    return jwt.sign(payload, jwtSecret, {
      expiresIn: '30d',
      algorithm: 'HS256'
    });
  }

  async hashPassword(password: string): Promise<string> {
    this.logger.debug("Generating password hash");
    return bcrypt.hash(password, this.config.saltRounds);
  }

  async comparePasswords(supplied: string, stored: string): Promise<boolean> {
    this.logger.debug("Comparing passwords", {
      suppliedLength: supplied?.length,
      storedHashLength: stored?.length,
      storedHashPrefix: stored ? stored.substring(0, 10) + "..." : null
    });

    try {
      if (!supplied || !stored) {
        this.logger.error("Missing password:", { supplied: !!supplied, stored: !!stored });
        throw new Error("Missing credentials");
      }

      const isMatch = await bcrypt.compare(supplied, stored);
      this.logger.debug("Password comparison result:", { isMatch });
      
      if (!isMatch) {
        throw new Error("Invalid credentials");
      }
      
      return isMatch;
    } catch (error) {
      this.logger.error("Password comparison error:", error);
      throw error;
    }
  }
}

// Create authService instance after class definition
export const authService = new AuthService();

export async function setupAuth(app: Express): Promise<void> {
  console.log('[Auth] Starting auth setup...');

  const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 1000,
    message: { error: "Too many login attempts, please try again after 1 minute" }
  });

  app.use(["/api/login", "/api/register"], authLimiter);

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
      console.log("[Auth] Login attempt:", {
        username,
        loginType: req.body.loginType,
        timestamp: new Date().toISOString()
      });

      try {
        const loginType = req.body.loginType as UserRole || 'customer';

        if (!username || !password) {
          console.log("[Auth] Missing credentials:", { username: !!username, password: !!password });
          return done(null, false, { message: "Missing credentials" });
        }

        if (loginType === 'admin' || loginType === 'merchant') {
          console.log("[Auth] Attempting admin/merchant login");
          const [userRecord] = await db.select().from(users)
            .where(eq(users.username, username))
            .limit(1);

          console.log("[Auth] User record found:", {
            found: !!userRecord,
            role: userRecord?.role,
            expectedRole: loginType,
            username: userRecord?.username,
            passwordHash: userRecord?.password ? userRecord.password.substring(0, 10) + "..." : null
          });

          if (!userRecord || userRecord.role !== loginType) {
            console.log("[Auth] Invalid credentials - user not found or wrong role");
            return done(null, false, { message: "Invalid credentials" });
          }

          console.log("[Auth] Comparing passwords for user:", username);
          const isValid = await authService.comparePasswords(password, userRecord.password);

          console.log("[Auth] Password comparison result:", {
            isValid,
            passwordProvided: !!password,
            hashedPasswordExists: !!userRecord.password,
            passwordLength: password.length,
            storedHashLength: userRecord.password.length,
            storedHashPrefix: userRecord.password.substring(0, 10) + "..."
          });

          if (!isValid) {
            console.log("[Auth] Invalid credentials - password mismatch");
            return done(null, false, { message: "Invalid credentials" });
          }

          // Explicitly type the role as UserRole
          const role = userRecord.role as UserRole;
          if (!['admin', 'merchant', 'customer'].includes(role)) {
            console.log("[Auth] Invalid role type:", role);
            return done(null, false, { message: "Invalid user role" });
          }

          const user: User = {
            id: userRecord.id,
            username: userRecord.username,
            password: userRecord.password,
            email: userRecord.email,
            name: userRecord.name,
            role: role,
            phoneNumber: userRecord.phoneNumber,
            lastOtpCode: userRecord.lastOtpCode,
            otpExpiry: userRecord.otpExpiry,
            kycStatus: userRecord.kycStatus,
            createdAt: userRecord.createdAt,
            plaidAccessToken: userRecord.plaidAccessToken,
            faceIdHash: userRecord.faceIdHash
          };

          console.log("[Auth] Login successful:", {
            userId: user.id,
            role: user.role,
            timestamp: new Date().toISOString()
          });

          return done(null, user);
        }

        // Handle customer login with OTP
        const formattedPhone = username.replace(/\D/g, '').slice(-10);
        if (formattedPhone.length !== 10) {
          return done(null, false, { message: "Invalid phone number format" });
        }

        const [userRecord] = await db.select().from(users)
          .where(eq(users.phoneNumber, `+1${formattedPhone}`))
          .limit(1);

        console.log("[Auth] User record found (customer):", {
          found: !!userRecord,
          phoneNumber: userRecord?.phoneNumber
        });

        if (!userRecord || userRecord.role !== 'customer') {
          console.log("[Auth] Invalid credentials - user not found or not a customer");
          return done(null, false, { message: "Invalid account" });
        }

        if (!userRecord.lastOtpCode || !userRecord.otpExpiry || new Date() > userRecord.otpExpiry) {
          console.log("[Auth] Invalid OTP - expired");
          return done(null, false, { message: "OTP expired or invalid" });
        }

        console.log("[Auth] Comparing OTP...");
        if (userRecord.lastOtpCode.trim() !== password.trim()) {
          console.log("[Auth] Invalid OTP - mismatch");
          return done(null, false, { message: "Invalid OTP" });
        }

        const user: User = {
          id: userRecord.id,
          username: userRecord.username,
          password: userRecord.password,
          email: userRecord.email,
          name: userRecord.name,
          role: userRecord.role as UserRole,
          phoneNumber: userRecord.phoneNumber,
          lastOtpCode: userRecord.lastOtpCode,
          otpExpiry: userRecord.otpExpiry,
          kycStatus: userRecord.kycStatus,
          createdAt: userRecord.createdAt,
          plaidAccessToken: userRecord.plaidAccessToken,
          faceIdHash: userRecord.faceIdHash
        };

        console.log("[Auth] Login successful (customer):", {
          userId: user.id,
          phoneNumber: user.phoneNumber,
          timestamp: new Date().toISOString()
        });

        // Clear used OTP
        await db.update(users)
          .set({ lastOtpCode: null, otpExpiry: null })
          .where(eq(users.id, userRecord.id));

        return done(null, user);
      } catch (err) {
        console.error('Auth error:', err);
        return done(err);
      }
    })
  );

  // Serialization methods
  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [userRecord] = await db.select().from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!userRecord) {
        return done(null, false);
      }

      const role = userRecord.role as UserRole;
      if (!['admin', 'merchant', 'customer'].includes(role)) {
        return done(new Error("Invalid user role"), null);
      }

      const user: Omit<User, 'password'> = {
        id: userRecord.id,
        username: userRecord.username,
        email: userRecord.email,
        name: userRecord.name,
        role: role,
        phoneNumber: userRecord.phoneNumber,
        lastOtpCode: userRecord.lastOtpCode,
        otpExpiry: userRecord.otpExpiry,
        kycStatus: userRecord.kycStatus,
        createdAt: userRecord.createdAt,
        plaidAccessToken: userRecord.plaidAccessToken,
        faceIdHash: userRecord.faceIdHash
      };

      done(null, user);
    } catch (err) {
      done(err);
    }
  });
}