import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
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

export function setupAuth(app: Express) {
  // Session setup
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
      cookie: {
        secure: app.get("env") === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

  // Passport setup
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
          const [user] = await dbInstance // Use dbInstance here
            .select()
            .from(users)
            .where(eq(users.username, username))
            .limit(1);

          if (!user || user.role !== loginType) {
            return done(null, false, { message: "Invalid credentials" });
          }

          const isValid = await comparePasswords(password, user.password);
          if (!isValid) {
            return done(null, false, { message: "Invalid credentials" });
          }

          return done(null, user);
        }

        // For customers, use phone & OTP only
        const formatPhone = (phone: string): string => {
          if (!phone) {
            console.error('[Auth] Empty phone number provided');
            throw new Error('Phone number is required');
          }

          // Remove all non-digits
          let clean = phone.toString().replace(/\D/g, '');

          // Remove leading 1 if present
          clean = clean.replace(/^1/, '');

          // Validate length
          if (clean.length !== 10) {
            console.error('[Auth] Invalid phone number format:', { 
              phone, 
              clean,
              length: clean.length 
            });
            throw new Error('Phone number must be 10 digits');
          }

          // Add +1 prefix
          const formatted = '+1' + clean;
          console.log('[Auth] Phone formatting successful:', { 
            original: phone, 
            formatted,
            timestamp: new Date().toISOString()
          });
          return formatted;
        };

        // Format phone consistently
        const fullPhone = formatPhone(username);
        console.log('[AUTH] Phone formatting:', {
          original: username,
          formatted: fullPhone,
          timestamp: new Date().toISOString()
        });

        // First find customer by exact phone match with strict role validation
        let [user] = await dbInstance
          .select()
          .from(users)
          .where(
            and(
              eq(users.phoneNumber, fullPhone),
              sql`role = 'customer'`
            )
          )
          .orderBy(sql`created_at DESC`)
          .limit(1);

        console.log('[AUTH] User lookup with role check:', {
          phone: fullPhone,
          found: !!user,
          role: user?.role,
          userId: user?.id,
          timestamp: new Date().toISOString()
        });

        // Double check role to prevent any SQL query issues
        if (user && user.role !== 'customer') {
          console.error('[AUTH] Invalid role found:', {
            userId: user.id,
            role: user.role,
            phone: fullPhone
          });
          user = null;
        }

        console.log('[AUTH] Customer lookup result:', {
          phone: fullPhone,
          found: !!user,
          userId: user?.id,
          role: user?.role,
          timestamp: new Date().toISOString()
        });

        console.log('[AUTH] Customer lookup result:', {
          phone: fullPhone,
          found: !!user,
          userId: user?.id,
          role: user?.role,
          timestamp: new Date().toISOString()
        });

        // Strictly validate customer role
        if (!user || user.role !== 'customer') {
          console.error('[AUTH] Invalid role or user not found:', {
            phone: fullPhone,
            userId: user?.id,
            role: user?.role
          });
          return done(null, false, { message: "Invalid account type for OTP login" });
        }

        console.log('[AUTH] User lookup result:', {
          phone: fullPhone,
          found: !!user,
          userId: user?.id,
          role: user?.role,
          timestamp: new Date().toISOString()
        });

        // Verify this is a customer account
        if (user && user.role !== 'customer') {
          console.error('[AUTH] Invalid role for phone number:', {
            phone: fullPhone,
            userId: user.id,
            role: user.role
          });
          return done(null, false, { message: "Invalid account type" });
        }

        if (!user || !user.id) {
          console.error('[AUTH] Invalid user data:', {
            phone: fullPhone,
            user,
            timestamp: new Date().toISOString()
          });
          return done(null, false, { message: "Invalid user data" });
        }

        // Additional validation
        if (user.role !== 'customer') {
          console.error('[AUTH] Invalid role for OTP login:', {
            userId: user.id,
            role: user.role,
            phone: fullPhone
          });
          return done(null, false, { message: "Invalid account type for OTP login" });
        }

        console.log('[AUTH] User validated successfully:', {
          userId: user.id,
          phone: fullPhone,
          role: user.role,
          timestamp: new Date().toISOString()
        });

        if (!user) {
          // Create new user if doesn't exist
          const newUser = await dbInstance // Use dbInstance here
            .insert(users)
            .values({
              username: fullPhone,
              password: Math.random().toString(36).slice(-8),
              email: `${fullPhone.replace(/\D/g, '')}@temp.shifi.com`,
              name: '',
              role: 'customer',
              phoneNumber: fullPhone,
            })
            .returning()
            .then(rows => rows[0]);
          user = newUser;
        }

        console.log('[AUTH] OTP Validation Details:', {
          storedOtp: user.lastOtpCode,
          providedOtp: password,
          otpExpiry: user.otpExpiry,
          currentTime: new Date().toISOString(),
          expiryValid: user.otpExpiry ? new Date(user.otpExpiry) > new Date() : false,
          phoneNumber: fullPhone,
          userId: user.id,
          role: user.role
        });

        console.log('Verifying OTP:', {
          storedOtp: user.lastOtpCode,
          providedOtp: password,
          otpExpiry: user.otpExpiry
        });

        if (!user.lastOtpCode || !user.otpExpiry) {
          console.error('[AUTH] Missing OTP or expiry:', {
            hasOtp: !!user.lastOtpCode,
            hasExpiry: !!user.otpExpiry
          });
          return done(null, false, { message: "No active OTP found" });
        }

        // Check if user has OTP data
        if (!user.lastOtpCode || !user.otpExpiry || user.role !== 'customer') {
          console.error('[AUTH] Invalid OTP attempt:', {
            userId: user.id,
            phone: user.phoneNumber,
            role: user.role,
            hasOtp: !!user.lastOtpCode,
            hasExpiry: !!user.otpExpiry,
            timestamp: new Date().toISOString()
          });
          return done(null, false, { message: "Invalid verification attempt" });
        }

        // Verify this is a customer account
        if (user.role !== 'customer') {
          console.error('[AUTH] Non-customer attempting OTP login:', {
            userId: user.id,
            role: user.role,
            phone: fullPhone
          });
          return done(null, false, { message: "Invalid account type for OTP login" });
        }

        // Check if OTP is expired
        const now = new Date();
        const expiry = new Date(user.otpExpiry);
        if (now > expiry) {
          console.error('[AUTH] OTP expired:', {
            userId: user.id,
            phone: user.phoneNumber,
            expiry: expiry.toISOString(),
            now: now.toISOString()
          });
          return done(null, false, { message: "Verification code has expired" });
        }

        // Normalize OTP input
        const normalizedInputOTP = password.trim();
        const normalizedStoredOTP = user.lastOtpCode?.trim();

        // Enhanced OTP validation
        if (!normalizedStoredOTP || !normalizedInputOTP) {
          console.error('[AUTH] Missing OTP:', {
            userId: user.id,
            phone: user.phoneNumber,
            hasStoredOTP: !!normalizedStoredOTP,
            hasInputOTP: !!normalizedInputOTP,
            timestamp: new Date().toISOString()
          });
          return done(null, false, { message: "Missing verification code" });
        }

        // Compare OTP with stored value
        if (normalizedStoredOTP !== normalizedInputOTP) {
          console.error('[AUTH] Invalid OTP:', {
            userId: user.id,
            phone: user.phoneNumber,
            expected: normalizedStoredOTP,
            received: normalizedInputOTP,
            timestamp: new Date().toISOString(),
            otpExpiry: user.otpExpiry,
            currentTime: new Date().toISOString()
          });
          return done(null, false, { message: "Invalid verification code" });
        }

        console.log('[AUTH] OTP validation successful:', {
          userId: user.id,
          phone: user.phoneNumber,
          otpMatched: true,
          timestamp: new Date().toISOString()
        });

        console.log('[AUTH] OTP validation successful:', {
          userId: user.id,
          phone: user.phoneNumber,
          otpMatched: true
        });


        // Clear used OTP
        await dbInstance // Use dbInstance here
          .update(users)
          .set({ lastOtpCode: null, otpExpiry: null })
          .where(eq(users.id, user.id));

        return done(null, user);
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