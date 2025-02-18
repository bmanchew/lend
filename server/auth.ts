// Type declarations (Removed as types are defined in edited code)
//declare module 'express-session' {
//  interface SessionData {
//    userId: number;
//    userRole: UserRole;
//    phoneNumber?: string;
//  }
//}

import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { users } from "@db/schema";
import { db, dbInstance } from "@db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";
import jwt from 'jsonwebtoken';

const PostgresSessionStore = connectPg(session);

// Types (Moved from original to here)
type UserRole = "admin" | "customer" | "merchant";

interface AuthConfig {
  saltRounds: number;
  sessionDuration: number;
}

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

declare global {
  namespace Express {
    interface User extends Omit<User, 'password'> {}
  }
}

class AuthService {
  private readonly config: AuthConfig = {
    saltRounds: 10,
    sessionDuration: 30 * 24 * 60 * 60 * 1000
  };

  async generateJWT(user: User): Promise<string> {
    logger.debug("Generating JWT for user:", { userId: user.id, role: user.role });

    const payload = {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      phoneNumber: user.phoneNumber
    };

    return jwt.sign(
      payload,
      process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret',
      { expiresIn: '30d', algorithm: 'HS256' }
    );
  }

  async hashPassword(password: string): Promise<string> {
    logger.debug("Generating password hash");
    return bcrypt.hash(password, this.config.saltRounds);
  }

  async comparePasswords(supplied: string, stored: string): Promise<boolean> {
    if (!supplied || !stored) {
      logger.error("Missing password:", { supplied: !!supplied, stored: !!stored });
      return false;
    }

    try {
      const isMatch = await bcrypt.compare(supplied, stored);
      logger.debug("Password comparison result:", { isMatch });
      return isMatch;
    } catch (error) {
      logger.error("Password comparison error:", error);
      return false;
    }
  }
}

export const authService = new AuthService();

export async function setupAuth(app: Express): Promise<void> {
  logger.info('[Auth] Starting auth setup...');

  // Rate limiting
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    message: { error: "Too many login attempts, please try again after 1 minute" }
  });

  app.use(["/api/login", "/api/register"], authLimiter);

  // Session setup
  if (!dbInstance.pool) {
    throw new Error('Database pool not initialized');
  }

  const store = new PostgresSessionStore({
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
      secure: app.get("env") === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }));

  // Passport setup
  app.use(passport.initialize());
  app.use(passport.session());

  configurePassportStrategy();
  setupPassportSerialization();
}

function configurePassportStrategy() {
  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true
  }, async (req, username, password, done) => {
    try {
      const loginType = req.body.loginType as UserRole || 'customer';

      if (!username || !password) {
        return done(null, false, { message: "Missing credentials" });
      }

      const [user] = await db.select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user || user.role !== loginType) {
        return done(null, false, { message: "Invalid credentials" });
      }

      const isValid = await authService.comparePasswords(password, user.password);
      if (!isValid) {
        return done(null, false, { message: "Invalid credentials" });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
}

function setupPassportSerialization() {
  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        return done(null, false);
      }

      const sanitizedUser: Omit<User, 'password'> = {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role as UserRole,
        phoneNumber: user.phoneNumber,
        lastOtpCode: user.lastOtpCode,
        otpExpiry: user.otpExpiry,
        kycStatus: user.kycStatus,
        createdAt: user.createdAt,
        plaidAccessToken: user.plaidAccessToken,
        faceIdHash: user.faceIdHash
      };

      done(null, sanitizedUser);
    } catch (err) {
      done(err);
    }
  });
}

export default setupAuth;