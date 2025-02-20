import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
<<<<<<< HEAD
import bcrypt from "bcrypt";
import { users } from "@db/schema";
import { db, dbInstance } from "@db";
import { eq } from "drizzle-orm";
import jwt from 'jsonwebtoken';
import { logger } from "./lib/logger";
import { AUTH_ERROR_CODES } from './lib/errors';
=======
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { timingSafeEqual, randomBytes } from 'crypto';
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema } from "@db/schema";
import { db } from "@db";
const dbInstance = db; // Use db object directly
import { eq, or, sql, and } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import SMSService from "./services/sms"; // Added import for sms service
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116

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

class AuthError extends Error {
  public statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
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

  async validateOTP(phoneNumber: string, otp: string): Promise<boolean> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phoneNumber))
        .limit(1);

      if (!user || !user.lastOtpCode || !user.otpExpiry) {
        console.error('[AuthService] Invalid OTP validation attempt:', {
          userId: user?.id,
          phone: phoneNumber,
          hasOtp: !!user?.lastOtpCode,
          hasExpiry: !!user?.otpExpiry
        });
        return false;
      }

      const now = new Date();
      const expiry = new Date(user.otpExpiry);
      if (now > expiry) {
        console.error('[AuthService] OTP expired:', {
          userId: user.id,
          phone: phoneNumber,
          expiry: expiry.toISOString(),
          now: now.toISOString()
        });
        return false;
      }

      return timingSafeEqual(
        Buffer.from(user.lastOtpCode.trim()),
        Buffer.from(otp.trim())
      );
    } catch (error) {
      console.error('[AuthService] OTP validation error:', error);
      return false;
    }
  }
}

export const authService = new AuthService();

export function setupAuth(app: Express): void {
  logger.info('[Auth] Starting auth setup...', {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });

  app.set('trust proxy', 1);

  if (!dbInstance.pool) {
    throw new Error('Database pool not initialized');
  }

<<<<<<< HEAD
  const PostgresStore = connectPg(session);
  const store = new PostgresStore({
=======
// Add types for user roles
type UserRole = "admin" | "customer" | "merchant";
type User = {
  id: number;
  username: string;
  password: string;
  email: string;
  name: string;
  role: UserRole;
  phoneNumber: string; // Added phoneNumber
  lastOtpCode: string | null; // Added OTP fields
  otpExpiry: string | null;
};

// Rate limiting configuration
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many auth attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip
});

// Request validation schemas
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  loginType: z.enum(['customer', 'merchant', 'admin'])
});

