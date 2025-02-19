import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { users } from "@db/schema";
import { db, dbInstance } from "@db";
import { eq } from "drizzle-orm";
import jwt from 'jsonwebtoken';
import { logger } from "./lib/logger";

export type UserRole = "admin" | "customer" | "merchant";

interface BaseUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  name?: string;
}

export interface User extends BaseUser {
  password?: string;
}

declare global {
  namespace Express {
    interface User extends BaseUser {}
  }
}

class AuthService {
  private readonly saltRounds = 10;
  private readonly jwtSecret = process.env.JWT_SECRET || process.env.REPL_ID || 'development-secret';

  async comparePasswords(supplied: string, stored: string): Promise<boolean> {
    try {
      return supplied && stored ? bcrypt.compare(supplied, stored) : false;
    } catch (error) {
      logger.error("[Auth] Password comparison error:", error);
      return false;
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async generateJWT(user: Express.User): Promise<string> {
    const payload = {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name
    };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '30d' });
  }

  verifyJWT(token: string): Express.User | null {
    try {
      return jwt.verify(token, this.jwtSecret) as Express.User;
    } catch (error) {
      logger.error("[Auth] JWT verification failed:", error);
      return null;
    }
  }
}

export const authService = new AuthService();

export function setupAuth(app: Express): void {
  logger.info('[Auth] Starting auth setup...');

  const store = new (connectPg(session))({
    pool: dbInstance.pool!,
    createTableIfMissing: true,
    tableName: 'user_sessions'
  });

  app.set('trust proxy', 1);

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

  configurePassport();

  logger.info('[Auth] Auth setup completed successfully');
}

function configurePassport() {
  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true
  }, async (req, username, password, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user?.password || !(await authService.comparePasswords(password, user.password))) {
        return done(null, false, { message: "Invalid credentials" });
      }

      return done(null, {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role as UserRole,
        name: user.name
      });
    } catch (err) {
      return done(err);
    }
  }));

  passport.serializeUser((user: Express.User, done) => done(null, user.id));

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      done(null, user ? {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role as UserRole,
        name: user.name
      } : false);
    } catch (err) {
      done(err);
    }
  });
}

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

app.get("/api/user", (req, res) => {
  if (!req.user) {
    logger.info('[Auth] Unauthorized access to /api/user');
    return res.status(401).json({ error: "Authentication required" });
  }
  logger.info('[Auth] User data retrieved:', { userId: req.user.id });
  res.json(req.user);
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