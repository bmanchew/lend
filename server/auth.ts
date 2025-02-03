import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
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

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

interface AuthConfig {
  saltLength: number;
  keyLength: number;
  sessionDuration: number;
}

class AuthService {
  private readonly config: AuthConfig = {
    saltLength: 16,
    keyLength: 32,
    sessionDuration: 30 * 24 * 60 * 60 * 1000 // 30 days
  };

  private readonly logger = {
    info: (message: string, meta?: any) => console.log(`[AuthService] ${message}`, meta),
    error: (message: string, meta?: any) => console.error(`[AuthService] ${message}`, meta),
    debug: (message: string, meta?: any) => console.debug(`[AuthService] ${message}`, meta)
  };

  async hashPassword(password: string): Promise<string> {
    this.logger.debug("Generating password hash");
    const salt = randomBytes(this.config.saltLength).toString("hex");
    const derivedKey = (await scryptAsync(password, salt, this.config.keyLength)) as Buffer;
    return `${derivedKey.toString("hex")}.${salt}`;
  }

  async comparePasswords(supplied: string, stored: string) {
    console.log("[AuthService] Comparing passwords");
    try {
      if (!supplied || !stored) return false;
      const [hashedPassword, salt] = stored.split(".");
      if (!hashedPassword || !salt) return false;
      const suppliedBuf = (await scryptAsync(supplied, salt, 32)) as Buffer;
      const storedBuf = Buffer.from(hashedPassword, "hex");
      return suppliedBuf.length === storedBuf.length && timingSafeEqual(storedBuf, suppliedBuf);
    } catch (error) {
      console.error("[AuthService] Password comparison error:", error);
      return false;
    }
  }
}

export const authService = new AuthService();

