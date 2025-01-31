import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

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
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          console.log('User not found:', username);
          return done(null, false, { message: "Invalid credentials" });
        }

        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          console.log('Invalid password for user:', username);
          return done(null, false, { message: "Invalid credentials" });
        }

        return done(null, user);
      } catch (err) {
        console.error('Auth error:', err);
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
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
        return res.status(400).json({ error: error.message });
      }

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, parsed.data.username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

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
          return res.status(500).json({ error: "Login failed after registration" });
        }
        res.status(201).json(user);
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: "Login failed" });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error('Login session error:', err);
          return res.status(500).json({ error: "Login failed" });
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
}