export function setupAuth(app: Express) {
  // Security headers
  app.use(helmet());

  // Apply rate limiting to auth routes
  app.use('/api/login', authLimiter);
  app.use('/api/register', authLimiter);

  // Session setup with enhanced security
  const store = new PostgresSessionStore({
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
    pool: dbInstance.pool,
    createTableIfMissing: true,
    tableName: 'user_sessions'
  });

<<<<<<< HEAD
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

=======
  app.use(
    session({
      store,
      secret: process.env.REPL_ID!,
      resave: false,
      saveUninitialized: false,
      name: '_sid',
      cookie: {
        secure: app.get("env") === "production",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'strict'
      },
      rolling: true, // Refresh session with activity
    })
  );

  // Enhanced session security middleware
  app.use((req, res, next) => {
    if (req.session && !req.session.created) {
      req.session.created = Date.now();
      req.session.otpAttempts = 0;
    }

    // Regenerate session ID periodically
    if (req.session.created && Date.now() - req.session.created > 3600000) {
      req.session.regenerate(() => {
        req.session.created = Date.now();
        next();
      });
      return;
    }
    next();
  });

  // Passport setup
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true
  }, async (req, username, password, done) => {
    const requestId = req.headers['x-request-id'] as string;

<<<<<<< HEAD
    try {
      logger.info('[Auth] Attempting login', { 
=======
  passport.use(
    new LocalStrategy({
      usernameField: 'username',
      passwordField: 'password',
      passReqToCallback: true
    }, async (req, username, password, done) => {
      console.log('[AUTH] Login attempt:', {
        username,
        loginType: req.body.loginType,
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent']
      });
      console.log("[Auth] Login attempt:", {
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
        username,
        loginType: req.body.loginType,
        requestId
      });

      if (!username || !password) {
        throw new AuthError('MISSING_CREDENTIALS', 'Missing credentials', 400);
      }

<<<<<<< HEAD
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user || !user.password) {
        logger.warn('[Auth] Invalid credentials - user not found', {
=======
        // For admin/merchant, use username & password
        if (loginType === 'admin' || loginType === 'merchant') {
          let [userRecord] = await dbInstance
            .select()
            .from(users)
            .where(eq(users.username, username))
            .limit(1);

          if (!userRecord || userRecord.role !== loginType) {
            return done(null, false, { message: "Invalid credentials" });
          }

          const isValid = await comparePasswords(password, userRecord.password);
          if (!isValid) {
            return done(null, false, { message: "Invalid credentials" });
          }

          return done(null, userRecord);
        }

        // For customers, use phone & OTP only
        // Format phone consistently
        const formatPhone = (phone: string): string => {
          if (!phone) {
            console.error('[Auth] Empty phone number provided');
            throw new Error('Phone number is required');
          }

          // Remove all non-digits and get last 10 digits
          const clean = phone.toString().replace(/\D/g, '').slice(-10);

          if (clean.length !== 10) {
            console.error('[Auth] Invalid phone number format:', {
              phone,
              clean,
              length: clean.length
            });
            throw new Error('Phone number must be 10 digits');
          }

          // Always format as +1XXXXXXXXXX
          const formatted = '+1' + clean;

          console.log('[Auth] Phone formatting successful:', {
            original: phone,
            formatted,
            timestamp: new Date().toISOString(),
            userId: userRecord?.id
          });

          return formatted;
        };

        // Add additional debug logging
        console.log('[Auth] Starting phone validation:', {
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
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

<<<<<<< HEAD
      return done(null, userResponse);
    } catch (err) {
      if (err instanceof AuthError) {
=======
        let [userRecord] = await dbInstance
          .select()
          .from(users)
          .where(eq(users.phoneNumber, fullPhone))
          .limit(1);

        console.log('[AUTH] User lookup result:', {
          phone: fullPhone,
          found: !!userRecord,
          userId: userRecord?.id,
          role: userRecord?.role,
          hasValidSession: !!req.session,
          timestamp: new Date().toISOString()
        });

        // Enhanced session validation
        if (!req.session) {
          console.error('[AUTH] Invalid session state');
          return done(new Error('Invalid session state'));
        }

        // Enhanced user validation
        if (!userRecord || !userRecord.id) {
          console.error('[AUTH] Invalid user record:', {
            hasUser: !!userRecord,
            phone: formattedPhone,
            timestamp: new Date().toISOString()
          });
          return done(null, false, { message: "Invalid user account" });
        }

        console.log('[AUTH] User lookup with role check:', {
          phone: fullPhone,
          found: !!userRecord,
          role: userRecord?.role,
          userId: userRecord?.id,
          timestamp: new Date().toISOString()
        });

        // Strict role validation
        if (userRecord.role !== 'customer') {
          console.error('[AUTH] Invalid role for OTP login:', {
            userId: userRecord.id,
            role: userRecord.role,
            phone: userRecord.phoneNumber
          });
          return done(null, false, { message: "Invalid account type for OTP login" });
        }

        console.log('[AUTH] Customer lookup result:', {
          phone: fullPhone,
          found: !!userRecord,
          userId: userRecord?.id,
          role: userRecord?.role,
          timestamp: new Date().toISOString()
        });

        // Create customer account if doesn't exist
        if (!userRecord) {
          [userRecord] = await dbInstance
            .insert(users)
            .values({
              username: fullPhone.replace(/\D/g, ''),
              password: await authService.hashPassword(Math.random().toString(36).slice(-8)),
              email: `${fullPhone.replace(/\D/g, '')}@temp.shifi.com`,
              name: '',
              role: 'customer',
              phoneNumber: fullPhone
            })
            .returning();

          console.log('[AUTH] Created new customer account:', {
            userId: userRecord.id,
            phone: fullPhone,
            timestamp: new Date().toISOString()
          });
        } else if (userRecord.role !== 'customer') {
          console.error('[AUTH] Non-customer attempting OTP login:', {
            userId: userRecord.id,
            role: userRecord.role,
            phone: fullPhone
          });
          return done(null, false, { message: "Invalid account type for OTP login" });
        }

        console.log('[AUTH] User lookup result:', {
          phone: fullPhone,
          found: !!userRecord,
          userId: userRecord?.id,
          role: userRecord?.role,
          timestamp: new Date().toISOString()
        });


        // Check if user has valid OTP data
        if (!userRecord.lastOtpCode || !userRecord.otpExpiry) {
          console.error('[AUTH] Missing OTP data:', {
            userId: userRecord.id,
            phone: userRecord.phoneNumber,
            hasOtp: !!userRecord.lastOtpCode,
            hasExpiry: !!userRecord.otpExpiry,
            timestamp: new Date().toISOString()
          });
          return done(null, false, { message: "No active verification code found" });
        }

        // Check if OTP is expired
        const now = new Date();
        const expiry = new Date(userRecord.otpExpiry);
        if (now > expiry) {
          console.error('[AUTH] OTP expired:', {
            userId: userRecord.id,
            phone: userRecord.phoneNumber,
            expiry: expiry.toISOString(),
            now: now.toISOString()
          });
          return done(null, false, { message: "Verification code has expired" });
        }

        // Normalize OTP input
        const normalizedInputOTP = password.trim();
        const normalizedStoredOTP = userRecord.lastOtpCode?.trim();

        // Enhanced OTP validation with rate limiting
        const otpAttempts = (req.session.otpAttempts || 0) + 1;
        req.session.otpAttempts = otpAttempts;

        if (otpAttempts > 5) {
          console.error('[AUTH] Too many OTP attempts:', {
            userId: userRecord.id,
            phone: userRecord.phoneNumber,
            attempts: otpAttempts,
            timestamp: new Date().toISOString()
          });
          return done(null, false, { message: "Too many attempts. Please request a new code." });
        }

        // Enhanced OTP validation with timing-safe comparison
        if (!normalizedStoredOTP || !normalizedInputOTP) {
          console.error('[AUTH] Missing OTP:', {
            userId: userRecord.id,
            phone: userRecord.phoneNumber,
            hasStoredOTP: !!normalizedStoredOTP,
            hasInputOTP: !!normalizedInputOTP,
            timestamp: new Date().toISOString()
          });
          return done(null, false, { message: "Missing verification code" });
        }

        // Use timing-safe comparison
        const validOTP = timingSafeEqual(
          Buffer.from(normalizedStoredOTP),
          Buffer.from(normalizedInputOTP)
        );

        if (!validOTP) {
          console.error('[AUTH] Invalid OTP:', {
            userId: userRecord.id,
            phone: userRecord.phoneNumber,
            hasSession: !!req.session,
            timestamp: new Date().toISOString()
          });
          return done(null, false, { message: "Invalid verification code" });
        }

        // Ensure session is properly initialized
        if (!req.session) {
          console.error('[AUTH] Missing session during OTP validation');
          return done(new Error('Session initialization failed'));
        }

        // Set essential session data
        req.session.userId = userRecord.id;
        req.session.userRole = userRecord.role;
        req.session.phoneNumber = userRecord.phoneNumber;

        console.log('[AUTH] OTP validation successful:', {
          userId: userRecord.id,
          phone: userRecord.phoneNumber,
          otpMatched: true,
          timestamp: new Date().toISOString()
        });

        console.log('[AUTH] OTP validation successful:', {
          userId: userRecord.id,
          phone: userRecord.phoneNumber,
          otpMatched: true
        });


        // Clear used OTP
        await dbInstance
          .update(users)
          .set({ lastOtpCode: null, otpExpiry: null })
          .where(eq(users.id, userRecord.id));

        return done(null, userRecord);
      } catch (err) {
        console.error('Auth error:', err);
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
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

<<<<<<< HEAD
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
=======
  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await dbInstance
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Auth routes
  app.post("/api/register", async (req, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        const error = fromZodError(parsed.error);
        return res.status(400).json({ message: error.message });
      }

      // First, check for existing username or email to prevent unnecessary admin checks
      const [existingUser] = await dbInstance
        .select()
        .from(users)
        .where(
          or(
            eq(users.username, parsed.data.username),
            eq(users.email, parsed.data.email)
          )
        )
        .limit(1);

      if (existingUser) {
        if (existingUser.username === parsed.data.username) {
          return res.status(400).json({ message: "Username already exists" });
        }
        if (existingUser.email === parsed.data.email) {
          return res.status(400).json({ message: "Email already exists" });
        }
      }

      // If registering as admin, check if it's the first admin or if user has admin privileges
      if (parsed.data.role === "admin") {
        // Check for existing admins
        const adminCount = await dbInstance
          .select({ count: sql`count(*)` })
          .from(users)
          .where(eq(users.role, "admin"));

        const isFirstAdmin = adminCount[0].count === 0;
        const isAdminUser = req.user && (req.user as User).role === "admin";

        if (!isFirstAdmin && !isAdminUser) {
          return res.status(403).json({ message: "Only admins can create admin accounts" });
        }
      }

      // Hash password and create user
      const hashedPassword = await authService.hashPassword(parsed.data.password);
      const [user] = await dbInstance
        .insert(users)
        .values({
          ...parsed.data,
          password: hashedPassword,
        })
        .returning();

      req.login(user, (err) => {
        if (err) {
          console.error('Login after registration error:', err);
          return res.status(500).json({ message: "Login failed after registration" });
        }
        res.status(201).json(user);
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post(["/api/login", "/api/auth/login", "/api/login/merchant"], (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      console.log('Auth attempt:', {
        body: req.body,
        error: err,
        user: user,
        info: info
      });

>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
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

<<<<<<< HEAD
  logger.info('[Auth] Auth setup completed successfully');
=======
  app.get("/api/user", (req, res) => {
    if (!req.user) {
      return res.sendStatus(401);
    }
    res.json(req.user);
  });

  // Added OTP related endpoints
  app.post('/api/sendOTP', async (req, res) => {
    console.log('[AUTH] Received OTP request:', {
      body: req.body,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });

    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      console.error('[AUTH] Missing phone number in request');
      return res.status(400).json({ error: 'Phone number is required' });
    }

    try {
      console.log('[AUTH] Generating OTP for:', phoneNumber);
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 5); // OTP expires in 5 minutes

      console.log('[AUTH] Attempting to send OTP');
      const sent = await SMSService.sendOTP(phoneNumber, otp);

      if (!sent) {
        console.error('[AUTH] SMS service failed to send OTP');
        return res.status(500).json({ error: 'Failed to send OTP' });
      }

      // Update user with new OTP
      const updateResult = await dbInstance
        .update(users)
        .set({
          lastOtpCode: otp,
          otpExpiry: expiry
        })
        .where(eq(users.phoneNumber, phoneNumber))
        .returning();

      console.log('[AUTH] OTP Update result:', {
        phone: phoneNumber,
        otpSet: !!updateResult[0]?.lastOtpCode,
        timestamp: new Date().toISOString()
      });

      res.json({ message: 'OTP sent successfully' });
    } catch (error) {
      console.error('Error sending OTP:', error);
      res.status(500).json({ message: 'Failed to send OTP' });
    }
  });
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
}