import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request } from "express";
import bcrypt from "bcrypt";
import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import jwt from 'jsonwebtoken';
import { logger } from "./lib/logger";

export type UserRole = "admin" | "customer" | "merchant";

interface AuthConfig {
  saltRounds: number;
  jwtDuration: number;
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
    jwtDuration: 30 * 24 * 60 * 60 // 30 days in seconds
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
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
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
}

export const authService = new AuthService();

export function setupAuth(app: Express): void {
  logger.info('[Auth] Starting auth setup...');

  // Initialize passport but don't set up sessions
  app.use(passport.initialize());

  // Set up the local strategy for username/password auth
  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true
  }, async (req, username, password, done) => {
    try {
      const loginType = req.body.loginType as UserRole;
      logger.info('[Auth] Login attempt:', { username, loginType });

      if (!username || !password) {
        logger.error('[Auth] Missing credentials');
        return done(null, false, { message: "Missing credentials" });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      logger.info('[Auth] User lookup result:', { 
        found: !!user,
        username,
        requestedRole: loginType,
        actualRole: user?.role,
        hasPassword: !!user?.password
      });

      if (!user || !user.password) {
        logger.error('[Auth] User not found or invalid password');
        return done(null, false, { message: "Invalid credentials" });
      }

      // Enhanced role validation for admin users
      if (loginType === 'admin' && user.role !== 'admin') {
        logger.error('[Auth] Unauthorized admin access attempt:', {
          username,
          actualRole: user.role
        });
        return done(null, false, { message: "This login is for admin accounts only" });
      }

      const isValid = await authService.comparePasswords(password, user.password);
      logger.info('[Auth] Password verification result:', { 
        username,
        isValid,
        passwordLength: password.length,
        storedPasswordLength: user.password.length
      });

      if (!isValid) {
        logger.error('[Auth] Invalid password for user:', username);
        return done(null, false, { message: "Invalid credentials" });
      }

      const userResponse: Express.User = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role as UserRole,
        name: user.name || undefined
      };

      logger.info('[Auth] Login successful:', {
        userId: user.id,
        role: user.role,
        loginType
      });

      return done(null, userResponse);
    } catch (err) {
      logger.error('[Auth] Login error:', err);
      return done(err);
    }
  }));

  app.post("/api/auth/login", async (req, res, next) => {
    logger.info('[Auth] Login attempt with:', { 
      username: req.body.username?.trim(), 
      loginType: req.body.loginType,
      hasPassword: !!req.body.password,
      timestamp: new Date().toISOString()
    });

    passport.authenticate('local', async (err: any, user: Express.User | false, info: any) => {
      if (err) {
        logger.error('[Auth] Login error:', err);
        return next(err);
      }

      if (!user) {
        logger.error('[Auth] Authentication failed:', info);
        return res.status(401).json({ error: info.message || 'Authentication failed' });
      }

      try {
        const token = await authService.generateJWT(user);
        logger.info('[Auth] Generated JWT token for user:', { userId: user.id });

        return res.json({
          ...user,
          token
        });
      } catch (error) {
        logger.error('[Auth] Token generation error:', error);
        return res.status(500).json({ error: 'Failed to generate authentication token' });
      }
    })(req, res, next);
  });

  app.get("/api/user", (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = authService.verifyJWT(token || '');
    if (!user) {
      logger.info('[Auth] Unauthorized access to /api/user');
      return res.status(401).json({ error: "Authentication required" });
    }
    logger.info('[Auth] User data retrieved:', { userId: user.id });
    res.json(user);
  });

  app.post("/api/logout", (req, res) => {
    res.sendStatus(200); //No logout needed with JWT
  });

  logger.info('[Auth] Auth setup completed successfully');
}