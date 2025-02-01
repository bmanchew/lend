import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema } from "@db/schema";
import { db, pool } from "@db";
import { eq, or, sql } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import { smsService } from "./services/sms"; // Added import for sms service

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

async function hashPassword(password: string) {
  console.log("[Auth] Generating password hash");
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${derivedKey.toString("hex")}.${salt}`;
}

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
    pool, 
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
      try {
        const loginType = req.body.loginType || 'customer';

        // For admin/merchant, use username & password
        if (loginType === 'admin' || loginType === 'merchant') {
          const [user] = await db
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

        // For customers, use phone & OTP
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.phoneNumber, username))
          .limit(1);

        if (!user || user.role !== 'customer') {
          return done(null, false, { message: "Invalid phone number" });
        }

        const isOtpValid = user.lastOtpCode === password && 
                        user.otpExpiry && 
                        new Date(user.otpExpiry) > new Date();

        if (!isOtpValid) {
          return done(null, false, { message: "Invalid or expired code" });
        }

        // Clear used OTP
        await db
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
      const [user] = await db
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
      const [existingUser] = await db
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
        const adminCount = await db
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
      const [user] = await db
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
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: "Login failed" });
      }
      if (!user) {
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
      const sent = await smsService.sendOTP(phoneNumber, otp); // Send OTP via Twilio

      if (!sent) {
        console.error('[AUTH] SMS service failed to send OTP');
        return res.status(500).json({ error: 'Failed to send OTP' });
      }

      await db.update(users).set({ lastOtpCode: otp, otpExpiry: expiry.toISOString() }).where(eq(users.phoneNumber, phoneNumber));
      res.json({ message: 'OTP sent successfully' });
    } catch (error) {
      console.error('Error sending OTP:', error);
      res.status(500).json({ message: 'Failed to send OTP' });
    }
  });


}