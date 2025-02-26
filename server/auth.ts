import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { users } from "@db/schema";
import { db, dbInstance } from "@db";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { logger } from "./lib/logger";
import { AuthError, AUTH_ERROR_CODES } from "./lib/errors";

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
  phoneNumber?: string;
  lastOtpCode?: string | null;
  otpExpiry?: Date | null;
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
    sessionDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
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
      id: user.id.toString(), // Convert to string for JWT
      role: user.role,
      email: user.email,
      name: user.name,
    };

    const jwtSecret =
      process.env.JWT_SECRET || process.env.REPL_ID || "development-secret";
    return jwt.sign(payload, jwtSecret, { expiresIn: "30d" });
  }

  verifyJWT(token: string): Express.User {
    try {
      const jwtSecret =
        process.env.JWT_SECRET || process.env.REPL_ID || "development-secret";
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      logger.debug("[Auth] JWT verified successfully", {
        hasId: !!decoded.id,
        idType: typeof decoded.id,
        role: decoded.role,
        timestamp: new Date().toISOString()
      });
      
      // Ensure id is a number - JWT may store it as a string
      const userId = typeof decoded.id === 'string' ? parseInt(decoded.id, 10) : decoded.id;
      
      const userResponse: Express.User = {
        id: userId,
        username: decoded.username || decoded.id?.toString() || '',
        email: decoded.email || '',
        role: decoded.role as UserRole,
        name: decoded.name || null,
        phoneNumber: decoded.phoneNumber || null
      };
      
      return userResponse;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        logger.warn("[Auth] JWT token expired", {
          error: err.message,
          timestamp: new Date().toISOString()
        });
        throw new AuthError(
          401,
          "Token expired",
          AUTH_ERROR_CODES.TOKEN_EXPIRED
        );
      }
      if (err instanceof jwt.JsonWebTokenError) {
        logger.warn("[Auth] JWT token invalid", {
          error: err.message,
          timestamp: new Date().toISOString()
        });
        throw new AuthError(
          401,
          "Invalid token",
          AUTH_ERROR_CODES.TOKEN_INVALID
        );
      }
      logger.error("[Auth] JWT verification failed", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        timestamp: new Date().toISOString()
      });
      throw new AuthError(
        401,
        "Token verification failed",
        AUTH_ERROR_CODES.UNAUTHORIZED
      );
    }
  }
}

export const authService = new AuthService();

