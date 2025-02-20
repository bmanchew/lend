import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { users } from "@db/schema";
import { db, dbInstance } from "@db";
import { eq } from "drizzle-orm";
import jwt from 'jsonwebtoken';
import { logger } from "./lib/logger";

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
      name: user.name
    };

    const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';
    return jwt.sign(payload, jwtSecret, { expiresIn: '30d' });
  }

  async verifyJWT(token: string): Promise<Express.User | null> {
    return new Promise((resolve, reject) => {
      try {
        const jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';
        jwt.verify(token, jwtSecret, (err, decoded) => {
          if (err) {
            reject(err);
          } else {
            resolve(decoded as Express.User);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const authService = new AuthService();

export function setupAuth(app: Express): void {
  logger.info('[Auth] Starting auth setup...');

  app.set('trust proxy', 1);

  if (!dbInstance.pool) {
    throw new Error('Database pool not initialized');
  }

  const PostgresStore = connectPg(session);
  const store = new PostgresStore({
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
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'none'
    },
    proxy: true
  }));

  app.use(passport.initialize());
  app.use(passport.session());

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

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
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
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/login", async (req, res, next) => {
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

        // Log the user in
        req.logIn(user, (err) => {
          if (err) {
            logger.error('[Auth] Session login error:', err);
            return next(err);
          }

          return res.json({
            ...user,
            token
          });
        });
      } catch (error) {
        logger.error('[Auth] Token generation error:', error);
        return res.status(500).json({ error: 'Failed to generate authentication token' });
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
      const verifiedUser = await authService.verifyJWT(token);
      if (!verifiedUser) {
          return res.status(401).json({ error: 'Invalid token' });
      }
      logger.info('[Auth] User data retrieved:', { userId: verifiedUser.id });
      res.json(verifiedUser);
    } catch (error) {
      logger.error('[Auth] Error retrieving user data:', error);
      res.status(500).json({ error: 'Failed to retrieve user data' });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        logger.error('[Auth] Logout error:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.sendStatus(200);
    });
  });

  logger.info('[Auth] Auth setup completed successfully');
}