// Type declarations
declare module 'express-session' {
  interface SessionData {
    userId: number;
    userRole: string;
    phoneNumber?: string;
  }
}

import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema } from "@db/schema";
import { db } from "@db";
import { eq, or, sql } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import SMSService from "./services/sms";
import jwt from 'jsonwebtoken';

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

// Add types for user roles
type UserRole = "admin" | "customer" | "merchant";

interface User {
  id: number;
  username: string;
  password: string;
  email: string;
  name: string;
  role: UserRole;
  phoneNumber: string;
  lastOtpCode: string | null;
  otpExpiry: Date | null;
  platform?: string;
  kycStatus?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

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

// AuthService class definition
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
      expiresIn: '30d', // Match session duration
      algorithm: 'HS256'
    });
  }

  async hashPassword(password: string): Promise<string> {
    this.logger.debug("Generating password hash");
    const salt = randomBytes(this.config.saltLength).toString("hex");
    const derivedKey = (await scryptAsync(password, salt, this.config.keyLength)) as Buffer;
    return `${derivedKey.toString("hex")}.${salt}`;
  }

  async comparePasswords(supplied: string, stored: string): Promise<boolean> {
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

  async verifyPassword(supplied: string, stored: string): Promise<boolean> {
    return this.comparePasswords(supplied, stored);
  }
}

// Create authService instance
export const authService = new AuthService();

export async function setupAuth(app: Express): Promise<void> {
  console.log('[Auth] Starting auth setup...');

  // Session setup with initialized pool
  console.log('[Auth] Creating session store...');
  const store = new PostgresSessionStore({
    pool: db.$client,
    createTableIfMissing: true,
    tableName: 'user_sessions'
  });
  console.log('[Auth] Session store created');

  // Session middleware setup
  console.log('[Auth] Setting up session middleware');
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
  console.log('[Auth] Session middleware configured');

  // Passport initialization
  console.log('[Auth] Initializing Passport...');
  app.use(passport.initialize());
  app.use(passport.session());
  console.log('[Auth] Passport initialized');

  // Add header validation middleware
  app.use((req, res, next) => {
    if (req.user) {
      console.log('[Auth] Setting user headers for request');
      const user = req.user as User;
      req.headers['x-replit-user-id'] = user.id.toString();
      req.headers['x-replit-user-name'] = user.username;
      req.headers['x-replit-user-roles'] = user.role;
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

        if (!username || !password) {
          return done(null, false, { message: "Missing credentials" });
        }

        if (loginType === 'admin' || loginType === 'merchant') {
          const [userRecord] = await db.select().from(users)
            .where(eq(users.username, username))
            .limit(1);

          if (!userRecord || userRecord.role !== loginType) {
            return done(null, false, { message: "Invalid credentials" });
          }

          const isValid = await authService.comparePasswords(password, userRecord.password);
          if (!isValid) {
            return done(null, false, { message: "Invalid credentials" });
          }

          const user: User = {
            ...userRecord,
            name: userRecord.name || '',
            phoneNumber: userRecord.phoneNumber || ''
          };

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

        if (!userRecord || userRecord.role !== 'customer') {
          return done(null, false, { message: "Invalid account" });
        }

        if (!userRecord.lastOtpCode || !userRecord.otpExpiry || new Date() > userRecord.otpExpiry) {
          return done(null, false, { message: "OTP expired or invalid" });
        }

        if (userRecord.lastOtpCode.trim() !== password.trim()) {
          return done(null, false, { message: "Invalid OTP" });
        }

        const user: User = {
          ...userRecord,
          name: userRecord.name || '',
          phoneNumber: userRecord.phoneNumber || ''
        };

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

  // User serialization
  passport.serializeUser((user: Express.User, done) => {
    const typedUser = user as User;
    done(null, typedUser.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [userRecord] = await db.select().from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!userRecord) {
        return done(null, false);
      }

      const user: User = {
        ...userRecord,
        name: userRecord.name || '',
        phoneNumber: userRecord.phoneNumber || ''
      };

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

      // First, check for existing username or email
      const [existingUser] = await db.select().from(users)
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
        const adminCount = await db.select({ count: sql`count(*)` })
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
      const [user] = await db.insert(users)
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

  app.post("/api/login", (req, res, next) => {
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

  // OTP endpoints
  app.post('/api/sendOTP', async (req, res) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      console.log('[AUTH] Generating OTP for:', phoneNumber);
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 5); // 5 minute expiry

      console.log('[AUTH] Attempting to send OTP');
      const sent = await SMSService.sendOTP(phoneNumber, otp);

      if (!sent) {
        return res.status(500).json({ error: 'Failed to send OTP' });
      }

      // Update user with new OTP
      const updateResult = await db.update(users)
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