export function setupAuth(app: Express): void {
  logger.info("[Auth] Starting auth setup...");

  app.set("trust proxy", 1);

  if (!dbInstance.pool) {
    throw new Error("Database pool not initialized");
  }

  const PostgresStore = connectPg(session);
  const store = new PostgresStore({
    pool: dbInstance.pool,
    createTableIfMissing: true,
    tableName: "user_sessions",
  });

  app.use(
    session({
      store,
      secret: process.env.REPL_ID!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "none",
      },
      proxy: true,
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      {
        usernameField: "username",
        passwordField: "password",
        passReqToCallback: true,
      },
      async (req, username, password, done) => {
        const requestId = req.headers["x-request-id"] as string;
        const loginType = req.body.loginType;

        try {
          logger.info("[Auth] Attempting login", {
            username,
            loginType,
            requestId,
          });

          if (!username || !password) {
            throw new AuthError(
              400,
              "Missing credentials",
              AUTH_ERROR_CODES.MISSING_CREDENTIALS,
              { requestId }
            );
          }

          // Handle OTP-based login for customers
          if (loginType === "customer") {
            logger.info("[Auth] Processing customer OTP login");

            // Format phone number consistently
            let formattedPhone = username.replace(/\D/g, "");
            if (formattedPhone.length === 10) {
              formattedPhone = `+1${formattedPhone}`;
            } else if (
              formattedPhone.length === 11 &&
              formattedPhone.startsWith("1")
            ) {
              formattedPhone = `+${formattedPhone}`;
            }

            logger.info("[Auth] Looking up user by phone", {
              formattedPhone,
              requestId,
            });

            const [user] = await db
              .select()
              .from(users)
              .where(eq(users.phoneNumber, formattedPhone))
              .limit(1);

            if (!user) {
              logger.warn("[Auth] Invalid credentials - user not found", {
                username: formattedPhone,
                requestId,
              });
              return done(
                new AuthError(
                  401,
                  "Invalid credentials",
                  AUTH_ERROR_CODES.INVALID_CREDENTIALS,
                  { requestId }
                )
              );
            }

            // Verify OTP code
            logger.info("[Auth] Verifying OTP code", {
              providedOTP: password,
              storedOTP: user.lastOtpCode,
              otpExpiry: user.otpExpiry,
              currentTime: new Date().toISOString(),
              requestId,
            });

            if (
              user.lastOtpCode !== password ||
              !user.otpExpiry ||
              new Date() > new Date(user.otpExpiry)
            ) {
              logger.warn("[Auth] Invalid or expired OTP", {
                username: formattedPhone,
                otpProvided: password,
                otpStored: user.lastOtpCode,
                otpExpiry: user.otpExpiry,
                requestId,
              });
              return done(
                new AuthError(
                  401,
                  "Invalid or expired verification code",
                  AUTH_ERROR_CODES.INVALID_CREDENTIALS,
                  { requestId }
                )
              );
            }

            // Clear OTP after use for security
            await db
              .update(users)
              .set({
                lastOtpCode: null,
                otpExpiry: null,
              })
              .where(eq(users.id, user.id));

            const userResponse: Express.User = {
              id: user.id,
              username: user.username,
              email: user.email,
              role: user.role as UserRole,
              name: user.name || undefined,
            };

            logger.info("[Auth] OTP login successful", {
              userId: user.id.toString(),
              role: user.role,
              requestId,
            });

            return done(null, userResponse);
          }

          // Regular password-based login for non-customer users
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.username, username))
            .limit(1);

          if (!user || !user.password) {
            logger.warn("[Auth] Invalid credentials - user not found", {
              username,
              requestId,
            });
            return done(
              new AuthError(
                401,
                "Invalid credentials",
                AUTH_ERROR_CODES.INVALID_CREDENTIALS,
                { requestId }
              )
            );
          }

          const isValid = await authService.comparePasswords(
            password,
            user.password
          );
          if (!isValid) {
            logger.warn("[Auth] Invalid credentials - password mismatch", {
              username,
              requestId,
            });
            return done(
              new AuthError(
                401,
                "Invalid credentials",
                AUTH_ERROR_CODES.INVALID_CREDENTIALS,
                { requestId }
              )
            );
          }

          const userResponse: Express.User = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role as UserRole,
            name: user.name || undefined,
          };

          logger.info("[Auth] Login successful", {
            userId: user.id.toString(),
            role: user.role,
            requestId,
          });

          return done(null, userResponse);
        } catch (err) {
          if (err instanceof AuthError) {
            return done(err);
          }
          logger.error("[Auth] Unexpected error during authentication", {
            error: err,
            username,
            requestId,
            stack: err instanceof Error ? err.stack : undefined,
          });
          return done(
            new AuthError(500, "Authentication failed", "AUTH_FAILED", {
              requestId,
            })
          );
        }
      }
    )
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id: number, done) => {
    db.select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then(([user]) => {
        if (!user) {
          logger.warn("[Auth] User not found during deserialization", {
            userId: id.toString(),
          });
          return done(null, false);
        }

        const userResponse: Express.User = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role as UserRole,
          name: user.name || undefined,
        };

        done(null, userResponse);
      })
      .catch((err) => {
        logger.error("[Auth] Error during user deserialization:", err);
        done(
          new AuthError(500, "Session error", AUTH_ERROR_CODES.SESSION_EXPIRED)
        );
      });
  });

  app.post("/api/login", async (req, res, next) => {
    passport.authenticate(
      "local",
      async (err: any, user: Express.User | false, info: any) => {
        if (err) {
          logger.error("[Auth] Login error:", err);
          return next(err);
        }

        if (!user) {
          logger.error("[Auth] Authentication failed:", info);
          return res
            .status(401)
            .json({ error: info.message || "Authentication failed" });
        }

        try {
          const token = await authService.generateJWT(user);
          logger.info("[Auth] Generated JWT token for user:", {
            userId: user.id.toString(),
          });

          // Use Promise to handle login sequence
          await new Promise<void>((resolve, reject) => {
            req.logIn(user, (loginErr) => {
              if (loginErr) {
                logger.error("[Auth] Session login error:", loginErr);
                reject(loginErr);
                return;
              }
              resolve();
            });
          });

          if (!res.headersSent) {
            return res.json({
              ...user,
              token,
            });
          }
        } catch (error) {
          logger.error("[Auth] Authentication error:", error);
          if (!res.headersSent) {
            return res.status(500).json({
              error:
                error instanceof Error
                  ? error.message
                  : "Authentication failed",
            });
          }
        }
      }
    )(req, res, next);
  });

  app.get("/api/user", async (req, res) => {
    try {
      if (!req.user) {
        logger.info("[Auth] Unauthorized access to /api/user");
        return res.status(401).json({ error: "Authentication required" });
      }
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ error: "Authorization token missing" });
      }
      const verifiedUser = authService.verifyJWT(token);
      logger.info("[Auth] User data retrieved:", {
        userId: verifiedUser.id.toString(),
      });
      res.json(verifiedUser);
    } catch (error) {
      logger.error("[Auth] Error retrieving user data:", error);
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to retrieve user data" });
      }
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        logger.error("[Auth] Logout error:", err);
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.sendStatus(200);
    });
  });

  logger.info("[Auth] Auth setup completed successfully");
}