async function comparePasswords(supplied: string, stored: string) {
  console.log("[Auth] Comparing passwords");
  try {
    // Validate input
    if (!supplied || !stored) {
      console.error("[Auth] Invalid password comparison input", {
        suppliedExists: !!supplied,
        storedExists: !!stored
      });
      return false;
    }

    const [hashedPassword, salt] = stored.split(".");
    if (!hashedPassword || !salt) {
      console.error("[Auth] Invalid stored password format");
      return false;
    }

    const suppliedBuf = (await scryptAsync(supplied, salt, 32)) as Buffer;
    const storedBuf = Buffer.from(hashedPassword, "hex");

    // Ensure both buffers are the same length before comparison
    if (suppliedBuf.length !== storedBuf.length) {
      console.error("[Auth] Buffer length mismatch", {
        suppliedLength: suppliedBuf.length,
        storedLength: storedBuf.length
      });
      return false;
    }

    const isMatch = timingSafeEqual(storedBuf, suppliedBuf);
    console.log("[Auth] Password comparison result:", { isMatch });
    return isMatch;
  } catch (error) {
    console.error("[Auth] Password comparison error:", error);
    return false;
  }
}

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
  app.post('/api/auth/login', async (req, res) => {
  console.log('[Auth] Login request received:', {
    body: req.body,
    path: req.path,
    headers: req.headers
  });
    try {
      const { username, password } = req.body;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const validPassword = await authService.verifyPassword(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = authService.generateToken(user);
      res.json({ token, user });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });
  // Security headers
  app.use(helmet());

  // Apply rate limiting to auth routes
  app.use('/api/login', authLimiter);
  app.use('/api/register', authLimiter);

  // Session setup with enhanced security
  const store = new PostgresSessionStore({ 
    pool: dbInstance.pool, // Use dbInstance.pool here
    createTableIfMissing: true,
    tableName: 'user_sessions'
  });

  app.use(
    session({
      store,
      secret: process.env.REPL_ID!,
      resave: false,
      saveUninitialized: false,
      name: '_sid', // Custom session ID name
      rolling: true, // Refresh session with activity
      cookie: {
        maxAge: 3600000,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict'
      },
    })
  );

  // Session security middleware
  app.use((req, res, next) => {
    if (req.session && req.session.userId) {
      // Regenerate session ID periodically
      if (!req.session.created || Date.now() - req.session.created > 3600000) {
        req.session.regenerate(() => {
          req.session.created = Date.now();
          next();
        });
        return;
      }
    }
    next();
  });

  // Passport setup with enhanced security
  app.use(passport.initialize());
  app.use(passport.session());

  // Enhanced auth middleware
  app.use((req, res, next) => {
    // Add request tracking
    const requestId = req.headers['x-request-id'] || Date.now().toString(36);

    // Check session state
    if (!req.session) {
      console.error(`[Auth][${requestId}] Invalid session state`);
      return res.status(401).json({ error: 'Invalid session state' });
    }

    // Set auth headers if user exists
    if (req.user) {
      req.headers['x-user-id'] = req.user.id.toString();
      req.headers['x-user-role'] = req.user.role;

      // Regenerate session periodically for security
      if (!req.session.created || Date.now() - req.session.created > 3600000) {
        return req.session.regenerate(() => {
          req.session.created = Date.now();
          next();
        });
      }
    }

    next();
  });

  // Enhanced header validation middleware
  app.use((req, res, next) => {
    // Check for session
    if (!req.session) {
      console.error('[Auth] Invalid session state');
      return res.status(401).json({ error: 'Invalid session state' });
    }

    // If user exists in session, set headers
    if (req.user) {
      req.headers['x-replit-user-id'] = req.user.id.toString();
      req.headers['x-replit-user-name'] = req.user.username;
      req.headers['x-replit-user-roles'] = req.user.role;

      // Regenerate session periodically
      if (!req.session.created || Date.now() - req.session.created > 3600000) {
        return req.session.regenerate(() => {
          req.session.created = Date.now();
          next();
        });
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
      console.log("[Auth] Login attempt:", {
        username,
        loginType: req.body.loginType,
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent']
      });
      try {
        const loginType = req.body.loginType || 'customer';

        // Ensure we have required credentials
        if (!username || !password) {
          return done(null, false, { message: "Missing credentials" });
        }

        // For admin/merchant, use username & password
        if (loginType === 'admin' || loginType === 'merchant') {
          let [userRecord] = await dbInstance // Use dbInstance here
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
          username,
          loginType: req.body.loginType,
          timestamp: new Date().toISOString()
        });

        // Format phone consistently
        const formattedPhone = formatPhone(username);
        console.log('[AUTH] Phone formatting:', {
          original: username,
          formatted: formattedPhone,
          timestamp: new Date().toISOString()
        });

        // Ensure consistent phone format for lookup
        const normalizedPhone = formattedPhone.replace(/\D/g, '').slice(-10);
        const fullPhone = '+1' + normalizedPhone;

        console.log('[AUTH] Looking up user with phone:', {
          original: formattedPhone,
          normalized: fullPhone,
          timestamp: new Date().toISOString()
        });

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
              password: await hashPassword(Math.random().toString(36).slice(-8)),
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
        await dbInstance // Use dbInstance here
          .update(users)
          .set({ lastOtpCode: null, otpExpiry: null })
          .where(eq(users.id, userRecord.id));

        return done(null, userRecord);
      } catch (err) {
        console.error('Auth error:', err);
        return done(err);
      }
    })
  );

  passport.serializeUser((user: User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await dbInstance // Use dbInstance here
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
      const [existingUser] = await dbInstance // Use dbInstance here
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
        const adminCount = await dbInstance // Use dbInstance here
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
      const hashedPassword = await hashPassword(parsed.data.password);
      const [user] = await dbInstance // Use dbInstance here
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

  app.post("/api/auth/login", (req, res, next) => {
    console.log('[Auth] Login request received:', {
      body: req.body,
      path: req.path,
      timestamp: new Date().toISOString()
    });
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      console.log('Auth attempt:', {
        body: req.body,
        error: err,
        user: user,
        info: info
      });

      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: "Login failed" });
      }
      if (!user) {
        console.error('Auth failed:', info);
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error('Login session error:', err);
          return res.status(500).json({ message: "Login failed" });
        }
        res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    req.logout(() => {
      res.sendStatus(200);
    });
  });

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
      const sent = await SMSService.sendOTP(phoneNumber, otp); // Send OTP via Twilio

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


}